"""The end-to-end edit: source video -> finished, platform-ready video."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Optional

from . import ai, editor, media
from . import broll as broll_mod
from . import captions as cap_mod
from . import keywords as kw_mod
from . import timeline as tl
from .db import now
from .models import RenderOptions
from .presets import FILLER_WORDS, PACING, get_platform, get_style
from .services import Services
from .system import ffmpeg_info
from .transcript import Word, load_words, model_cached, save_words, transcribe_whisper, whisper_available


class Reporter:
    """Throttled progress writes to the database."""

    def __init__(self, svc: Services, video_id: str):
        self.svc, self.video_id = svc, video_id
        self._last = (-1.0, "")
        self._t = 0.0

    def set(self, stage: str, pct: float, message: str = "") -> None:
        pct = max(0.0, min(100.0, pct))
        t = time.time()
        if stage == self._last[1] and abs(pct - self._last[0]) < 1.0 and t - self._t < 1.5:
            return
        self._last, self._t = (pct, stage), t
        fields: dict[str, Any] = {"progress": round(pct, 1), "stage": stage}
        if message:
            fields["message"] = message
        self.svc.db.update("videos", self.video_id, fields)

    def span(self, stage: str, lo: float, hi: float):
        def cb(frac: float) -> None:
            self.set(stage, lo + (hi - lo) * frac)
        return cb


def _pretty_title(filename: str) -> str:
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return (stem[:1].upper() + stem[1:]) if stem else "Untitled video"


def get_transcript(svc: Services, project: dict, opts: RenderOptions, settings: dict,
                   rep: Reporter, handle: media.ProcHandle, work: Path) -> tuple[list[Word], str, Optional[str]]:
    """Return (words, source, warning). Reuses a cached transcript whenever valid."""
    cfg = svc.cfg
    cached_path = Path(project["transcript_path"]) if project.get("transcript_path") else None
    lang = (opts.language or settings.get("language") or "auto")
    model_size = settings.get("whisper_model") or cfg.whisper_model
    if cached_path and cached_path.exists():
        words, meta = load_words(cached_path)
        if meta.get("source") == "srt":
            return words, "srt", None
        same_lang = lang in ("auto", "") or lang == meta.get("language")
        if meta.get("source") == "whisper" and same_lang and meta.get("model") == model_size:
            return words, "whisper", None
    if not whisper_available():
        return [], "none", ("Captions and filler-word removal need a speech engine, which is not installed. "
                            "Install it with: pip install faster-whisper (then restart Eden), or upload an .srt file for this video.")
    wav = work / "speech.wav"
    media.extract_audio_wav(cfg, Path(project["path"]), wav, handle)
    first_run = not model_cached(model_size, cfg.whisper_device)
    if first_run:
        rep.set("Transcribing speech", 12, "Getting the speech model ready (first time only, this can take a few minutes)")
    try:
        words, detected = transcribe_whisper(wav, model_size, cfg.whisper_device, lang,
                                             project["duration"], rep.span("Transcribing speech", 12, 46), handle)
    except media.Cancelled:
        raise
    except Exception as e:  # model download failures, unsupported device, etc.
        return [], "none", f"Speech recognition failed ({type(e).__name__}: {str(e)[:160]}). Continuing without captions."
    if first_run:
        svc.db.update("videos", rep.video_id, {"message": ""})
    path = cfg.cache_dir / f"{project['id']}.transcript.json"
    save_words(path, words, "whisper", detected, model_size)
    svc.db.update("projects", project["id"], {"transcript_path": str(path), "transcript_source": "whisper"})
    return words, "whisper", None


def run_pipeline(svc: Services, video_id: str, handle: media.ProcHandle) -> None:
    cfg, db = svc.cfg, svc.db
    video = db.get("videos", video_id)
    if not video:
        return
    project = db.get("projects", video["project_id"])
    if not project or not Path(project["path"]).exists():
        raise media.MediaError("The original upload is no longer available.")
    opts = RenderOptions(**json.loads(video["options_json"] or "{}"))
    plat = get_platform(video["platform"])
    style = get_style(opts.style)
    settings = svc.settings()
    rep = Reporter(svc, video_id)
    warnings: list[str] = []
    notes: list[str] = []
    stats: dict[str, Any] = {}
    work = cfg.work_dir / video_id
    work.mkdir(parents=True, exist_ok=True)
    src = Path(project["path"])
    remix = opts.remix
    auto_cut = not (remix and remix.segments is not None)

    try:
        # ---- 1. read ----------------------------------------------------- #
        rep.set("Reading video", 2)
        info = media.probe(cfg, src)
        if not info.has_video:
            raise media.MediaError("This file has no video track. Eden edits videos, not audio-only files.")
        duration = info.duration
        stats["source_duration"] = round(duration, 2)
        W, H, fps = plat["width"], plat["height"], plat["fps"]

        # ---- 2. silences ------------------------------------------------- #
        pacing_key = opts.pacing or style["pacing"]
        pacing = PACING[pacing_key]
        silences: list[tuple[float, float]] = []
        if opts.remove_silence and info.has_audio and auto_cut:
            rep.set("Finding silences", 4)
            silences = media.detect_silences(cfg, src, pacing["noise_db"], pacing["min_silence"], handle)
        elif opts.remove_silence and not info.has_audio:
            warnings.append("This video has no audio track, so there were no pauses to remove.")

        # ---- 3. transcript ---------------------------------------------- #
        words: list[Word] = []
        source = "none"
        need_words = (opts.captions or opts.remove_fillers or opts.use_ai) and info.has_audio
        if need_words:
            rep.set("Transcribing speech", 12)
            words, source, warn = get_transcript(svc, project, opts, settings, rep, handle, work)
            if warn:
                warnings.append(warn)
        elif project.get("transcript_path") and Path(project["transcript_path"]).exists():
            try:  # free keyword matching for B-roll if a transcript already exists
                words, _ = load_words(Path(project["transcript_path"]))
            except Exception:
                words = []

        # ---- 4. plan the cut -------------------------------------------- #
        rep.set("Planning the edit", 47)
        if remix and remix.segments is not None:
            # The fine-tune editor's cut is the truth: use it verbatim.
            segs = [(float(s), float(e)) for s, e in remix.segments if float(e) > float(s)]
        elif opts.remove_silence and info.has_audio:
            segs = tl.speech_segments(silences, duration, pacing["keep"] / 2)
            if not segs:
                segs = [(0.0, duration)]
        else:
            segs = [(0.0, duration)]
        after_silence = sum(e - s for s, e in segs)
        filler_cuts: list[tuple[tuple[float, float], str]] = []
        if opts.remove_fillers and words and auto_cut:
            filler_cuts = tl.find_filler_cuts(words, phrases=opts.remove_filler_phrases)
            segs = tl.subtract(segs, [c for c, _ in filler_cuts])
        segs = tl.snap(segs, fps, duration)
        if sum(e - s for s, e in segs) < 1.0:
            warnings.append("The automatic cuts would have left almost nothing, so the full video was kept.")
            segs = tl.snap([(0.0, duration)], fps, duration)
            filler_cuts = []
        timeline = tl.Timeline(segs)
        out_total = timeline.total
        stats.update({
            "final_duration": round(out_total, 2),
            "silence_removed": round(duration - after_silence, 2) if opts.remove_silence else 0.0,
            "fillers_removed": len(filler_cuts),
            "cuts": max(0, len(segs) - 1),
            "pacing": pacing_key,
        })
        limit = plat.get("recommended_max_s")
        if limit and out_total > limit:
            warnings.append(f"The finished video is {int(out_total)}s. {plat['label']} works best at "
                            f"{limit}s or under; consider trimming or splitting it.")

        # ---- 5. optional AI + keywords ---------------------------------- #
        if remix and remix.caption_edits and words:
            # Text corrections from the fine-tune editor, applied to the
            # source-timed words before they are re-timed to the new cut.
            for key, text in remix.caption_edits.items():
                try:
                    idx = int(key)
                except (TypeError, ValueError):
                    continue
                if 0 <= idx < len(words) and str(text).strip():
                    w = words[idx]
                    words[idx] = Word(w.start, w.end, str(text).strip()[:80])
        out_words = timeline.map_words(words) if words else []
        caption_words = [w for w in out_words if w.norm not in FILLER_WORDS]
        transcript_text = " ".join(w.text for w in caption_words)
        keywords = kw_mod.extract_keywords(caption_words, 8) if caption_words else []
        meta: dict[str, Any] = {"ai_used": False, "transcript_source": source}
        title = (opts.title or "").strip()
        if opts.use_ai:
            if not settings.get("ollama_enabled"):
                warnings.append("AI assist was requested but Ollama is switched off in Settings. Used standard mode.")
            elif not transcript_text:
                warnings.append("AI assist needs a transcript, so standard mode was used.")
            else:
                rep.set("Planning the edit", 48, "Asking Ollama")
                result = ai.enhance(ai.Ollama(settings["ollama_url"], settings["ollama_model"]),
                                    transcript_text, plat["label"], style["label"])
                if result:
                    meta["ai_used"] = True
                    keywords = result.get("keywords") or keywords
                    meta["description"] = result.get("description", "")
                    meta["hashtags"] = result.get("hashtags") or kw_mod.hashtags(keywords)
                    title = title or result.get("title", "")
                else:
                    warnings.append("Ollama did not respond, so Eden used its built-in logic instead.")
        title = title or _pretty_title(project["filename"])
        meta.setdefault("hashtags", kw_mod.hashtags(keywords))
        meta["title"] = title
        meta["keywords"] = keywords

        # ---- 6. stage 1: cut, reframe, polish --------------------------- #
        zoom = style["zoom"] if opts.zoom is None else opts.zoom
        plan = editor.CutPlan(segments=segs, width=W, height=H, fps=fps, has_audio=info.has_audio,
                              fit=opts.framing, focus=opts.focus, zoom=zoom, grade=style["grade"],
                              clean_audio=opts.clean_audio, loudness=float(settings.get("loudness", -14)))
        cut_path = work / "cut.mp4"
        rep.set("Cutting & polishing", 50)
        editor.render_cut(cfg, src, plan, cut_path, work, rep.span("Cutting & polishing", 50, 74), handle)

        # ---- 7. captions ------------------------------------------------- #
        ass_name: Optional[str] = None
        srt_path: Optional[Path] = None
        if opts.captions and caption_words and not ffmpeg_info(cfg.ffmpeg).libass:
            notes.append("Captions were skipped because this FFmpeg build cannot draw them (it lacks libass). "
                         "Install a full FFmpeg build and try again; an .srt file was still saved.")
            srt_path = cfg.renders_dir / f"{video_id}.srt"
            srt_path.write_text(cap_mod.build_srt(caption_words), encoding="utf-8")
        elif opts.captions and caption_words:
            rep.set("Adding captions & b-roll", 75)
            chunk_style = style["caption"]
            chunks = cap_mod.group_words(caption_words, chunk_style["max_words"],
                                         chunk_style["max_chars_line"])
            brand = settings.get("brand_color", "") if settings.get("use_brand_color") else ""
            ass = cap_mod.build_ass(chunks, chunk_style, W, H, plat["safe_bottom"], plat["safe_top"],
                                    emphasis=keywords, font_override=settings.get("caption_font", ""),
                                    brand_color=brand)
            (work / "captions.ass").write_text(ass, encoding="utf-8")
            ass_name = "captions.ass"
            srt_path = cfg.renders_dir / f"{video_id}.srt"
            srt_path.write_text(cap_mod.build_srt(caption_words), encoding="utf-8")
            stats["caption_lines"] = len(chunks)
        elif opts.captions and need_words and source != "none":
            notes.append("No captions were added because the transcript was empty.")

        # ---- 8. b-roll --------------------------------------------------- #
        placements: list[broll_mod.Placement] = []
        if opts.broll != "off":
            clips = _library_clips(svc)
            key = (settings.get("pexels_key") or "").strip()
            if key and opts.stock_footage and len(clips) < 5:
                rep.set("Adding captions & b-roll", 76, "Finding stock footage")
                for kw in (keywords or [])[: 5 - len(clips)]:
                    c = broll_mod.fetch_pexels(kw, key, cfg.cache_dir / "stock", portrait=H > W)
                    if c:
                        clips.append(c)
            if clips:
                placements = broll_mod.plan_broll(out_words or caption_words, out_total, clips, opts.broll,
                                                  seed=int(video_id[:6], 16))
            else:
                notes.append("No B-roll was available. Add clips to your B-roll Library or set a Pexels key "
                             "in Settings. Punch-in zooms keep the edit visually varied meanwhile.")
        stats["broll_count"] = len(placements)
        meta["broll"] = [p.as_dict() for p in placements]

        # ---- 8b. fine-tune editor changes to b-roll ---------------------- #
        if remix and (remix.drop_broll or remix.add_broll):
            drop = {int(i) for i in remix.drop_broll if 0 <= int(i) < len(placements)}
            placements = [p for i, p in enumerate(placements) if i not in drop]
            for add in remix.add_broll:
                clip_row = db.get("broll", add.clip_id)
                if clip_row and Path(clip_row["path"]).exists():
                    clip = broll_mod.Clip(path=clip_row["path"], duration=clip_row["duration"],
                                          tags=broll_mod.parse_tags(clip_row["tags"] or ""),
                                          name=clip_row["name"])
                    length = min(add.length, clip.duration, max(0.5, out_total - add.start - 0.3))
                    if length >= 1.2:
                        placements.append(broll_mod.Placement(round(add.start, 2),
                                                            round(add.start + length, 2),
                                                            clip, 0.0, "manual"))
            stats["broll_count"] = len(placements)
            meta["broll"] = [p.as_dict() for p in placements]

        # ---- 8c. background music + sound effects ------------------------ #
        music_mix: Optional[editor.MusicMix] = None
        if opts.music_id:
            mrow = db.get("music", opts.music_id)
            if mrow and Path(mrow["path"]).exists():
                music_mix = editor.MusicMix(path=mrow["path"], volume=opts.music_volume,
                                            duck=info.has_audio)
                stats["music"] = mrow["name"]
            else:
                warnings.append("The chosen music track was missing, so the video was made without music.")
        sfx_hits: list[editor.SfxHit] = []
        zoom_on = style["zoom"] if opts.zoom is None else opts.zoom
        if opts.whoosh_sfx_id and zoom_on and segs:
            wrow = db.get("sfx", opts.whoosh_sfx_id)
            if wrow and Path(wrow["path"]).exists():
                # Punch-in zooms land on kept-segment starts (output time).
                for i, (s, e) in enumerate(segs):
                    if i > 0 and (e - s) >= 1.2:
                        sfx_hits.append(editor.SfxHit(path=wrow["path"],
                                                      at=max(0.0, timeline.offsets[i] - 0.12),
                                                      volume=0.7))
            else:
                warnings.append("The chosen whoosh sound was missing, so no whoosh effects were added.")
        if opts.pop_sfx_id and caption_words:
            prow = db.get("sfx", opts.pop_sfx_id)
            if prow and Path(prow["path"]).exists():
                emph = {kw_mod.stem(k) for k in keywords}
                hits = 0
                for w in caption_words:
                    if hits >= 12:
                        break
                    if kw_mod.stem(w.norm) in emph:
                        sfx_hits.append(editor.SfxHit(path=prow["path"], at=w.start, volume=0.55))
                        hits += 1
            else:
                warnings.append("The chosen pop sound was missing, so no pop effects were added.")
        stats["sfx_hits"] = len(sfx_hits)
        meta["segments"] = [[round(s, 3), round(e, 3)] for s, e in segs]

        # ---- 9. stage 2: compose + encode -------------------------------- #
        logo_path: Optional[Path] = None
        logo_on = settings.get("logo_enabled") if opts.logo is None else opts.logo
        candidate = svc.cfg.assets_dir / "logo.png"
        if logo_on and candidate.exists():
            logo_path = candidate
        elif logo_on:
            warnings.append("A logo was requested but none is uploaded yet (Settings > Branding).")
        fonts = cfg.assets_dir / "fonts"
        fplan = editor.FinalPlan(width=W, height=H, fps=fps, duration=out_total, vbitrate=plat["vbitrate"],
                                 broll=placements, ass_name=ass_name,
                                 fonts_dir=str(fonts) if fonts.is_dir() else None, logo=logo_path,
                                 logo_top=plat["safe_top"] + 0.01, has_audio=info.has_audio,
                                 music=music_mix, sfx=sfx_hits)
        out_path = cfg.renders_dir / f"{video_id}.mp4"
        rep.set("Adding captions & b-roll", 78)
        editor.render_final(cfg, cut_path, fplan, out_path, work, rep.span("Adding captions & b-roll", 78, 97), handle)

        # ---- 10. finish --------------------------------------------------- #
        rep.set("Finishing", 98)
        thumb = cfg.renders_dir / f"{video_id}.jpg"
        try:
            media.make_thumbnail(cfg, out_path, thumb, at=min(1.2, out_total * 0.25))
        except media.MediaError:
            thumb = None  # type: ignore[assignment]
        db.update("videos", video_id, {
            "status": "done", "progress": 100, "stage": "Done", "message": "",
            "output_path": str(out_path), "thumb_path": str(thumb) if thumb else None,
            "srt_path": str(srt_path) if srt_path else None,
            "duration": out_total, "size": out_path.stat().st_size, "title": title,
            "warnings_json": json.dumps(warnings + [], ensure_ascii=False),
            "stats_json": json.dumps(stats), "meta_json": json.dumps({**meta, "notes": notes}, ensure_ascii=False),
            "finished_at": now(),
        })
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _library_clips(svc: Services) -> list[broll_mod.Clip]:
    clips: list[broll_mod.Clip] = []
    for row in svc.db.list("broll", order="created_at ASC"):
        if Path(row["path"]).exists():
            clips.append(broll_mod.Clip(path=row["path"], duration=row["duration"],
                                        tags=broll_mod.parse_tags(row["tags"] or ""), name=row["name"]))
    return clips
