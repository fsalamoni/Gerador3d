# Gerador3D — Gateway local (1 URL para tudo)

Junta os dois workers locais atrás de **uma única porta (8080)**, para você
expor **um só túnel** e colar **uma só Base URL** no site:

```
Internet (site na nuvem)
        │  (1 túnel cloudflared)
        ▼
   Gateway :8080
     ├── /api/rig       → Worker de Rigging   (:8000, Blender)
     └── /api/generate  → Worker de Geração   (:8001, modelos open-source)
```

Sem o gateway, você teria que trocar a Base URL conforme a tarefa. Com ele,
**uma URL serve rigging e geração ao mesmo tempo**.

## Como usar (Windows)
1. Garanta o setup dos workers (ver `worker-rigging/GUIA_LOCAL.md` e, para
   geração, `worker-3dgen/README.md`).
2. Dê **dois cliques** em **`start_all.bat`** — ele sobe: rigging (8000),
   geração (8001), gateway (8080) e o túnel (→8080).
3. Cole a URL pública (copiada automaticamente) em
   **Configurações → Self-hosted → Base URL**.

> Só vai usar rigging? Pode fechar a janela "Geração (8001)" — o gateway
> continua servindo o rigging normalmente.

## Variáveis de ambiente
- `GATEWAY_PORT` (padrão 8080)
- `RIG_URL` (padrão http://localhost:8000)
- `GEN_URL` (padrão http://localhost:8001)

## Diagnóstico
```bash
python ..\worker-rigging\doctor.py
```
