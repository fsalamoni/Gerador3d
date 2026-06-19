/**
 * Gerador3D Desktop — processo principal do Electron.
 *
 * Ao abrir: escolhe uma porta livre, sobe o motor local (Python FastAPI),
 * espera ficar pronto e mostra a UI em http://127.0.0.1:<porta>/app.
 * Ao fechar: encerra o motor.
 *
 * Robustez:
 *  - porta livre dinâmica (evita conflito com um motor antigo travado);
 *  - espera de saúde com callback ÚNICO (sem recarregar a página em loop);
 *  - log do motor em arquivo + detecção de crash (erro claro e rápido);
 *  - links externos abrem no navegador; instância única.
 */
const { app, BrowserWindow, dialog, Menu, shell } = require('electron')
const { spawn, spawnSync } = require('child_process')
const http = require('http')
const net = require('net')
const path = require('path')
const fs = require('fs')

const isPackaged = app.isPackaged
const ENGINE_DIR = isPackaged ? path.join(process.resourcesPath, 'engine') : __dirname
const SERVER = path.join(ENGINE_DIR, 'local_server.py')
const VENV_DIR = path.join(app.getPath('userData'), 'pyengine')
const LOG_FILE = path.join(app.getPath('userData'), 'engine.log')

let engine = null
let win = null
let enginePort = 0
let engineExitInfo = null   // { code } quando o processo do motor termina
const engineLog = []        // últimas linhas (para diagnóstico)

function logEngine(chunk) {
  const text = String(chunk)
  process.stdout.write(`[engine] ${text}`)
  for (const line of text.split(/\r?\n/)) {
    if (line) engineLog.push(line)
  }
  while (engineLog.length > 200) engineLog.shift()
  try { fs.appendFileSync(LOG_FILE, text) } catch (_) { /* ignore */ }
}

function bundledPython() {
  const p = process.platform === 'win32'
    ? path.join(ENGINE_DIR, 'python', 'python.exe')
    : path.join(ENGINE_DIR, 'python', 'bin', 'python3')
  return fs.existsSync(p) ? p : null
}

function bundledBlender() {
  const p = path.join(ENGINE_DIR, 'blender', 'blender.exe')
  return fs.existsSync(p) ? p : null
}

function venvPython() {
  const p = process.platform === 'win32'
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python')
  return fs.existsSync(p) ? p : null
}

function systemPython() {
  for (const cmd of (process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'])) {
    try {
      const r = spawnSync(cmd, ['--version'])
      if (r.status === 0 || (r.stdout && r.stdout.length)) return cmd
    } catch (_) { /* next */ }
  }
  return null
}

function bootstrapPython(sysPy) {
  const req = path.join(ENGINE_DIR, 'requirements.txt')
  spawnSync(sysPy, ['-m', 'venv', VENV_DIR], { stdio: 'inherit' })
  const py = venvPython()
  if (!py) return null
  spawnSync(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit' })
  spawnSync(py, ['-m', 'pip', 'install', '-r', req], { stdio: 'inherit' })
  return py
}

/** Acha uma porta TCP livre em 127.0.0.1. */
function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(8765)) // fallback
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

/** Espera o /api/local/health responder 200. Resolve UMA vez (true/false). */
function waitForHealth(port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now()
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }

    const scheduleRetry = () => {
      if (settled) return
      if (engineExitInfo) return finish(false)          // motor caiu → falha rápida
      if (Date.now() - start > timeoutMs) return finish(false)
      setTimeout(poll, 800)
    }

    const poll = () => {
      if (settled) return
      let retried = false
      const retry = () => { if (!retried) { retried = true; scheduleRetry() } }
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/local/health', timeout: 3000 },
        (res) => {
          res.resume() // drena a resposta
          if (res.statusCode === 200) return finish(true)
          retry()
        },
      )
      req.on('error', retry)
      req.on('timeout', () => { req.destroy(); retry() })
    }
    poll()
  })
}

function startEngine(port) {
  let py = bundledPython() || venvPython()
  if (!py) {
    const sysPy = systemPython()
    if (!sysPy) {
      dialog.showErrorBox('Python não encontrado',
        'Instale o Python 3.11+ (marque "Add Python to PATH") e abra o app de novo.')
      app.quit()
      return
    }
    py = bootstrapPython(sysPy) || sysPy
  }

  const env = {
    ...process.env,
    GR3D_PORT: String(port),
    GR3D_ENGINE_ROOT: ENGINE_DIR,
    PYTHONUTF8: '1',            // evita UnicodeEncodeError no Windows (cp1252)
    PYTHONIOENCODING: 'utf-8',
  }
  const blender = bundledBlender()
  if (blender) {
    env.BLENDER_PATH = blender
    env.BLENDER_USER_SCRIPTS = path.join(ENGINE_DIR, 'blender', 'gr3d_scripts')
  }

  try { fs.writeFileSync(LOG_FILE, `=== Gerador3D engine (porta ${port}) ===\n`) } catch (_) { /* ignore */ }
  engine = spawn(py, [SERVER, '--port', String(port)], { cwd: ENGINE_DIR, env })
  engine.stdout.on('data', logEngine)
  engine.stderr.on('data', logEngine)
  engine.on('exit', (code) => { engineExitInfo = { code } })
  engine.on('error', (err) => { engineExitInfo = { code: -1, err: String(err) } })
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, backgroundColor: '#0b1020',
    title: 'Gerador3D', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadFile(path.join(__dirname, 'loading.html'))

  // Primeira execução pode ser lenta (antivírus + carga de módulos). Esperamos
  // bastante, mas falhamos rápido se o motor travar (engineExitInfo).
  const ok = await waitForHealth(enginePort, 240000)
  if (!win || win.isDestroyed()) return

  if (ok) {
    win.loadURL(`http://127.0.0.1:${enginePort}/app`) // carrega o app UMA vez
    return
  }

  // Não respondeu. Se o motor caiu, mostramos o erro real (com o fim do log).
  const tail = engineLog.slice(-12).join('\n')
  if (engineExitInfo) {
    dialog.showErrorBox(
      'O motor local não iniciou',
      `O processo do motor encerrou (código ${engineExitInfo.code}).\n\n` +
      `Log (${LOG_FILE}):\n${tail || '(vazio)'}`,
    )
  } else {
    // Vivo, porém lento: tenta carregar mesmo assim (a UI se reconecta sozinha).
    win.loadURL(`http://127.0.0.1:${enginePort}/app`)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    enginePort = await getFreePort()
    startEngine(enginePort)
    await createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
  })
}

function killEngine() {
  if (engine && !engine.killed) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(engine.pid), '/f', '/t'])
      else engine.kill()
    } catch (_) { /* noop */ }
  }
}
app.on('window-all-closed', () => { killEngine(); if (process.platform !== 'darwin') app.quit() })
app.on('quit', killEngine)
process.on('exit', killEngine)
