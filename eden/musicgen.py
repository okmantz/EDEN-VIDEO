"""Built-in background music: original, royalty-free loops synthesised on the fly.

Nothing here is a recording or a sample. Every track is generated from notes with additive and FM
synthesis (numpy), so there is nothing to license and nothing large to ship. Each loop is rendered
once, cached as a WAV in the data folder, and then FFmpeg repeats it under the video and ducks it
beneath the voice.

Loops are *seamless*: note tails, filters and the reverb all wrap around the end of the loop, so
the repeat point cannot be heard. Everything is deterministic (fixed seeds), so a track always
sounds the same.
"""
from __future__ import annotations

import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np

SR = 44100
TARGET_RMS_DB = -21.0          # every track is levelled to this, so one volume setting suits them all


# --------------------------------------------------------------------------- #
# Small synthesis toolkit
# --------------------------------------------------------------------------- #
def midi(n: float) -> float:
    return 440.0 * 2.0 ** ((n - 69.0) / 12.0)


class Canvas:
    """A looping stereo buffer notes are mixed into. Notes that run past the end wrap to the start."""

    def __init__(self, bpm: float, bars: int, seed: int):
        self.bpm = bpm
        self.beat = 60.0 / bpm
        self.n = int(round(bars * 4 * self.beat * SR))
        self.buf = np.zeros((self.n, 2), dtype=np.float64)
        self.rng = np.random.default_rng(seed)

    def at(self, beat: float) -> int:
        return int(round(beat * self.beat * SR))

    def add(self, sig: np.ndarray, beat: float, pan: float = 0.0, gain: float = 1.0) -> None:
        """Mix ``sig`` (mono, or stereo as (n, 2)) in at ``beat``; pan -1..1 only applies to mono."""
        start = self.at(beat) % self.n
        if sig.ndim == 1:
            left = np.cos((pan + 1) * np.pi / 4)
            right = np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * left, sig * right], axis=1)
        sig = sig * gain
        pos = 0
        while pos < len(sig):
            take = min(len(sig) - pos, self.n - start)
            self.buf[start:start + take] += sig[pos:pos + take]
            pos += take
            start = 0


