# 🪄 Guia Local do Gerador3D — agora quase tudo automático (Windows)

O site (https://antonov3d.web.app) já está no ar. No seu PC roda só o **Worker**,
que abre o Blender e gera o rosto animável (`.vrm`). Quase tudo agora é
automatizado por **dois arquivos**: `setup.bat` (uma vez) e `start.bat` (sempre).

---

## O que VOCÊ precisa fazer (resumo)
1. Instalar o **Python** (1 vez, manual — Windows não deixa automatizar com segurança).
2. Rodar **`setup.bat`** (1 vez) — ele faz o resto: dependências, instala o **VRM
   Add-on** no Blender, gera o **template facial** e baixa o **cloudflared** (túnel).
3. Rodar **`start.bat`** (sempre que for usar) — sobe o Worker e o túnel, e
   **copia a URL pública automaticamente** para você colar no site.
4. Colar essa URL em **Configurações → Self-hosted → Base URL** (1 clique).
5. Usar na **Biblioteca**: **Preparar Rig** → **Abrir Estúdio**.

Pronto. Os detalhes abaixo.

---

## 1) Instalar o Python (uma vez — único passo manual de instalação)
1. Baixe em https://www.python.org/downloads/ (3.11+).
2. No instalador, **marque “Add Python to PATH”** e clique em *Install Now*.
3. Confira: abra o **PowerShell** e rode `python --version`.

> O Blender 5.1 você já tem. O `setup.bat` o encontra sozinho.

## 2) Rodar o `setup.bat` (uma vez) — automático
1. Abra a pasta `worker-rigging` do projeto.
2. Dê **dois cliques** em **`setup.bat`** (ou rode `.\setup.bat` no PowerShell).
3. Ele vai, sozinho:
   - instalar as dependências Python do Worker;
   - **instalar e habilitar o VRM Add-on** no Blender;
   - **gerar** o `template_face.glb` (as 52 expressões ARKit);
   - **baixar o cloudflared** (túnel público que **não precisa de conta**).
4. Espere aparecer **“SETUP CONCLUIDO!”**.

> Se ele avisar que não instalou o VRM Add-on automaticamente, veja o
> **Apêndice A** (instalação manual em 5 cliques).

## 3) Rodar o `start.bat` (toda vez que for usar) — automático
1. Dê **dois cliques** em **`start.bat`**. Abrem 2 janelas:
   - **“Gerador3D Worker”** — o servidor (mostra Blender e template detectados).
   - **“Gerador3D Tunnel”** — o túnel. Ele imprime a **URL pública** num quadro
     e **já a copia para a área de transferência**. Algo como
     `https://xxxx.trycloudflare.com`.

✅ Teste: abra `http://localhost:8000/api/health` no navegador → deve mostrar
`{"status":"ok", ...}`.

## 4) Configurar o site (cole a URL — 1 vez por sessão)
1. Entre em https://antonov3d.web.app e faça login.
2. **Configurações** → provedor **“Self-hosted”** → **ative** e **cole** (Ctrl+V)
   a URL do túnel no campo **Base URL** → **Salve**.
3. Em **Modelos das Tarefas**, deixe **Rigging → “Local Rigging Worker”**.

> A URL gratuita do túnel **muda** cada vez que você reabre o `start.bat`.
> Sempre que reiniciar, cole a nova URL (ela é copiada automaticamente).

## 5) Usar — gerar o avatar animável
1. **Biblioteca** → tenha um `.glb` (faça **upload** ou gere em **Gerar**).
2. No card, clique **“Preparar Rig”** (ícone de osso) → a barra anda (ao vivo).
3. Ao terminar, aparece o card **VRM** → **“Abrir Estúdio”** → ligue a webcam. 🎉

---

## 🧩 (Opcional) Gerar 3D na sua máquina, sem Meshy/Tripo
Há um segundo worker, **`worker-3dgen`**, que gera texto→3D / imagem→3D com
modelos **open-source** (TripoSR por padrão) na sua GPU. Veja
`worker-3dgen/README.md`. Em resumo: `pip install -r requirements.txt` +
PyTorch + TripoSR, rode `start.bat` dele (porta 8001), e aponte a **Base URL**
do Self-hosted para o túnel dele quando for **gerar** (em vez de riggar).

## 🧩 (Opcional) Geração com Tripo (API)
1. Chave em https://platform.tripo3d.ai (`tsk_`).
2. **Configurações → Tripo** → ative e cole a chave.
3. Em **Modelos das Tarefas**, escolha um modelo Tripo para Texto/Imagem→3D.

---

## 🆘 Problemas comuns
- **Barra não anda / “Worker unreachable”** → `start.bat` parado, ou a Base URL
  no site está velha (a URL do túnel muda a cada reinício). Reabra e cole de novo.
- **“Template facial não encontrado”** → rode o `setup.bat` de novo.
- **Erro de VRM** → veja o Apêndice A. Sem o add-on, ainda sai um `.glb` com as
  expressões, mas o ideal é o `.vrm`.
- **Download do `.vrm` quebrado** → conceda o papel **“Service Account Token
  Creator”** à conta de serviço das Cloud Functions no Google Cloud (1 vez).
- **Ver o estado do Worker** → `http://localhost:8000/api/health`.

## Apêndice A — instalar o VRM Add-on manualmente (se o setup falhar)
1. Baixe o `.zip` em https://vrm-addon-for-blender.info/ (não descompacte).
2. Blender → **Edit → Preferences → Add-ons** → seta (⌄) → **Install from Disk…**
3. Selecione o `.zip` → marque ☑ **“VRM format”** → feche.
