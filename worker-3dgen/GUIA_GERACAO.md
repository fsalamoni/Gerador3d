# 🧠 Guia da Geração 3D local (texto/imagem → 3D) — para leigos

Aqui você liga a **geração de modelos 3D por IA** na **sua própria GPU**, sem
depender de Meshy/Tripo. O modelo usado por padrão é o **TripoSR** (open-source,
licença MIT, imagem→3D). Para **texto→3D**, o sistema gera uma imagem do texto e
depois a transforma em 3D.

> ⚠️ Precisa de uma **placa de vídeo NVIDIA** (GPU). Sem GPU dá pra rodar na CPU,
> mas é **muito lento** (minutos por modelo).

---

## 1) O que baixar/instalar antes (programas)
Instale estes 3-4 programas (uma vez):

1. **Driver NVIDIA** (atualizado) — https://www.nvidia.com/Download/index.aspx
2. **Python 3.11** — https://www.python.org/downloads/ → no instalador **marque “Add Python to PATH”**.
3. **Git** — https://git-scm.com/download/win (instalação padrão, só ir clicando “Next”).
4. **(Opcional) Microsoft C++ Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/
   → marque **“Desktop development with C++”**.
   *Não é mais obrigatório:* usamos o **PyMCubes** (wheels prontas) no lugar do
   `torchmcubes`, então a instalação funciona sem compilar. Instale o C++ apenas
   se quiser o caminho oficial do `torchmcubes`.

## 2) Preparar (1 comando, faz quase tudo sozinho)
1. Abra a pasta **`worker-3dgen`** do projeto.
2. Dê **dois cliques** em **`setup_generation.bat`**.
   Ele cria o ambiente, instala o **PyTorch (CUDA)**, baixa o **TripoSR** e
   instala tudo. *(Demora — baixa alguns GB. Tome um café.)*
3. No fim, ele mostra se a **GPU foi detectada** (`CUDA disponivel: True`).

> Tem GPU nova (RTX 50xx) e deu erro no PyTorch? Abra o `setup_generation.bat`,
> troque `cu121` por `cu124` na linha do PyTorch e rode de novo.

## 3) Ligar a geração
- Dê **dois cliques** em **`run_generation.bat`**. Ele sobe o worker em
  `http://localhost:8001`. Na **1ª geração**, baixa os pesos do modelo (uma vez).
- Teste: abra no navegador `http://localhost:8001/api/health` → deve mostrar
  `{"status":"ok","backend":"triposr","cuda":true}`.

## 4) Conectar à plataforma
Há dois cenários:

### A) Você usa o site na nuvem (antonov3d.web.app)
1. Suba também o túnel para a porta 8001 (use o `worker-rigging/tunnel.py 8001`,
   ou o `worker-gateway/start_all.bat` que junta rigging + geração num só túnel).
2. No site: **Configurações → Self-hosted → Base URL** = a URL do túnel.
3. Em **Modelos das Tarefas**, aponte **Imagem→3D** (e/ou **Texto→3D**) para um
   modelo **Self-hosted** (ex.: *TripoSR*).
4. Gere normalmente em **Gerar**.

### B) Você usa o app Desktop (100% local)
O app desktop traz um Python próprio “enxuto”. Para a geração funcionar **dentro
do app**, instale o PyTorch+TripoSR **no Python do app**. Caminho típico do
Python do app (após instalar):
`%LOCALAPPDATA%\Programs\Gerador3D\resources\engine\python\python.exe`
Rode (ajuste o caminho):
```
"%LOCALAPPDATA%\Programs\Gerador3D\resources\engine\python\python.exe" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
"%LOCALAPPDATA%\Programs\Gerador3D\resources\engine\python\python.exe" -m pip install diffusers transformers accelerate
```
e copie a pasta `TripoSR` (criada no passo 2) para
`...\resources\engine\worker-3dgen\TripoSR`.
> Mais simples: para **gerar**, use o `worker-3dgen` standalone (cenário A/Studio
> via navegador). O app desktop é ótimo para **upload + rigging + estúdio**.

## 5) Modelos melhores (opcional)
Edite a variável `GEN_BACKEND` antes de iniciar:
- `triposr` (padrão) — rápido, leve, MIT.
- `hunyuan` — texturas PBR excelentes (mais VRAM). Veja o README.
- `trellis` — qualidade SOTA, **Linux/WSL**. Veja o README.

## 🆘 Problemas comuns
- **`CUDA disponivel: False`** → driver NVIDIA desatualizado, ou instalou PyTorch
  CPU. Atualize o driver e rode o setup de novo.
- **Erro com `torchmcubes` no setup** → instale o **C++ Build Tools** (passo 1.4).
- **Sai do worker / “out of memory”** → sua GPU tem pouca VRAM; tente imagens
  menores ou um backend mais leve (`triposr`).
- **Ver estado** → `http://localhost:8001/api/health`.
