#!/usr/bin/env python3
"""
Narração para o video-motion (voz neural pt-BR "faber", do projeto Piper, rodando offline).

Uso:
  python3 narrar.py sintetizar entrada.json saida_dir   -> gera um .wav por trecho e imprime as durações (JSON)
  python3 narrar.py misturar   linha_do_tempo.json saida.wav  -> junta os trechos num único áudio

entrada.json:  [{"id": "c0", "texto": "..."}, ...]
linha_do_tempo.json: {"total": 51.2, "trechos": [{"arquivo": "...wav", "inicio": 1.5}, ...]}

O modelo é baixado sozinho na primeira vez (67 MB, GitHub k2-fsa/sherpa-onnx) para ~/.cache/seres-voz.
"""
import json, os, re, subprocess, sys, tarfile, urllib.request, wave

URL_MODELO = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2"
CACHE = os.path.expanduser(os.environ.get("VOZ_CACHE", "~/.cache/seres-voz"))
PASTA = os.path.join(CACHE, "vits-piper-pt_BR-faber-medium")
VELOCIDADE = float(os.environ.get("VOZ_VELOCIDADE", "1.1"))

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def garantir_modelo():
    if os.path.exists(os.path.join(PASTA, "pt_BR-faber-medium.onnx")):
        return
    os.makedirs(CACHE, exist_ok=True)
    tar = os.path.join(CACHE, "modelo.tar.bz2")
    print("baixando a voz (67 MB)…", file=sys.stderr)
    urllib.request.urlretrieve(URL_MODELO, tar)
    with tarfile.open(tar, "r:bz2") as t:
        t.extractall(CACHE, filter="data") if sys.version_info >= (3, 12) else t.extractall(CACHE)
    os.remove(tar)


VERSAO = "1.12.40"   # a 2.x não encontra o fonemizador das vozes Piper


def garantir_runtime():
    try:
        import sherpa_onnx
        ok = sherpa_onnx.__version__ == VERSAO
    except ImportError:
        ok = False
    try:
        import numpy  # noqa
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "numpy"], check=True)
    if not ok:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", f"sherpa-onnx=={VERSAO}"], check=True)


def limpar(texto):
    """Deixa o texto fácil de falar: sem emojis/asteriscos, datas e símbolos por extenso."""
    t = str(texto)
    t = re.sub(r"\*", "", t)
    t = re.sub(r"[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍]", "", t)
    t = re.sub(r"R\$\s*([\d.]+),(\d{2})", lambda m: f"{m.group(1).replace('.', '')} reais" + (f" e {int(m.group(2))} centavos" if m.group(2) != "00" else ""), t)
    t = re.sub(r"R\$\s*([\d.]+)", lambda m: f"{m.group(1).replace('.', '')} reais", t)
    t = re.sub(r"(\d+)\s*%", r"\1 por cento", t)
    def data(m):
        d, mes, a = int(m.group(1)), int(m.group(2)), m.group(3)
        return f"{d} de {MESES[mes - 1]}" + (f" de {a}" if a else "") if 1 <= mes <= 12 else m.group(0)
    t = re.sub(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", data, t)
    t = t.replace("&", " e ").replace("·", ", ").replace("→", ", ").replace("—", ", ").replace("–", ", ")
    t = re.sub(r"\s*/\s*", " e ", t)
    t = re.sub(r"\bPix\b", "Pics", t)
    t = re.sub(r"\s+", " ", t).strip(" ,;")
    return t


def sintetizar(entrada, saida):
    garantir_runtime(); garantir_modelo()
    import numpy as np, sherpa_onnx
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(PASTA, "pt_BR-faber-medium.onnx"),
                tokens=os.path.join(PASTA, "tokens.txt"),
                data_dir=os.path.join(PASTA, "espeak-ng-data")),
            num_threads=2, provider="cpu"),
        max_num_sentences=1)
    tts = sherpa_onnx.OfflineTts(cfg)
    os.makedirs(saida, exist_ok=True)
    itens = json.load(open(entrada, encoding="utf-8"))
    res = {}
    for it in itens:
        txt = limpar(it["texto"])
        if not txt:
            continue
        a = tts.generate(txt, sid=0, speed=VELOCIDADE)
        x = np.array(a.samples, dtype=np.float32)
        x = np.concatenate([x, np.zeros(int(0.12 * a.sample_rate), dtype=np.float32)])  # respiro no fim
        arq = os.path.join(saida, it["id"] + ".wav")
        with wave.open(arq, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate)
            w.writeframes((np.clip(x, -1, 1) * 32000).astype(np.int16).tobytes())
        res[it["id"]] = {"arquivo": arq, "duracao": len(x) / a.sample_rate, "texto": txt}
    print(json.dumps(res, ensure_ascii=False))


def misturar(linha, saida):
    import numpy as np
    d = json.load(open(linha, encoding="utf-8"))
    sr = 22050
    n = int((d["total"] + 0.5) * sr)
    y = np.zeros(n, dtype=np.float32)
    for tr in d["trechos"]:
        with wave.open(tr["arquivo"], "rb") as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
            assert w.getframerate() == sr, "taxa inesperada"
        i = int(tr["inicio"] * sr)
        y[i:i + len(x)] += x[: max(0, n - i)]
    pico = float(np.max(np.abs(y))) or 1.0
    y = np.tanh(y * (0.95 / pico) * 1.1)   # voz com volume constante, perto do teto
    with wave.open(saida, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((y * 32000).astype(np.int16).tobytes())


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("sintetizar", "misturar"):
        sys.exit(__doc__)
    (sintetizar if sys.argv[1] == "sintetizar" else misturar)(sys.argv[2], sys.argv[3])
