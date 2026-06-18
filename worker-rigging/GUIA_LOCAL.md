# 🪄 Guia Local do Gerador3D — passo a passo para leigos (Windows)

Este guia liga o **rigging facial** de ponta a ponta na sua máquina. O site
(https://antonov3d.web.app) já está no ar; o que roda no seu PC é só o "Worker"
que abre o Blender e gera o rosto animável (`.vrm`).

> Faça **uma vez** os passos 1–6. No dia a dia, só os passos 7–9.

---

## Pré-requisitos (o que é cada coisa)
- **Blender** — programa 3D gratuito. O Worker o usa "invisível" para gerar as
  expressões. Você já tem em `C:\Program Files\Blender Foundation\Blender 5.1`.
- **Python** — linguagem que roda o Worker (servidor local na porta 8000).
- **ngrok** — cria um "túnel" com uma URL pública que liga o site (na nuvem) ao
  seu PC. Sem ele, a nuvem não alcança seu computador.
- **VRM Add-on** — plugin do Blender que salva o arquivo `.vrm`.
- **template_face.glb** — uma "cara modelo" com as 52 expressões ARKit, que o
  Worker copia para o seu avatar. Geramos com 1 comando (passo 4).

---

## 1) Instalar o Python
1. Acesse https://www.python.org/downloads/ e baixe o Python 3.11 (ou superior).
2. Rode o instalador e, **MUITO IMPORTANTE**, marque a caixa
   **“Add Python to PATH”** antes de clicar em *Install Now*.
3. Para testar: abra o **PowerShell** (menu Iniciar → digite "PowerShell") e rode:
   ```powershell
   python --version
   ```
   Deve aparecer algo como `Python 3.11.x`.

## 2) Confirmar o Blender
Você já tem o Blender 5.1. Para confirmar, verifique se existe o arquivo:
`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
(O Worker encontra o Blender sozinho; não precisa configurar nada.)

## 3) Instalar o VRM Add-on no Blender (uma vez)
1. Baixe o add-on em https://vrm-addon-for-blender.info/ (botão de download —
   baixa um arquivo `.zip`). **Não descompacte o zip.**
2. Abra o **Blender**.
3. Menu **Edit → Preferences → Add-ons**.
4. No canto superior direito, clique na setinha (⌄) e escolha
   **Install from Disk…** (em versões antigas, é o botão **Install…**).
5. Selecione o `.zip` que você baixou e confirme.
6. Marque a caixinha ☑ ao lado de **“VRM format”** para habilitar.
7. Feche as Preferences. Pode fechar o Blender.

## 4) Gerar o template facial (uma vez)
1. Abra o **PowerShell**.
2. Entre na pasta do Worker (ajuste o caminho para onde você clonou o projeto):
   ```powershell
   cd C:\caminho\para\Gerador3d\worker-rigging
   ```
3. Rode o gerador (copie a linha inteira):
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b -P make_template.py -- --out template_face.glb
   ```
4. Ao terminar, deve existir o arquivo `template_face.glb` dentro de
   `worker-rigging`. Pronto — esse é o "molde" das 52 expressões.

   > É um template inicial (aproximado). Funciona para testar tudo. Depois você
   > pode trocar por um rosto ARKit profissional (mesmo nome de arquivo).

## 5) Instalar o ngrok (uma vez)
1. Crie uma conta grátis em https://ngrok.com e baixe o ngrok para Windows.
2. Descompacte o `ngrok.exe` em uma pasta fácil (ex.: `C:\ngrok`).
3. No site do ngrok, copie seu **authtoken** (em *Your Authtoken*).
4. No PowerShell, registre o token (uma vez):
   ```powershell
   C:\ngrok\ngrok.exe config add-authtoken SEU_TOKEN_AQUI
   ```
5. (Opcional, recomendado) Coloque o `ngrok.exe` no PATH ou na pasta
   `worker-rigging` para o `start.bat` achá-lo.

## 6) Instalar as dependências do Worker (uma vez)
No PowerShell, dentro da pasta `worker-rigging`:
```powershell
pip install -r requirements.txt
```

---

## 7) Ligar o Worker (toda vez que for usar)
Dentro da pasta `worker-rigging`, dê **dois cliques** em **`start.bat`**
(ou rode `.\start.bat` no PowerShell). Vão abrir duas janelas:
- **“Gerador3D Worker”** — o servidor. No topo ele mostra:
  - `Blender detectado em: ...`
  - `Template facial: ...\template_face.glb` (se aparecer "NÃO ENCONTRADO",
    refaça o passo 4).
- **“Gerador3D Ngrok”** — o túnel. Procure a linha **`Forwarding`**, algo como:
  `https://abcd-123.ngrok-free.app -> http://localhost:8000`
  **Copie essa URL `https://...ngrok-free.app`.**

✅ Teste rápido: abra no navegador
`https://SUA-URL-ngrok.ngrok-free.app/api/health`
Deve mostrar `{"status":"ok", ...}` com o caminho do template.

## 8) Configurar o site (uma vez, ou quando a URL do ngrok mudar)
1. Acesse https://antonov3d.web.app e faça login.
2. Vá em **Configurações** (Settings).
3. Ache o provedor **“Self-hosted”**, **ative** e cole a URL do ngrok no campo
   **Base URL**. **Salve.**
4. Mais abaixo, em **Modelos das Tarefas**, deixe o **Rigging** apontando para
   **“Local Rigging Worker”**.

   > Atenção: a URL grátis do ngrok **muda** cada vez que você reinicia o ngrok.
   > Sempre que reabrir o `start.bat`, atualize a Base URL no site.

## 9) Usar — gerar o avatar animável
1. No site, vá em **Biblioteca**.
2. Tenha um modelo 3D (`.glb`): faça **upload** de um, ou gere um em
   **Gerar** (texto→3D / imagem→3D).
3. No card do modelo, clique em **“Preparar Rig”** (ícone de osso).
4. A barrinha de progresso vai andar (o Worker está rodando o Blender). Você
   pode acompanhar o detalhe na janela "Gerador3D Worker".
5. Ao terminar, aparece um novo card **VRM**. Clique em **“Abrir Estúdio”**.
6. No **Estúdio**, ligue a webcam — seu rosto controla o avatar. 🎉

---

## 🧩 (Opcional) Geração 3D com Tripo
Além do Meshy, agora dá pra usar o **Tripo** (texto→3D e imagem→3D):
1. Crie uma conta em https://platform.tripo3d.ai e gere uma **API Key** (`tsk_`).
2. No site: **Configurações → Tripo → ative e cole a chave**.
3. Em **Modelos das Tarefas**, escolha um modelo Tripo para *Texto→3D* /
   *Imagem→3D*. Pronto, é só gerar normalmente.

---

## 🆘 Problemas comuns
- **“Template facial não encontrado”** → refaça o passo 4 (o `template_face.glb`
  precisa estar dentro de `worker-rigging`).
- **Barra de progresso não anda / “Worker unreachable”** → o `start.bat` não
  está rodando, ou a Base URL no site está desatualizada (a URL do ngrok mudou).
  Reabra o `start.bat` e atualize a Base URL.
- **Falhou com erro de VRM** → confirme o passo 3 (VRM Add-on habilitado). Sem o
  add-on, o Worker ainda gera um `.glb` com as expressões, mas o ideal é o VRM.
- **Download do `.vrm` quebrado** → é uma permissão na nuvem (IAM). Peça para
  conceder o papel **“Service Account Token Creator”** à conta de serviço das
  Cloud Functions no Google Cloud Console (só uma vez).
- **Ver o estado do Worker** → abra `http://localhost:8000/api/health`.
