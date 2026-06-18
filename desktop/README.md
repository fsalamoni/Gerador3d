# Gerador3D — Desktop (versão 100% local)

App de PC (Electron) que roda **tudo offline**: a interface, o motor de jobs, o
rigging facial (Blender) e a geração 3D (modelos open-source). **Sem Firebase,
sem túnel, sem colar URL, sem login.** Os dados ficam na sua máquina.

```
┌──────────────────────── Gerador3D.exe (Electron) ─────────────────────────┐
│  Janela nativa  ──carrega──▶  http://127.0.0.1:8765  (motor local Python)  │
│                                   │                                        │
│                 ┌─────────────────┼─────────────────────────────┐         │
│                 ▼                 ▼                             ▼          │
│           SPA (React)      jobs.json + assets/         rigging (Blender)   │
│                                                        geração (TripoSR…)  │
└────────────────────────────────────────────────────────────────────────────┘
```

## O que está incluído
- **`main.js`** — Electron: sobe o motor Python, espera ficar pronto e mostra a UI.
  Na 1ª execução **cria um venv e instala as dependências sozinho**.
- **`local_server.py`** — motor: serve a SPA, guarda jobs em `jobs.json`, salva
  modelos em disco (servidos em `/files`), e faz rigging/geração reaproveitando
  `worker-rigging/` e `worker-3dgen/`.
- O frontend é compilado em **modo local** (`VITE_LOCAL=true`) — sem Firebase/Auth.

## Rodar em desenvolvimento
```bat
dev.bat
```
(build do frontend local + `npm install` + `electron .`)

## Gerar o instalador (.exe)
```bat
build.bat
```
Saída em `desktop/release/`. Dê dois cliques no instalador → o app abre e
**faz o resto sozinho**.

## Pré-requisitos na máquina (honestidade)
O instalador empacota a UI + o motor, mas **não cabe** embutir tudo:
- **Python 3.11+** (o app cria o venv e instala as libs do motor sozinho).
- **Blender 4.0+** + **VRM Add-on** + `template_face.glb` — para **rigging**
  (use `worker-rigging/setup.bat`, que automatiza isso).
- **GPU + PyTorch + um backend** (TripoSR por padrão) — para **geração 3D**
  (ver `worker-3dgen/README.md`). Sem isso, você ainda usa upload + rigging.

## Testes
```bash
python tests/test_engine.py
```

## Variáveis de ambiente
- `GR3D_PORT` (padrão 8765) · `GR3D_DATA` (pasta de dados) · `GEN_BACKEND` (padrão `triposr`)
