# Gerador3D - Worker de Auto-Rigging Serverless

Esta pasta contém o microsserviço que processará as malhas 3D para gerar ossos e as expressões (Blendshapes/ARKit) localmente, sem depender de provedores pagos como o Meshy ou de placas de vídeo extremas como as requeridas pelo NVIDIA Omniverse.

Ele foi construído em **Python (FastAPI)** e usa a biblioteca do **Blender Headless (`bpy`)** para processar a matemática vetorial 3D.

## Como Executar Localmente na sua Máquina (Windows/GPU 16GB)

1. **Instale o Python 3.10+ e o Blender 4.0+.**
2. **Instale as dependências:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Inicie o Worker local:**
   ```bash
   python main.py
   ```
   *Ele vai iniciar na porta 8000 (http://localhost:8000)*.
4. **Habilite a conexão Externa (Ngrok):**
   Como sua plataforma Gerador3D está na nuvem (Firebase), ela precisa acessar seu PC.
   Baixe o ngrok (https://ngrok.com) e rode no terminal:
   ```bash
   ngrok http 8000
   ```
   Isso vai gerar uma URL pública (ex: `https://abcd-123.ngrok-free.app`).
5. **Configuração na Plataforma:**
   Abra as "Configurações" na plataforma Gerador3D web, vá até o provedor **"Self-hosted"**, ative-o e cole a URL do ngrok no campo de "Base URL". 
   Em seguida, na seção inferior "Modelos das Tarefas", altere o "Rigging" para usar o "Self-hosted".

Pronto! Quando você solicitar um Rigging no site, a Cloud Function Firebase enviará um comando e um link temporário para o seu PC. Seu computador fará o download do modelo, abrirá o Blender invisível, aplicará o cálculo, e fará o upload de volta para sua nuvem Firebase.
