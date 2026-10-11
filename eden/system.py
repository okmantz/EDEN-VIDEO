"""Finding FFmpeg, checking the machine, and telling people exactly how to fix problems.

Everything here uses only the standard library so it also works before the
rest of Eden's dependencies are installed.
"""
from __future__ import annotations

import os
import platform
import shutil
import socket
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------- OS

def detect_os() -> str:
    """One of: windows, macos, debian, fedora, arch, suse, alpine, linux."""
    system = platform.system().lower()
    if system == "windows":
        return "windows"
    if system == "darwin":
        return "macos"
    ids: list[str] = []
    try:
        for line in Path("/etc/os-release").read_text().splitlines():
            if line.startswith(("ID=", "ID_LIKE=")):
                ids += line.split("=", 1)[1].strip().strip('"').lower().split()
    except OSError:
        pass
    for names, family in (
        (("debian", "ubuntu", "linuxmint", "pop", "raspbian", "kali", "zorin", "elementary"), "debian"),
        (("fedora", "rhel", "centos", "rocky", "almalinux", "amzn"), "fedora"),
        (("arch", "manjaro", "endeavouros"), "arch"),
        (("suse", "opensuse", "sles"), "suse"),
        (("alpine",), "alpine"),
    ):
        if any(i in names for i in ids):
            return family
    return "linux"


@dataclass(frozen=True)
class InstallPlan:
    """How to install FFmpeg on this machine."""
    os_name: str
    command: str                 # human-readable, copy-pasteable
    argv: tuple[str, ...] | None  # runnable without a shell, or None if it needs manual steps
    note: str = ""


def ffmpeg_install_plan(os_name: str | None = None, *, is_root: bool | None = None,
                        have: callable = shutil.which) -> InstallPlan:
    os_name = os_name or detect_os()
    if is_root is None:
        is_root = hasattr(os, "geteuid") and os.geteuid() == 0
    sudo: tuple[str, ...] = () if is_root or os_name in ("windows", "macos") else ("sudo",)

    def plan(*argv: str, note: str = "") -> InstallPlan:
        full = (*sudo, *argv) if os_name not in ("windows", "macos") else argv
        return InstallPlan(os_name, " ".join(full), tuple(full), note)

    if os_name == "windows":
        if have("winget"):
            return InstallPlan(os_name, "winget install --id Gyan.FFmpeg -e",
                               ("winget", "install", "--id", "Gyan.FFmpeg", "-e",
                                "--accept-package-agreements", "--accept-source-agreements"),
                               "Close and reopen this window afterwards so Windows picks up the new PATH.")
        if have("choco"):
            return InstallPlan(os_name, "choco install ffmpeg -y", ("choco", "install", "ffmpeg", "-y"))
        if have("scoop"):
            return InstallPlan(os_name, "scoop install ffmpeg", ("scoop", "install", "ffmpeg"))
        return InstallPlan(os_name, "Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/ "
                           "(\"release essentials\"), unzip it, and add its bin folder to PATH.", None)
    if os_name == "macos":
        if have("brew"):
            return InstallPlan(os_name, "brew install ffmpeg", ("brew", "install", "ffmpeg"))
        return InstallPlan(os_name, "Install Homebrew from https://brew.sh, then run: brew install ffmpeg", None)
    if os_name == "debian":
        pre = "" if is_root else "sudo "
        cmd = f"{pre}apt-get update && {pre}apt-get install -y ffmpeg"
        return InstallPlan(os_name, cmd, ("sh", "-c", cmd))
    if os_name == "fedora":
        return plan("dnf", "install", "-y", "ffmpeg-free",
                    note="If you use RPM Fusion, `ffmpeg` works as well.")
    if os_name == "arch":
        return plan("pacman", "-S", "--noconfirm", "ffmpeg")
    if os_name == "suse":
        return plan("zypper", "--non-interactive", "install", "ffmpeg")
    if os_name == "alpine":
        return plan("apk", "add", "ffmpeg")
    return InstallPlan(os_name, "Install the `ffmpeg` package with your distribution's package manager.", None)


# ------------------------------------------------------------------- binaries