def _t(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    """Envelope over exactly ``n`` samples: attack, decay to level s, hold, release at the end."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    a_n = min(a_n, n)
    env = np.ones(n)
    env[:a_n] = np.linspace(0, 1, a_n, endpoint=False) ** 1.5
    d_end = min(n, a_n + d_n)
    env[a_n:d_end] = np.linspace(1, s, d_end - a_n)
    env[d_end:] = s
    r_n = min(r_n, n)
    if r_n:
        env[n - r_n:] *= np.linspace(1, 0, r_n) ** 1.5
    return env


def pad_voice(freq: float, dur: float, harmonics: int = 5, detune: float = 0.0035, bright: float = 1.5,
              attack: float = 1.2, release: float = 1.8) -> np.ndarray:
    """Soft, slowly breathing pad note (stereo). Two slightly detuned oscillators, one per channel."""
    t = _t(dur)
    out = np.zeros((len(t), 2))
    for ch, det in enumerate((1 - detune, 1 + detune)):
        for h in range(1, harmonics + 1):
            f = freq * h * det
            if f > 9000:
                break
            out[:, ch] += np.sin(2 * np.pi * f * t + 0.7 * h * ch) / h ** bright
    wobble = 1 + 0.06 * np.sin(2 * np.pi * 0.17 * t + freq)
    return out * (adsr(len(t), attack, 0.1, 1.0, release) * wobble)[:, None]


def epiano(freq: float, dur: float, bright: float = 1.0, decay: float = 1.4) -> np.ndarray:
    """Warm electric-piano tone (two-operator FM with a quiet tine)."""
    t = _t(dur)
    idx = (1.7 * bright) * np.exp(-t / 0.45) + 0.25
    body = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * t))
    tine = 0.08 * bright * np.exp(-t / 0.06) * np.sin(2 * np.pi * freq * 7 * t + 0.4)
    env = np.exp(-t / decay) * np.minimum(1, t / 0.004)
    return (body + tine) * env


def pluck(freq: float, dur: float, tone: float = 1.0, decay: float = 0.55) -> np.ndarray:
    """Soft marimba-ish pluck: harmonics that die away faster the higher they are."""
    t = _t(dur)
    out = np.zeros(len(t))
    for h in range(1, 9):
        f = freq * h
        if f > 9000:
            break
        out += np.sin(2 * np.pi * f * t) / h ** (1.2 / tone) * np.exp(-t * (1.0 / decay + 2.2 * (h - 1) / tone))
    return out * np.minimum(1, t / 0.003)


def bell(freq: float, dur: float) -> np.ndarray:
    t = _t(dur)
    idx = 2.2 * np.exp(-t / 0.7)
    s = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * 3.5 * t))
    return s * np.exp(-t / 1.6) * np.minimum(1, t / 0.005)


def sub_bass(freq: float, dur: float, attack: float = 0.01, release: float = 0.12) -> np.ndarray:
    t = _t(dur)
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
    return s * adsr(len(t), attack, 0.05, 0.85, release)


def kick(dur: float = 0.42, f0: float = 48.0, sweep: float = 95.0) -> np.ndarray:
    t = _t(dur)
    freq = f0 + sweep * np.exp(-t / 0.035)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * np.exp(-t / 0.13) * np.minimum(1, t / 0.002)


def noise_hit(rng: np.random.Generator, dur: float, decay: float, hp: bool = True, tone: float = 0.0,
              tone_freq: float = 190.0) -> np.ndarray:
    t = _t(dur)
    n = rng.standard_normal(len(t))
    if hp:
        n = np.concatenate([[0.0], np.diff(n)]) * 0.7
    out = n * np.exp(-t / decay)
    if tone:
        out = out + tone * np.sin(2 * np.pi * tone_freq * t) * np.exp(-t / (decay * 1.4))
    return out * np.minimum(1, t / 0.0015)


def lowpass(buf: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    """Zero-phase low-pass in the frequency domain. Circular, so loops stay seamless."""
    spec = np.fft.rfft(buf, axis=0)
    f = np.fft.rfftfreq(buf.shape[0], 1 / SR)
    gain = 1.0 / (1.0 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(spec * gain[:, None], n=buf.shape[0], axis=0)


def highpass(buf: np.ndarray, cutoff: float) -> np.ndarray:
    spec = np.fft.rfft(buf, axis=0)
    f = np.fft.rfftfreq(buf.shape[0], 1 / SR)
    gain = (f / cutoff) ** 4 / (1.0 + (f / cutoff) ** 4)
    return np.fft.irfft(spec * gain[:, None], n=buf.shape[0], axis=0)


def reverb(buf: np.ndarray, rng: np.random.Generator, seconds: float, wet: float, dark: float = 3500.0) -> np.ndarray:
    """Circular convolution reverb, different (decorrelated) tail per channel."""
    n = buf.shape[0]
    t = np.arange(int(min(seconds * SR, n))) / SR
    out = np.zeros_like(buf)
    for ch in range(2):
        ir = rng.standard_normal(len(t)) * np.exp(-6.9 * t / seconds)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))     # gentle onset, no clicky pre-echo
        ir = lowpass(ir[:, None], dark, 1)[:, 0]
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
        padded = np.zeros(n)
        padded[: len(ir)] = ir
        out[:, ch] = np.fft.irfft(np.fft.rfft(buf[:, ch]) * np.fft.rfft(padded), n=n)
    return buf * (1 - wet * 0.55) + out * wet * 1.6


def soft_clip(x: np.ndarray, drive: float = 1.0) -> np.ndarray:
    return np.tanh(x * drive) / np.tanh(drive)


def finish(c: Canvas, cutoff: float, rev_s: float, rev_wet: float, dark: float = 3500.0,
           drive: float = 1.0, hp: float = 35.0) -> np.ndarray:
    x = highpass(c.buf, hp)
    x = lowpass(x, cutoff)
    x = reverb(x, c.rng, rev_s, rev_wet, dark)
    x = soft_clip(x / (np.max(np.abs(x)) + 1e-9), drive)
    # level every track to the same loudness (RMS) so the volume control means the same for all of them
    rms = float(np.sqrt(np.mean(x ** 2)))
    x *= 10 ** (TARGET_RMS_DB / 20) / (rms + 1e-9)
    peak = float(np.max(np.abs(x)))
    if peak > 0.92:
        x *= 0.92 / peak
    return x.astype(np.float32)


# --------------------------------------------------------------------------- #
# The tracks
# --------------------------------------------------------------------------- #
def _chord_pad(c: Canvas, chords: list[list[int]], bars_per_chord: float, gain: float = 1.0, octave: int = 0,
               attack: float = 1.4, release: float = 2.2, harmonics: int = 5, bright: float = 1.5) -> None:
    for i, notes in enumerate(chords):
        start = i * bars_per_chord * 4
        dur = bars_per_chord * 4 * c.beat + release
        for j, n in enumerate(notes):
            c.add(pad_voice(midi(n + 12 * octave), dur, harmonics=harmonics, attack=attack, release=release,
                            bright=bright), start, gain=gain / (1 + 0.15 * j))


def calm_horizon() -> np.ndarray:
    c = Canvas(60, 8, seed=11)
    chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 57, 59, 64]]
    _chord_pad(c, chords, 2, gain=0.30)
    for i, root in enumerate((36, 33, 29, 31)):                       # soft sub roots
        c.add(sub_bass(midi(root), 2 * 4 * c.beat + 0.6, attack=0.6, release=1.0)[:, ], i * 8, pan=0, gain=0.34)
    # a sparse, unhurried melody of bell tones from each chord
    melody = [(0, 76), (2.5, 79), (4, 74), (6, 71), (8, 72), (10.5, 76), (12, 69), (14, 67),
              (16, 69), (18, 72), (20.5, 76), (22, 74), (24, 74), (26.5, 71), (28, 67), (30, 71)]
    for k, (b, n) in enumerate(melody):
        c.add(bell(midi(n), 5.5), b, pan=-0.35 if k % 2 else 0.35, gain=0.16)
    return finish(c, cutoff=3800, rev_s=3.2, rev_wet=0.42, dark=3000)


def soft_focus() -> np.ndarray:
    c = Canvas(80, 8, seed=23)
    prog = [([50, 53, 57, 60, 64], 38), ([43, 53, 59, 62, 64], 43), ([48, 52, 55, 59, 62], 36),
            ([45, 52, 55, 59, 62], 33)] * 2                              # Dm9 G13 Cmaj9 Am9
    swing = 0.16
    for bar, (notes, root) in enumerate(prog):
        b0 = bar * 4
        for hit, vel in ((0.0, 1.0), (1.5 + swing, 0.7), (2.5, 0.55)):
            for j, n in enumerate(notes):
                c.add(epiano(midi(n), 3.0 if hit == 0 else 1.6, bright=0.9, decay=1.1), b0 + hit + j * 0.012,
                      pan=-0.3 + 0.15 * j, gain=0.17 * vel)
        c.add(sub_bass(midi(root), 1.2), b0, gain=0.5)
        c.add(sub_bass(midi(root + (7 if bar % 2 else 0)), 0.8), b0 + 2.5 + swing, gain=0.38)
        c.add(kick(), b0, gain=0.55)
        c.add(kick(), b0 + 2.5 + swing, gain=0.42)
        for rim in (1.0, 3.0):
            c.add(noise_hit(c.rng, 0.22, 0.06, hp=False, tone=0.5), b0 + rim, pan=0.1, gain=0.20)
        for e in range(8):
            off = 0.5 * e + (swing * 0.5 if e % 2 else 0)
            c.add(noise_hit(c.rng, 0.12, 0.025), b0 + off, pan=0.3, gain=0.06 if e % 2 else 0.09)
    crackle = (c.rng.random(c.n) > 0.99965) * c.rng.standard_normal(c.n) * 0.5
    c.buf += crackle[:, None] * 0.05
    return finish(c, cutoff=3400, rev_s=1.8, rev_wet=0.26, dark=2600, drive=1.3)


def bright_side() -> np.ndarray:
    c = Canvas(100, 12, seed=37)
    prog = [([55, 59, 62, 67], 43), ([50, 54, 57, 62], 38), ([52, 55, 59, 64], 40), ([48, 52, 55, 60], 36)] * 3
    for bar, (notes, root) in enumerate(prog):
        b0 = bar * 4
        for j, n in enumerate(notes):                                   # soft sustained pad underneath
            c.add(pad_voice(midi(n - 12), 4 * c.beat + 1.2, attack=0.5, release=1.0, harmonics=4),
                  b0, gain=0.10)
        order = [0, 1, 2, 3, 2, 1, 2, 3]
        for e, idx in enumerate(order):
            c.add(pluck(midi(notes[idx] + 12), 1.1, tone=1.1, decay=0.4), b0 + 0.5 * e,
                  pan=-0.4 + 0.12 * idx, gain=0.30 if e % 2 == 0 else 0.22)
        for q in range(4):
            c.add(sub_bass(midi(root), 0.38), b0 + q, gain=0.33 if q % 2 == 0 else 0.22)
        c.add(kick(), b0, gain=0.34)
        c.add(kick(), b0 + 2, gain=0.30)
        for s in range(8):
            c.add(noise_hit(c.rng, 0.09, 0.018), b0 + 0.5 * s + 0.25, pan=0.35, gain=0.05)
    return finish(c, cutoff=5200, rev_s=1.5, rev_wet=0.22, dark=4200, drive=1.1)


def night_drive() -> np.ndarray:
    c = Canvas(96, 12, seed=53)
    prog = [([57, 60, 64], 33), ([53, 57, 60], 29), ([55, 60, 64], 36), ([55, 59, 62], 31)] * 3   # Am F C G
    for bar, (notes, root) in enumerate(prog):
        b0 = bar * 4
        for n in notes:
            c.add(pad_voice(midi(n), 4 * c.beat + 1.4, harmonics=7, bright=1.1, attack=0.4, release=1.2),
                  b0, gain=0.13)
        for e in range(16):
            n = notes[(e * 5) % len(notes)] + (12 if e % 4 == 2 else 24)
            c.add(pluck(midi(n), 0.7, tone=1.4, decay=0.22), b0 + 0.25 * e, pan=-0.5 + (e % 4) * 0.33,
                  gain=0.17 if e % 4 == 0 else 0.10)
        for e in range(8):
            c.add(sub_bass(midi(root), 0.30, release=0.08), b0 + 0.5 * e, gain=0.30 if e % 2 == 0 else 0.18)
        for q in range(4):
            c.add(kick(), b0 + q, gain=0.40)
        for cl in (1.0, 3.0):
            c.add(noise_hit(c.rng, 0.25, 0.07, hp=True, tone=0.25), b0 + cl, gain=0.16)
        for e in range(8):
            c.add(noise_hit(c.rng, 0.07, 0.015), b0 + 0.5 * e + 0.25, pan=0.4, gain=0.05)
    return finish(c, cutoff=3000, rev_s=2.2, rev_wet=0.30, dark=2800, drive=1.4)


def cinematic_rise() -> np.ndarray:
    c = Canvas(70, 8, seed=71)
    chords = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 55, 60, 64]]   # Dm Bb F C/E
    _chord_pad(c, chords, 2, gain=0.26, attack=2.4, release=3.0, harmonics=9, bright=1.0)
    _chord_pad(c, chords, 2, gain=0.10, octave=1, attack=3.0, release=3.0, harmonics=5, bright=1.3)
    c.add(pad_voice(midi(38), 8 * 4 * c.beat, harmonics=4, attack=0.1, release=0.1, bright=1.8),
          0, gain=0.34)                                                    # drone on the loop's key centre
    for bar in range(0, 8, 2):
        c.add(sub_bass(midi(31 if bar % 4 else 26), 1.6, attack=0.02, release=1.2), bar * 4, gain=0.50)
    for b, n in ((0, 74), (6, 77), (8, 72), (14, 70), (16, 69), (22, 72), (24, 76), (30, 79)):
        c.add(bell(midi(n), 6.0), b, pan=0.25 if n % 2 else -0.25, gain=0.13)
    return finish(c, cutoff=3600, rev_s=4.0, rev_wet=0.46, dark=2800)


def minimal_pulse() -> np.ndarray:
    c = Canvas(110, 12, seed=89)
    prog = [([60, 64, 67, 71], 36), ([57, 60, 64, 67], 33), ([53, 57, 60, 64], 29), ([55, 59, 62, 67], 31)] * 3
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    for bar, (notes, root) in enumerate(prog):
        b0 = bar * 4
        for n in notes[:3]:
            c.add(pad_voice(midi(n - 12), 4 * c.beat + 1.0, attack=0.35, release=0.9, harmonics=4),
                  b0, gain=0.10)
        for e, idx in enumerate(pattern):
            if e in (3, 6) and bar % 2:
                continue
            c.add(pluck(midi(notes[idx] + 12), 0.5, tone=1.5, decay=0.18), b0 + 0.5 * e,
                  pan=-0.3 + 0.15 * idx, gain=0.32 if e % 4 == 0 else 0.22)
        c.add(sub_bass(midi(root), 0.5), b0, gain=0.38)
        c.add(sub_bass(midi(root + 7), 0.4), b0 + 2.5, gain=0.26)
        c.add(kick(), b0, gain=0.26)
        for s in range(4):
            c.add(noise_hit(c.rng, 0.08, 0.016), b0 + s + 0.5, pan=0.3, gain=0.05)
    return finish(c, cutoff=6000, rev_s=1.1, rev_wet=0.18, dark=5000, drive=1.1)


# --------------------------------------------------------------------------- #
# Catalog + cache
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class TrackSpec:
    key: str
    label: str
    mood: str
    blurb: str
    bpm: int
    seconds: float
    build: Callable[[], np.ndarray]


def _spec(key, label, mood, blurb, bpm, bars, build) -> TrackSpec:
    return TrackSpec(key, label, mood, blurb, bpm, round(bars * 4 * 60 / bpm, 1), build)


TRACKS: dict[str, TrackSpec] = {t.key: t for t in (
    _spec("calm_horizon", "Calm Horizon", "Ambient", "Warm, slow pads with soft bells. Calm and unobtrusive.", 60, 8, calm_horizon),
    _spec("soft_focus", "Soft Focus", "Lo-fi", "Mellow keys and a laid-back beat. Great under talking.", 80, 8, soft_focus),
    _spec("bright_side", "Bright Side", "Upbeat", "Light plucks and a gentle pulse. Positive and fresh.", 100, 12, bright_side),
    _spec("night_drive", "Night Drive", "Synth", "Moody synth pulse with a steady beat.", 96, 12, night_drive),
    _spec("cinematic_rise", "Cinematic Rise", "Cinematic", "Wide, slow strings and deep low end.", 70, 8, cinematic_rise),
    _spec("minimal_pulse", "Minimal Pulse", "Modern", "Clean, tight and neutral. Suits tutorials and tips.", 110, 12, minimal_pulse),
)}
DEFAULT_TRACK = "soft_focus"
BUILTIN_PREFIX = "builtin:"


def catalog() -> list[dict]:
    return [{"key": t.key, "id": BUILTIN_PREFIX + t.key, "label": t.label, "mood": t.mood, "blurb": t.blurb,
             "bpm": t.bpm, "duration": t.seconds} for t in TRACKS.values()]


def is_builtin(music_id: Optional[str]) -> bool:
    return bool(music_id) and str(music_id).startswith(BUILTIN_PREFIX)


def builtin_key(music_id: str) -> str:
    key = str(music_id)[len(BUILTIN_PREFIX):]
    if key not in TRACKS:
        raise KeyError(f"Unknown built-in track '{key}'")
    return key


def write_wav(path: Path, stereo: np.ndarray) -> None:
    pcm = np.clip(stereo, -1.0, 1.0)
    data = (pcm * 32767.0).astype("<i2")
    tmp = path.with_suffix(path.suffix + ".part")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    tmp.replace(path)


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def ensure_track(cache_dir: Path, key: str) -> Path:
    """Path of the track's WAV, rendering it first if this is the first time it is needed."""
    spec = TRACKS[key]
    out_dir = cache_dir / "music"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{key}-v1.wav"
    if path.exists() and path.stat().st_size > 1000:
        return path
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    with lock:
        if not (path.exists() and path.stat().st_size > 1000):
            write_wav(path, spec.build())
    return path


def warm_up(cache_dir: Path) -> None:
    """Render every track in the background at startup so the first preview or edit is instant."""
    def work() -> None:
        for key in TRACKS:
            try:
                ensure_track(cache_dir, key)
            except Exception:  # never let a music problem touch the app
                pass
    threading.Thread(target=work, name="eden-music-warmup", daemon=True).start()
