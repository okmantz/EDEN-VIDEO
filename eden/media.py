"""Thin, dependable wrappers around ffprobe / ffmpeg."""
from __future__ import annotations

import json
import re
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from .config import Config


class MediaError(RuntimeError):
    pass


class Cancelled(Exception):
    """Raised inside a job when the user cancels it."""


@dataclass
class MediaInfo:
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool
    has_video: bool
    video_codec: str = ""
    audio_codec: str = ""
    rotation: int = 0

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def _parse_fps(rate: str) -> float:
    try:
        num, den = rate.split("/")
        den_f = float(den)
        return float(num) / den_f if den_f else 0.0
    except Exception:
        try:
            return float(rate)
        except Exception:
            return 0.0


def probe(cfg: Config, path: Path) -> MediaInfo:
    cmd = [cfg.ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError as e:
        raise MediaError("ffprobe was not found. Install FFmpeg and make sure it is on your PATH.") from e
    except subprocess.TimeoutExpired as e:
        raise MediaError("Timed out reading the video file.") from e
    if out.returncode != 0:
        raise MediaError("This file could not be read as a video. Try an MP4, MOV, MKV or WebM.")
    data = json.loads(out.stdout or "{}")
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video" and not _is_cover_art(s)), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if v is None and a is None:
        raise MediaError("No audio or video was found in this file.")
    rotation = 0
    width = height = 0
    fps = 0.0
    vcodec = ""
    if v is not None:
        width, height = int(v.get("width", 0)), int(v.get("height", 0))
        fps = _parse_fps(v.get("avg_frame_rate") or v.get("r_frame_rate") or "0/1")
        vcodec = v.get("codec_name", "")
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rotation = int(round(float(sd["rotation"]))) % 360
        if not rotation:
            rot_tag = (v.get("tags") or {}).get("rotate")
            if rot_tag:
                try:
                    rotation = int(rot_tag) % 360
                except ValueError:
                    pass
        if rotation in (90, 270):
            width, height = height, width
    dur = 0.0
    for candidate in (data.get("format", {}).get("duration"), (v or {}).get("duration"), (a or {}).get("duration")):
        try:
            dur = float(candidate)
            if dur > 0:
                break
        except (TypeError, ValueError):
            continue
    if dur <= 0:
        raise MediaError("Could not determine the length of this video.")
    return MediaInfo(duration=dur, width=width, height=height, fps=fps, has_audio=a is not None,
                     has_video=v is not None, video_codec=vcodec,
                     audio_codec=(a or {}).get("codec_name", ""), rotation=rotation)


def _is_cover_art(stream: dict) -> bool:
    return bool((stream.get("disposition") or {}).get("attached_pic"))


_PROGRESS_RE = re.compile(r"out_time_(?:us|ms)=(\d+)")


class ProcHandle:
    """Lets another thread terminate the currently running ffmpeg."""

    def __init__(self) -> None:
        self.cancel = threading.Event()
        self.proc: Optional[subprocess.Popen] = None

    def kill(self) -> None:
        self.cancel.set()
        p = self.proc
        if p and p.poll() is None:
            try:
                p.terminate()
            except Exception:
                pass


def run_ffmpeg(cfg: Config, args: list[str], duration: Optional[float] = None,
               on_progress: Optional[Callable[[float], None]] = None,
               handle: Optional[ProcHandle] = None, cwd: Optional[Path] = None) -> None:
    """Run ffmpeg, reporting progress as a 0..1 fraction of ``duration``."""
    cmd = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
           "-progress", "pipe:1", "-nostats", *args]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
                                cwd=str(cwd) if cwd else None)
    except FileNotFoundError as e:
        raise MediaError("FFmpeg was not found. Install FFmpeg and make sure it is on your PATH.") from e
    if handle:
        handle.proc = proc
    err_chunks: list[str] = []

    def _drain_err() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            err_chunks.append(line)
            if len(err_chunks) > 400:
                del err_chunks[:200]

    t = threading.Thread(target=_drain_err, daemon=True)
    t.start()
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            if handle and handle.cancel.is_set():
                proc.terminate()
                break
            m = _PROGRESS_RE.search(line)
            if m and duration and on_progress:
                # out_time_ms is microseconds in practice despite the name
                seconds = int(m.group(1)) / 1_000_000
                on_progress(max(0.0, min(1.0, seconds / duration)))
        proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
        t.join(timeout=2)
    if handle and handle.cancel.is_set():
        raise Cancelled()
    if proc.returncode != 0:
        tail = "".join(err_chunks)[-1500:].strip()
        raise MediaError(f"FFmpeg failed: {tail or 'unknown error'}")


def detect_silences(cfg: Config, path: Path, noise_db: float, min_silence: float,
                    handle: Optional[ProcHandle] = None) -> list[tuple[float, float]]:
    """Return [(start, end)] spans of silence using ffmpeg's silencedetect."""
    cmd = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-vn", "-i", str(path), "-map", "0:a:0",
           "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError as e:
        raise MediaError("FFmpeg was not found. Install FFmpeg and make sure it is on your PATH.") from e
    if handle:
        handle.proc = proc
    _, err = proc.communicate()
    if handle and handle.cancel.is_set():
        raise Cancelled()
    if proc.returncode != 0:
        raise MediaError(f"Silence detection failed: {err[-600:]}")
    starts = [float(x) for x in re.findall(r"silence_start:\s*(-?[0-9.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*(-?[0-9.]+)", err)]
    spans: list[tuple[float, float]] = []
    for i, s in enumerate(starts):
        s = max(0.0, s)
        e = ends[i] if i < len(ends) else None
        spans.append((s, e if e is not None else float("inf")))
    return spans


