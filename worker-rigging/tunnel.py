"""
Túnel público para o Worker, com o MÍNIMO de configuração.

Prefere o **cloudflared** (Cloudflare Quick Tunnel) — que **não exige conta nem
token** — e cai para o **ngrok** se for o que estiver disponível. Detecta a URL
pública automaticamente, **copia para a área de transferência** e a imprime
bem grande, para você só colar em Configurações → Self-hosted → Base URL.

Uso:  python tunnel.py [porta]      (porta padrão: 8000)
"""

import os
import re
import sys
import shutil
import subprocess
import time
from pathlib import Path

PORT = sys.argv[1] if len(sys.argv) > 1 else "8000"
HERE = Path(__file__).parent.resolve()
URL_RE = re.compile(r"https://[A-Za-z0-9.-]+\.(?:trycloudflare\.com|ngrok[A-Za-z0-9.-]*)")


def find_exe(names):
    """Acha um executável no PATH ou ao lado dos scripts."""
    for name in names:
        p = shutil.which(name)
        if p:
            return p
        for folder in (HERE, HERE.parent, HERE.parent / "worker-3dgen"):
            cand = folder / (name if name.endswith(".exe") or os.name != "nt" else name + ".exe")
            if cand.exists():
                return str(cand)
    return None


def copy_clipboard(text):
    try:
        if os.name == "nt":
            subprocess.run("clip", input=text, text=True, shell=True)
        elif shutil.which("pbcopy"):
            subprocess.run("pbcopy", input=text, text=True)
        elif shutil.which("xclip"):
            subprocess.run(["xclip", "-selection", "clipboard"], input=text, text=True)
    except Exception:
        pass


def announce(url):
    copy_clipboard(url)
    bar = "=" * 60
    print(f"\n{bar}\n  URL PÚBLICA (já copiada para a área de transferência):\n")
    print(f"      {url}\n")
    print(f"  Cole em: Configurações → Self-hosted → Base URL\n{bar}\n", flush=True)


def run_cloudflared(exe):
    cmd = [exe, "tunnel", "--url", f"http://localhost:{PORT}", "--no-autoupdate"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, errors="replace", bufsize=1)
    announced = False
    for line in proc.stdout:
        print(line.rstrip(), flush=True)
        if not announced:
            m = URL_RE.search(line)
            if m:
                announce(m.group(0))
                announced = True
    proc.wait()


def run_ngrok(exe):
    proc = subprocess.Popen([exe, "http", PORT], stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL)
    # ngrok expõe a URL na API local 127.0.0.1:4040.
    import urllib.request
    import json
    url = None
    for _ in range(30):
        time.sleep(1)
        try:
            with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
                data = json.load(r)
            for t in data.get("tunnels", []):
                pub = t.get("public_url", "")
                if pub.startswith("https://"):
                    url = pub
                    break
            if url:
                break
        except Exception:
            continue
    if url:
        announce(url)
    else:
        print("[tunnel] Não consegui ler a URL do ngrok (veja a janela do ngrok).")
    proc.wait()


def main():
    cf = find_exe(["cloudflared"])
    if cf:
        print(f"[tunnel] Usando cloudflared: {cf} (porta {PORT})")
        run_cloudflared(cf)
        return
    ng = find_exe(["ngrok"])
    if ng:
        print(f"[tunnel] Usando ngrok: {ng} (porta {PORT})")
        run_ngrok(ng)
        return
    print("[tunnel] Nenhum túnel encontrado. Rode setup.bat (baixa o cloudflared) "
          "ou instale o ngrok.")
    sys.exit(1)


if __name__ == "__main__":
    main()
