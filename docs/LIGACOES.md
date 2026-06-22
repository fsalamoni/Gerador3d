# Ligações da plataforma — guia mastigado (para leigos)

> O que **já funciona sozinho** e o que precisa de uma **"ligação"** (um passo único
> que depende da sua máquina, de uma chave de API ou de uma placa de vídeo). Escrito
> em linguagem simples. Data: 2026-06-22.

---

## 1. O que é uma "ligação"?

A plataforma tem duas partes:

- **A parte que roda no navegador** (o Studio): colocar pontos no rosto, criar
  boca/olhos/pálpebras, animar com a webcam, exportar GLB/VRM, editar cor/material.
  👉 **Isso funciona sem ligar nada.**

- **A parte pesada de IA** (transformar foto/desenho em 3D, pintar texturas
  realistas, esqueleto de corpo): roda num **programa separado (o "worker")**, que
  precisa de uma **placa de vídeo forte (GPU)** ou de uma **chave de API paga**.
  👉 **Isso precisa de "ligação".**

**Analogia:** o navegador é a bancada onde você monta e ajusta o boneco. O worker é
a "fábrica" que fabrica o boneco a partir de uma foto. A bancada já está pronta; a
fábrica você liga quando quiser (e só uma vez).

---

## 2. O que JÁ funciona sem ligar nada ✅

| Recurso | O que faz |
|---|---|
| **Rig facial procedural** | Cria 44 expressões (ARKit) em qualquer malha humanoide. |
| **Landmarks automáticos** | Acha olhos/boca/sobrancelhas na malha — **funciona com foto OU desenho**, qualquer estilo (gruda na superfície real). |
| **Boca por dentro** | Cria cavidade + dentes + língua que aparecem ao abrir a boca. |
| **Olhos** | Cria globo + íris + pupila + pálpebras que **piscam de verdade**. |
| **Cor de pele automática** | As pálpebras pegam o tom de pele do próprio modelo. |
| **Animação por webcam** | Move o rosto do avatar com a sua câmera (MediaPipe). |
| **Exportar** | Baixa o modelo em **GLB** (completo) ou **VRM** (para VRoid etc.). |

> Importante: o **rig e os landmarks funcionam igual** para 3D vindo de foto e para 3D
> vindo de desenho — porque trabalham sobre a *geometria* da malha, não sobre o estilo.

---

## 3. As ligações (cada uma é opcional e feita uma vez)

### A) Worker de geração 3D na sua GPU — *transformar foto/desenho em 3D* 🟢
- **O que desbloqueia:** gerar o modelo 3D a partir de uma imagem ou texto, **100%
  local e de graça** (sem mensalidade).
- **O que precisa:** uma placa de vídeo NVIDIA. Quanto maior a VRAM, melhor o modelo:
  - **TripoSR** — 6 GB, rápido, leve (ótimo para começar). *Padrão.*
  - **Hunyuan3D-2mini** — 12 GB, geometria de alta qualidade.
  - **TRELLIS / Hunyuan3D-2.1** — 16–24 GB, qualidade alta com textura.
- **Como ligar:** no app, tela de **Configuração → Instalar geração** (faz o download
  dos modelos no 1º uso). Licenças: TripoSR e TRELLIS são MIT (livres); Hunyuan tem
  licença Tencent (comercial com condições).
- **Funciona com desenho?** Sim — esses modelos aceitam desenhos; a qualidade varia
  conforme o modelo e o traço (rostos humanoides nítidos funcionam melhor).

### B) Texturização PBR realista (Hunyuan3D-Paint) — *pele/material bonito* 🟠
- **O que desbloqueia:** "pintar" texturas realistas (cor + relevo + brilho) sobre um
  modelo, inclusive sobre um rosto **que você já tem** (esculpido ou enviado).
- **O que precisa:** GPU forte (≥24 GB recomendado) **+ compilar dois módulos**
  (`custom_rasterizer` e `differentiable_renderer`) **+** baixar os pesos do
  Hunyuan3D-2.1. Esses módulos **não** vêm na instalação padrão.
- **Como ligar:** seguir o README do `worker-3dgen` (seção *Texturização PBR*). Depois:
  - **na geração:** marque a opção de textura (a flag `texture` já chega ao worker);
  - **num modelo existente:** a plataforma envia a tarefa `texture_mesh` (modelo +
    imagem de referência) — o código já está pronto, só precisa do worker ligado.