def extract_audio_wav(cfg: Config, src: Path, dst: Path, handle: Optional[ProcHandle] = None) -> None:
    run_ffmpeg(cfg, ["-i", str(src), "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000",
                     "-c:a", "pcm_s16le", str(dst)], handle=handle)


def make_thumbnail(cfg: Config, src: Path, dst: Path, at: float, width: int = 360) -> None:
    run_ffmpeg(cfg, ["-ss", f"{max(at, 0):.3f}", "-i", str(src), "-frames:v", "1",
                     "-vf", f"scale={width}:-2", "-q:v", "4", str(dst)])


# --------------------------------------------------------------------------- #
# Adaptive pause detection
# --------------------------------------------------------------------------- #
LEVEL_WINDOW = 0.02          # seconds per loudness reading
_FLOOR_DB = -90.0


def read_levels(cfg: Config, path: Path, handle: Optional[ProcHandle] = None,
                on_progress: Optional[Callable[[float], None]] = None,
                duration: float = 0.0) -> list[float]:
    """Loudness (RMS, dBFS) of the first audio track in 20 ms steps.

    Reads a 16 kHz mono copy of the audio straight from FFmpeg's pipe, a chunk at a time, so even
    hours-long recordings use almost no memory."""
    import numpy as np

    sr = 16000
    win = int(sr * LEVEL_WINDOW)
    cmd = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-vn", "-i", str(path),
           "-map", "0:a:0", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError as e:
        raise MediaError("FFmpeg was not found. Install FFmpeg and make sure it is on your PATH.") from e
    if handle:
        handle.proc = proc
    levels: list[float] = []
    carry = b""
    chunk_bytes = win * 2 * 400            # 8 s of audio per read
    assert proc.stdout is not None
    try:
        while True:
            if handle and handle.cancel.is_set():
                proc.terminate()
                raise Cancelled()
            data = proc.stdout.read(chunk_bytes)
            if not data:
                break
            data = carry + data
            usable = (len(data) // (win * 2)) * win * 2
            carry = data[usable:]
            if not usable:
                continue
            x = np.frombuffer(data[:usable], dtype="<i2").astype(np.float32) / 32768.0
            rms = np.sqrt(np.mean(x.reshape(-1, win) ** 2, axis=1))
            levels.extend(np.maximum(20.0 * np.log10(rms + 1e-9), _FLOOR_DB).tolist())
            if on_progress and duration:
                on_progress(min(1.0, len(levels) * LEVEL_WINDOW / duration))
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
    if proc.returncode not in (0, None) and not levels:
        raise MediaError("Could not read the audio to find pauses.")
    return levels


def estimate_threshold(levels: list[float], fallback: float = -32.0) -> dict:
    """Pick a silence threshold that fits *this* recording.

    A fixed threshold fails on both ends: it chops quiet speakers and misses pauses on noisy tracks.
    Instead the noise floor (quietest 10%) and the speech level (loudest 10%) are measured, and the
    threshold sits a little above the floor."""
    live = sorted(v for v in levels if v > _FLOOR_DB + 1)
    if len(live) < 100:
        return {"threshold": fallback, "floor": None, "speech": None, "adaptive": False}
    floor = live[int(len(live) * 0.10)]
    speech = live[int(len(live) * 0.92)]
    if speech - floor < 10.0:      # no clear difference between talking and not talking
        return {"threshold": fallback, "floor": round(floor, 1), "speech": round(speech, 1), "adaptive": False}
    thr = floor + 0.33 * (speech - floor)
    thr = max(-52.0, min(-26.0, thr))
    return {"threshold": round(thr, 1), "floor": round(floor, 1), "speech": round(speech, 1), "adaptive": True}


def silences_from_levels(levels: list[float], threshold: float, min_silence: float,
                         min_voiced: float = 0.07) -> list[tuple[float, float]]:
    """Spans where the audio stays below ``threshold`` for at least ``min_silence`` seconds."""
    w = LEVEL_WINDOW
    n = len(levels)
    voiced = [lv > threshold for lv in levels]
    # drop clicks and bumps too short to be speech
    need = max(1, int(round(min_voiced / w)))
    i = 0
    while i < n:
        if voiced[i]:
            j = i
            while j < n and voiced[j]:
                j += 1
            if j - i < need:
                for k in range(i, j):
                    voiced[k] = False
            i = j
        else:
            i += 1
    spans: list[tuple[float, float]] = []
    i = 0
    while i < n:
        if not voiced[i]:
            j = i
            while j < n and not voiced[j]:
                j += 1
            if (j - i) * w >= min_silence:
                spans.append((round(i * w, 3), round(j * w, 3)))
            i = j
        else:
            i += 1
    return spans