def is_frozen() -> bool:
    """True inside the downloadable app built with PyInstaller."""
    return bool(getattr(sys, "frozen", False))


def bundle_dirs() -> list[Path]:
    """Folders where the downloadable app keeps its own copy of FFmpeg."""
    if not is_frozen():
        return []
    exe_dir = Path(sys.executable).resolve().parent
    base = Path(getattr(sys, "_MEIPASS", exe_dir))
    return [base / "bin", exe_dir / "bin", exe_dir]


def _candidate_dirs() -> list[Path]:
    home = Path.home()
    dirs = [Path("/opt/homebrew/bin"), Path("/usr/local/bin"), Path("/usr/bin"),
            Path("/snap/bin"), home / ".local" / "bin"]
    if platform.system() == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        dirs += [Path(local) / "Microsoft" / "WinGet" / "Links", Path(pf) / "ffmpeg" / "bin",
                 Path(r"C:\ffmpeg\bin"), Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "chocolatey" / "bin",
                 home / "scoop" / "shims"]
        winget_pkgs = Path(local) / "Microsoft" / "WinGet" / "Packages"
        if winget_pkgs.is_dir():
            try:
                for p in winget_pkgs.glob("Gyan.FFmpeg*/ffmpeg-*/bin"):
                    dirs.append(p)
            except OSError:
                pass
    return dirs


def locate_binary(name: str, override: str = "") -> str | None:
    """Find `name` (ffmpeg / ffprobe). Honors an override, PATH, then common install spots
    (so a fresh `winget`/`brew` install works even before the terminal is restarted)."""
    if override:
        found = shutil.which(override)
        if found:
            return found
        if Path(override).is_file():
            return override
    exe = name + (".exe" if platform.system() == "Windows" else "")
    for d in bundle_dirs():          # the copy shipped inside the downloadable app wins
        if (d / exe).is_file():
            return str(d / exe)
    found = shutil.which(name)
    if found:
        return found
    for d in _candidate_dirs():
        p = d / exe
        if p.is_file():
            return str(p)
    return None


@dataclass
class FfmpegInfo:
    path: str = ""
    version: str = ""
    libx264: bool = False
    libass: bool = False
    problems: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        return bool(self.path) and self.libx264


_graph_style: dict[str, bool] = {}


def uses_slash_options(ffmpeg: str) -> bool:
    """True for FFmpeg 7 and newer (and git builds), which read a filter graph from a file with
    `-/filter_complex FILE`. Older versions use `-filter_complex_script FILE`, which FFmpeg 8 removed."""
    if ffmpeg not in _graph_style:
        import re
        first = (_run([ffmpeg, "-hide_banner", "-version"]).splitlines() or [""])[0]
        m = re.search(r"version\s+(?:n)?(\d+)\.", first, re.I)
        _graph_style[ffmpeg] = bool(m and int(m.group(1)) >= 7) or bool(re.search(r"version\s+(N-|git-|\d{4,})", first))
    return _graph_style[ffmpeg]


def filter_graph_args(ffmpeg: str, script) -> list[str]:
    """The FFmpeg arguments that load a complex filter graph from `script`, for any FFmpeg version."""
    if uses_slash_options(ffmpeg):
        return ["-/filter_complex", str(script)]
    return ["-filter_complex_script", str(script)]