- **Status honesto:** o **fio de dados já está ligado e testado**; a **qualidade da
  textura** só dá para confirmar rodando numa GPU (é o "assar o bolo no forno").

### C) Provedores na nuvem (Tripo / Meshy) — *gerar sem ter GPU* 🟡
- **O que desbloqueia:** gerar 3D e rigging **sem placa de vídeo**, pela internet.
- **O que precisa:** criar conta no provedor, pegar a **chave de API**, e ter créditos
  (paga por uso). Cole a chave no app em **Configuração → Provedores** (BYOK = você usa
  sua própria chave).

### D) fal.ai / Replicate — *modelos abertos na nuvem, por chamada* 🟡
- **O que desbloqueia:** rodar TRELLIS/Hunyuan/Tripo hospedados, **sem GPU local**,
  pagando pouco por geração (~US$0,02–0,40). Bom meio-termo.
- **O que precisa:** conta + **chave de API** + créditos.

### E) ElevenLabs + Audio2Face — *avatar que fala (lip-sync)* 🟠 *(estruturado)*
- **O que desbloqueia:** digitar um texto → virar voz → mover a boca do avatar
  automaticamente (reaproveita a boca que já criamos).
- **O que precisa:** chave da ElevenLabs (voz). Para lip-sync preciso por fonema,
  o modelo Audio2Face/NeuroSync (aberto, NVIDIA).
- **Status:** **estruturado no código** (`lib/lipsync.ts`): o "flap" da boca por
  amplitude de áudio **já funciona sem chave**; a voz ElevenLabs entra ao colar a
  chave; Audio2Face é o upgrade de qualidade. Falta só a UI de "falar".

### F) Copiloto de IA (OpenRouter / Groq) — *assistente que entende foto* 🟠 *(estruturado)*
- **O que desbloqueia:** "ler" uma foto de referência e **sugerir os landmarks**
  automaticamente, em vez de clicar ponto a ponto.
- **O que precisa:** chave da OpenRouter ou Groq (Groq tem cota grátis).
- **Status:** **estruturado no código** (`lib/copilot-client.ts`): chamada de visão +
  parser dos pontos prontos e testados. Falta só colar a chave e o botão na UI.

### G) UniRig — *esqueleto de corpo inteiro* 🟠 *(estruturado)*
- **O que desbloqueia:** rig de **corpo** (ossos + pesos) para humanos e criaturas —
  hoje o VRM é só busto. Licença MIT.
- **O que precisa:** GPU + clonar o repositório UniRig no worker de rigging.
- **Status:** **estruturado no código** (`worker-rigging/unirig.py`, flag
  `method=unirig`); a CLI/qualidade são validadas na GPU.

### H) Blender — *rigging/exportar VRM no worker* 🟢
- **O que desbloqueia:** transferir blendshapes e exportar `.vrm` pelo worker de
  rigging (alternativa ao caminho do navegador).
- **O que precisa:** ter o **Blender** instalado (o app detecta sozinho).

---

## 4. Resumo: o que cada objetivo exige

| Quero… | Precisa ligar? |
|---|---|
| Ajustar rosto, criar boca/olhos/**cabelo**, presets de **criatura**, animar por webcam, exportar | **Não** ✅ |
| Mudar **cor/material** do modelo no Studio | **Não** ✅ |
| Lip-sync simples (boca acompanha um áudio) | **Não** ✅ (flap por amplitude) |
| Gerar 3D a partir de foto/desenho **de graça** | **A)** GPU local |
| Gerar 3D **sem ter GPU** | **C)** ou **D)** (chave de API) |
| Textura PBR realista | **B)** GPU + módulos compilados |
| Voz realista (ElevenLabs) | **E)** chave (código pronto) |
| Assistente que lê foto e sugere pontos | **F)** chave (código pronto) |
| Esqueleto de **corpo** inteiro | **G)** UniRig — GPU + repo (código pronto) |

---

## 5. Onde fazer cada ligação no app

- **Configuração (Setup):** instalar a geração local, escolher o backend conforme a sua
  GPU, instalar o Blender.
- **Configuração → Provedores:** colar chaves de API (Tripo, Meshy, fal.ai, etc.).
- **Studio:** tudo que não precisa de ligação (rig, anatomia, material, animação, export).

> Para detalhes técnicos de cada worker, ver: `worker-3dgen/README.md` (geração +
> texturização), `worker-rigging/` (Blender/VRM) e `docs/ROADMAP-IA.md` (plano completo
> com licenças e fontes).
