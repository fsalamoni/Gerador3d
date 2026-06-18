/**
 * Gerador3D Desktop — processo principal do Electron.
 *
 * Ao abrir: sobe o motor local (Python FastAPI), espera ficar pronto e mostra a
 * UI apontando para http://127.0.0.1:<porta>. Ao fechar: mata o motor.
 *
 * "Faz tudo sozinho": na primeira execução, se as dependências Python não
 * estiverem prontas, cria um ambiente virtual e instala automaticamente.
 *
 * Observação: Blender e (opcional) PyTorch/modelos NÃO cabem dentro do
 * instalador — são detectados/guiados (ver setup.bat e os READMEs).
 */
const { app, BrowserWindow, dialog } = require('electron')
const { spawn, spawnSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

const PORT = process.env.GR3D_PORT || 8765
const isPackaged = app.isPackaged

// Em dev os arquivos estão ao lado; empacotado, em resources/engine.
const ENGINE_DIR = isPackaged ? path.join(process.resourcesPath, 'engine') : __dirname
const SERVER = path.join(ENGINE_DIR, 'local_server.py')
const VENV_DIR = path.join(app.getPath('userData'), 'pyengine')

let engine = null
let win = null

/** Python embutido no instalador (resources/engine/python). Zero pré-requisito. */
function bundledPython() {
  const p = process.platform === 'win32'
    ? path.join(ENGINE_DIR, 'python', 'python.exe')
    : path.join(ENGINE_DIR, 'python', 'bin', 'python3')
  return fs.existsSync(p) ? p : null
}

/** Blender portátil embutido no instalador (resources/engine/blender). */
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

/** Cria o venv e instala as dependências do motor (primeira execução). */
function bootstrapPython(sysPy) {
  const req = path.join(ENGINE_DIR, 'requirements.txt')
  spawnSync(sysPy, ['-m', 'venv', VENV_DIR], { stdio: 'inherit' })
  const py = venvPython()
  if (!py) return null
  spawnSync(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit' })
  spawnSync(py, ['-m', 'pip', 'install', '-r', req], { stdio: 'inherit' })
  return py
}

function waitForHealth(timeoutMs, cb) {
  const start = Date.now()
  const tryOnce = () => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/local/health', timeout: 2000 }, (res) => {
      if (res.statusCode === 200) return cb(true)
      retry()
    }).on('error', retry).on('timeout', retry)
  }
  const retry = () => {
    if (Date.now() - start > timeoutMs) return cb(false)
    setTimeout(tryOnce, 600)
  }
  tryOnce()
}

function startEngine() {
  // 1) Python embutido (instalador completo) → 2) venv local → 3) Python do sistema.
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

  const env = { ...process.env, GR3D_PORT: String(PORT), GR3D_ENGINE_ROOT: ENGINE_DIR }
  const blender = bundledBlender()
  if (blender) {
    env.BLENDER_PATH = blender // rigging funciona sem instalar Blender
    // O VRM Add-on é empacotado junto (instalado nesta pasta de scripts no CI).
    env.BLENDER_USER_SCRIPTS = path.join(ENGINE_DIR, 'blender', 'gr3d_scripts')
  }

  engine = spawn(py, [SERVER, '--port', String(PORT)], { cwd: ENGINE_DIR, env })
  engine.stdout.on('data', (d) => process.stdout.write(`[engine] ${d}`))
  engine.stderr.on('data', (d) => process.stderr.write(`[engine] ${d}`))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, backgroundColor: '#0b1020',
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  })
  win.loadFile(path.join(__dirname, 'loading.html'))
  waitForHealth(120000, (ok) => {
    if (ok) win.loadURL(`http://127.0.0.1:${PORT}/`)
    else dialog.showErrorBox('Falha ao iniciar', 'O motor local não respondeu a tempo. Veja o console.')
  })
}

app.whenReady().then(() => {
  startEngine()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

function killEngine() {
  if (engine && !engine.killed) {
    try { engine.kill() } catch (_) { /* noop */ }
  }
}
app.on('window-all-closed', () => { killEngine(); if (process.platform !== 'darwin') app.quit() })
app.on('quit', killEngine)
process.on('exit', killEngine)
