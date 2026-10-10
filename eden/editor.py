"""FFmpeg render stages.

Stage 1 (``render_cut``): cut the source down to the kept segments, reframe it to
the platform's aspect ratio, add punch-in zooms, colour grade and polish audio.

Stage 2 (``render_final``): overlay B-roll cutaways, burn in captions, add an
optional logo and encode to the platform's delivery spec.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from .broll import Placement
from .config import Config
from .media import ProcHandle, run_ffmpeg

Span = tuple[float, float]
AUDIO_FADE = 0.012
ZOOM_LEVELS = (1.0, 1.12, 1.0, 1.2)


@dataclass
class CutPlan:
    segments: list[Span]
    width: int
    height: int
    fps: int
    has_audio: bool
    fit: str = "fill"          # fill = crop to fill, fit = whole frame over blurred backdrop
    focus: float = 0.5         # 0 (left) .. 1 (right) crop window position
    zoom: bool = False
    grade: str = ""
    clean_audio: bool = True
    loudness: float = -14.0

    @property
    def total(self) -> float:
        return sum(e - s for s, e in self.segments)


def _f(x: float) -> str:
    return f"{x:.4f}".rstrip("0").rstrip(".") or "0"


def reframe_filter(plan: CutPlan) -> str:
    """Filter chain (input label implicit) that outputs exactly WxH, yuv420p-friendly."""
    W, H = plan.width, plan.height
    if plan.fit == "fit":
        # whole frame centred over a blurred, darkened copy of itself
        return (f"split[bgsrc][fgsrc];"
                f"[bgsrc]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                f"scale={W // 8}:-2,gblur=sigma=6,scale={W}:{H},eq=brightness=-0.12:saturation=1.1[bg];"
                f"[fgsrc]scale={W}:{H}:force_original_aspect_ratio=decrease[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1")
    fx = min(1.0, max(0.0, plan.focus))
    return (f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x=(iw-{W})*{_f(fx)}:y=(ih-{H})/2,setsar=1")


def build_cut_graph(plan: CutPlan) -> str:
    segs = plan.segments
    n = len(segs)
    W, H = plan.width, plan.height
    lines: list[str] = []
    lines.append(f"[0:v]fps={plan.fps},{reframe_filter(plan)},format=yuv420p[base]")
    if n == 1:
        lines.append("[base]null[bs0]")
    else:
        lines.append(f"[base]split={n}" + "".join(f"[bs{i}]" for i in range(n)))
    if plan.has_audio:
        if n == 1:
            lines.append("[0:a]anull[as0]")
        else:
            lines.append(f"[0:a]asplit={n}" + "".join(f"[as{i}]" for i in range(n)))

    zi = 0
    for i, (s, e) in enumerate(segs):
        d = e - s
        vchain = f"[bs{i}]trim=start={_f(s)}:end={_f(e)},setpts=PTS-STARTPTS"
        if plan.zoom and i > 0 and d >= 1.2:
            z = ZOOM_LEVELS[zi % len(ZOOM_LEVELS)]
            zi += 1
            if z > 1.0:
                vchain += (f",crop=w=trunc(iw/{z}/2)*2:h=trunc(ih/{z}/2)*2:x=(iw-out_w)/2:y=(ih-out_h)*0.35,"
                           f"scale={W}:{H}:flags=bicubic,setsar=1")
        lines.append(vchain + f"[v{i}]")
        if plan.has_audio:
            fade = min(AUDIO_FADE, d / 4)
            lines.append(f"[as{i}]atrim=start={_f(s)}:end={_f(e)},asetpts=PTS-STARTPTS,"
                         f"afade=t=in:st=0:d={_f(fade)},afade=t=out:st={_f(d - fade)}:d={_f(fade)}[a{i}]")

    if plan.has_audio:
        lines.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vc][ac]")
    else:
        lines.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[vc]")

    vpost = [plan.grade] if plan.grade else []
    vpost.append("format=yuv420p")
    lines.append("[vc]" + ",".join(vpost) + "[vout]")

    if plan.has_audio:
        achain = ["highpass=f=60"]
        if plan.clean_audio:
            achain += ["afftdn=nr=10:nf=-32",
                       "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2"]
        achain += [f"loudnorm=I={_f(plan.loudness)}:TP=-1.5:LRA=11", "aresample=48000"]
        lines.append("[ac]" + ",".join(achain) + "[aout]")
    return ";\n".join(lines) + "\n"


def render_cut(cfg: Config, src: Path, plan: CutPlan, dst: Path, work: Path,
               on_progress: Optional[Callable[[float], None]] = None,
               handle: Optional[ProcHandle] = None) -> None:
    script = work / "cut_graph.txt"
    script.write_text(build_cut_graph(plan), encoding="utf-8")
    args = ["-i", str(src), "-filter_complex_script", str(script), "-map", "[vout]"]
    if plan.has_audio:
        args += ["-map", "[aout]"]
    args += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", "-pix_fmt", "yuv420p", "-r", str(plan.fps)]
    if plan.has_audio:
        args += ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"]
    args += ["-movflags", "+faststart", str(dst)]
    run_ffmpeg(cfg, args, duration=plan.total, on_progress=on_progress, handle=handle)


# --------------------------------------------------------------------------- #
# Stage 2
# --------------------------------------------------------------------------- #
@dataclass
class FinalPlan:
    width: int
    height: int
    fps: int
    duration: float
    vbitrate: str = "9M"
    broll: list[Placement] = field(default_factory=list)
    ass_name: Optional[str] = None       # filename inside the work dir
    fonts_dir: Optional[str] = None
    logo: Optional[Path] = None
    logo_top: float = 0.08
    has_audio: bool = True


_SAFE_PATH = re.compile(r"^[A-Za-z0-9_./\-]+$")


def build_final_graph(plan: FinalPlan) -> str:
    W, H = plan.width, plan.height
    lines: list[str] = ["[0:v]format=yuv420p[b0]"]
    cur = "b0"
    for i, p in enumerate(plan.broll, start=1):
        dur = p.end - p.start
        fade = min(0.2, dur / 4)
        lines.append(
            f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={plan.fps},setsar=1,"
            f"format=yuva420p,setpts=PTS-STARTPTS+{_f(p.start)}/TB,"
            f"fade=t=in:st={_f(p.start)}:d={_f(fade)}:alpha=1,"
            f"fade=t=out:st={_f(p.end - fade)}:d={_f(fade)}:alpha=1[br{i}]")
        lines.append(f"[{cur}][br{i}]overlay=enable='between(t,{_f(p.start)},{_f(p.end)})':eof_action=pass:format=auto[b{i}]")
        cur = f"b{i}"
    if plan.ass_name:
        opt = f"ass=filename={plan.ass_name}"
        if plan.fonts_dir and _SAFE_PATH.match(plan.fonts_dir):
            opt += f":fontsdir={plan.fonts_dir}"
        lines.append(f"[{cur}]{opt}[cap]")
        cur = "cap"
    if plan.logo is not None:
        li = len(plan.broll) + 1
        lines.append(f"[{li}:v]scale={int(0.16 * W)}:-1,format=rgba,colorchannelmixer=aa=0.88[lg]")
        lines.append(f"[{cur}][lg]overlay=W-w-{int(0.04 * W)}:{int(plan.logo_top * H)}[lgo]")
        cur = "lgo"
    lines.append(f"[{cur}]format=yuv420p[vout]")
    return ";\n".join(lines) + "\n"


def render_final(cfg: Config, cut_path: Path, plan: FinalPlan, dst: Path, work: Path,
                 on_progress: Optional[Callable[[float], None]] = None,
                 handle: Optional[ProcHandle] = None) -> None:
    script = work / "final_graph.txt"
    script.write_text(build_final_graph(plan), encoding="utf-8")
    args: list[str] = ["-i", str(cut_path)]
    for p in plan.broll:
        args += ["-ss", _f(p.clip_start), "-t", _f(p.end - p.start + 0.05), "-i", p.clip.path]
    if plan.logo is not None:
        args += ["-i", str(plan.logo)]
    args += ["-filter_complex_script", str(script), "-map", "[vout]"]
    if plan.has_audio:
        args += ["-map", "0:a", "-c:a", "copy"]
    maxrate = plan.vbitrate
    try:
        bufsize = f"{int(maxrate.rstrip('M')) * 2}M"
    except ValueError:
        bufsize = "20M"
    args += ["-c:v", "libx264", "-preset", cfg.x264_preset, "-crf", "19", "-maxrate", maxrate,
             "-bufsize", bufsize, "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(plan.fps),
             "-t", _f(plan.duration), "-movflags", "+faststart", str(dst)]
    run_ffmpeg(cfg, args, duration=plan.duration, on_progress=on_progress, handle=handle, cwd=work)