def _run(argv: list[str], timeout: float = 15) -> str:
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, errors="replace")
        return (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return ""


def ffmpeg_info(ffmpeg: str) -> FfmpegInfo:
    """What this FFmpeg build can do. Eden needs libx264; captions need the `ass` filter (libass)."""
    info = FfmpegInfo()
    path = shutil.which(ffmpeg) or (ffmpeg if Path(ffmpeg).is_file() else "")
    if not path:
        info.problems.append("FFmpeg was not found.")
        return info
    info.path = path
    first = _run([path, "-hide_banner", "-version"]).splitlines()
    info.version = first[0].strip() if first else ""
    if not info.version:
        info.problems.append("FFmpeg did not run.")
        return info
    info.libx264 = " libx264 " in _run([path, "-hide_banner", "-encoders"])
    filters = _run([path, "-hide_banner", "-filters"]).splitlines()
    info.libass = any(len(ln.split()) > 1 and ln.split()[1] == "ass" for ln in filters)
    if not info.libx264:
        info.problems.append("This FFmpeg has no H.264 encoder (libx264); install a full build.")
    if not info.libass:
        info.problems.append("This FFmpeg cannot burn captions (no libass); videos will render without captions.")
    return info


# ---------------------------------------------------------------------- network

def port_is_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
        except OSError:
            return False
    return True


def pick_port(host: str, preferred: int, tries: int = 20) -> int:
    """`preferred` if free, else the next free port. Returns `preferred` if none found."""
    for p in range(preferred, preferred + tries):
        if port_is_free(host, p):
            return p
    return preferred


def lan_address() -> str:
    """This machine's address on the local network (best effort)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # no packet is sent
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


# ----------------------------------------------------------------------- doctor

@dataclass
class Check:
    name: str
    status: str          # ok | warn | fail
    detail: str
    fix: str = ""


def run_checks(cfg) -> list[Check]:
    """Everything Eden needs, as a list the CLI and the Settings page can show."""
    out: list[Check] = []
    v = sys.version_info
    out.append(Check("Python", "ok" if v >= (3, 10) else "fail", f"{v.major}.{v.minor}.{v.micro}",
                     "" if v >= (3, 10) else "Eden needs Python 3.10 or newer: https://www.python.org/downloads/"))

    info = ffmpeg_info(cfg.ffmpeg)
    if not info.path:
        plan = ffmpeg_install_plan()
        out.append(Check("FFmpeg", "fail", "not found", plan.command))
    elif not info.usable:
        out.append(Check("FFmpeg", "fail", "; ".join(info.problems), ffmpeg_install_plan().command))
    else:
        out.append(Check("FFmpeg", "ok", info.version.replace("ffmpeg version ", "").split(" Copyright")[0]))
        if not info.libass:
            out.append(Check("Captions (libass)", "warn", "this FFmpeg build cannot burn captions",
                             "Install a full FFmpeg build (on Windows: winget install --id Gyan.FFmpeg -e)."))
    probe = shutil.which(cfg.ffprobe) or (cfg.ffprobe if Path(cfg.ffprobe).is_file() else "")
    out.append(Check("FFprobe", "ok" if probe else "fail", probe or "not found",
                     "" if probe else "It ships with FFmpeg; reinstalling FFmpeg fixes this."))

    try:
        import faster_whisper  # noqa: F401
        out.append(Check("Speech engine", "ok", f"faster-whisper installed (model: {cfg.whisper_model})"))
    except Exception:
        out.append(Check("Speech engine", "warn",
                         "not installed: captions and 'um' removal need it (or an uploaded .srt)",
                         "pip install faster-whisper   (or run: python scripts/bootstrap.py)"))

    try:
        cfg.ensure_dirs()
        probe_file = cfg.data_dir / ".write-test"
        probe_file.write_text("ok")
        probe_file.unlink()
        free_gb = shutil.disk_usage(cfg.data_dir).free / 1e9
        out.append(Check("Data folder", "ok" if free_gb >= 2 else "warn",
                         f"{cfg.data_dir}  ({free_gb:.0f} GB free)",
                         "" if free_gb >= 2 else "Low disk space: renders need several GB of room."))
    except OSError as e:
        out.append(Check("Data folder", "fail", f"{cfg.data_dir}: {e}", "Set EDEN_DATA_DIR to a writable folder."))

    free = port_is_free(cfg.host, cfg.port)
    out.append(Check("Port", "ok" if free else "warn",
                     f"{cfg.port} is {'free' if free else 'in use'}",
                     "" if free else "Eden will use the next free port, or set EDEN_PORT."))
    return out


def format_checks(checks: list[Check]) -> str:
    icon = {"ok": "[ ok ]", "warn": "[warn]", "fail": "[FAIL]"}
    lines = []
    for c in checks:
        lines.append(f"  {icon[c.status]} {c.name}: {c.detail}")
        if c.fix and c.status != "ok":
            lines.append(f"         fix: {c.fix}")
    return "\n".join(lines)
