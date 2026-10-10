# PyInstaller recipe for the downloadable EDEN VIDEO app.
#   EDEN_BUNDLE_BIN=/folder/with/ffmpeg-and-ffprobe  pyinstaller packaging/eden-video.spec --noconfirm
# Run it from the repository root. The speech engine is included when faster-whisper is installed.
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

datas = [(os.path.join(ROOT, "eden", "static"), os.path.join("eden", "static"))]
binaries = []
hidden = collect_submodules("uvicorn") + collect_submodules("eden") + ["multipart", "python_multipart"]

for pkg in ("faster_whisper", "ctranslate2", "tokenizers", "onnxruntime", "av", "huggingface_hub"):
    try:
        d, b, h = collect_all(pkg)
    except Exception:
        continue
    datas += d
    binaries += b
    hidden += h

bundle_bin = os.environ.get("EDEN_BUNDLE_BIN", "")
if bundle_bin and os.path.isdir(bundle_bin):
    for name in os.listdir(bundle_bin):
        if name.lower().startswith(("ffmpeg", "ffprobe")):
            datas.append((os.path.join(bundle_bin, name), "bin"))

a = Analysis(
    [os.path.join(ROOT, "run_eden.py")],
    pathex=[ROOT], binaries=binaries, datas=datas, hiddenimports=hidden,
    excludes=["tkinter", "pytest", "ruff"], noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="eden-video", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="EDEN-VIDEO", upx=False)
