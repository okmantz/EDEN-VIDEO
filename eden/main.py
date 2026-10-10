"""EDEN VIDEO - FastAPI application."""
from __future__ import annotations

import base64
import json
import re
import secrets
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import APP_NAME, TAGLINE, __version__
from . import timeline as tl
from .ai import Ollama
from .config import Config, load_config
from .db import Database, new_id, now
from .jobs import JobManager
from .media import MediaError, detect_silences, make_thumbnail, probe, run_ffmpeg
from .models import BrollPatch, RenderRequest, SettingsUpdate, VideoPatch
from .presets import PACING, PLATFORMS, STYLES, public_catalog
from .services import Services
from .system import ffmpeg_info, ffmpeg_install_plan
from .transcript import parse_subtitles, save_words, whisper_available

STATIC_DIR = Path(__file__).parent / "static"
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mpg", ".mpeg", ".mts", ".m2ts", ".wmv", ".flv", ".3gp", ".ts"}
CHUNK = 1024 * 1024


def _json(s: Optional[str], default: Any) -> Any:
    try:
        return json.loads(s) if s else default
    except json.JSONDecodeError:
        return default


def _slug(text: str, fallback: str = "video") -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return s[:60] or fallback


def create_app(cfg: Optional[Config] = None) -> FastAPI:
    cfg = cfg or load_config()
    cfg.ensure_dirs()
    db = Database(cfg.db_path)
    svc = Services(cfg, db)
    jobs = JobManager(svc)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        jobs.recover()
        for child in cfg.work_dir.iterdir():
            shutil.rmtree(child, ignore_errors=True)
        yield
        jobs.shutdown()

    app = FastAPI(title=APP_NAME, version=__version__, lifespan=lifespan, docs_url="/api/docs", redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.svc, app.state.jobs = svc, jobs

    # ------------------------------------------------------------------ auth
    if cfg.password:
        @app.middleware("http")
        async def basic_auth(request: Request, call_next):
            header = request.headers.get("authorization", "")
            ok = False
            if header.lower().startswith("basic "):
                try:
                    _, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
                    ok = secrets.compare_digest(pw, cfg.password)
                except Exception:
                    ok = False
            if not ok:
                return Response("Authentication required", status_code=401,
                                headers={"WWW-Authenticate": f'Basic realm="{APP_NAME}"'})
            return await call_next(request)

    # --------------------------------------------------------------- helpers
    def project_out(p: dict) -> dict:
        analysis = _json(p.get("analysis_json"), None)
        return {
            "id": p["id"], "name": p["name"], "filename": p["filename"], "size": p["size"],
            "duration": p["duration"], "width": p["width"], "height": p["height"], "fps": p["fps"],
            "has_audio": bool(p["has_audio"]), "created_at": p["created_at"],
            "transcript_source": p.get("transcript_source"), "analysis": analysis,
            "thumb_url": f"/api/projects/{p['id']}/thumb" if p.get("thumb_path") else None,
            "source_url": f"/api/projects/{p['id']}/source",
        }

    def video_out(v: dict) -> dict:
        plat = PLATFORMS.get(v["platform"], {})
        style = STYLES.get(v["style"], {})
        out_ok = v["status"] == "done" and v.get("output_path")
        return {
            "id": v["id"], "project_id": v["project_id"], "title": v["title"],
            "platform": v["platform"], "platform_label": plat.get("label", v["platform"]),
            "width": plat.get("width"), "height": plat.get("height"),
            "style": v["style"], "style_label": style.get("label", v["style"]),
            "status": v["status"], "progress": v["progress"], "stage": v["stage"], "message": v["message"],
            "warnings": _json(v["warnings_json"], []), "options": _json(v["options_json"], {}),
            "stats": _json(v["stats_json"], {}), "meta": _json(v["meta_json"], {}),
            "duration": v["duration"], "size": v["size"], "created_at": v["created_at"],
            "finished_at": v["finished_at"],
            "file_url": f"/api/videos/{v['id']}/file" if out_ok else None,
            "download_url": f"/api/videos/{v['id']}/download" if out_ok else None,
            "thumb_url": f"/api/videos/{v['id']}/thumb" if v.get("thumb_path") else None,
            "srt_url": f"/api/videos/{v['id']}/captions.srt" if v.get("srt_path") else None,
        }

    def broll_out(b: dict) -> dict:
        return {"id": b["id"], "name": b["name"], "tags": b["tags"] or "", "duration": b["duration"],
                "width": b["width"], "height": b["height"], "created_at": b["created_at"],
                "thumb_url": f"/api/broll/{b['id']}/thumb" if b.get("thumb_path") else None,
                "file_url": f"/api/broll/{b['id']}/file"}

    def need(table: str, id_: str, label: str) -> dict:
        row = db.get(table, id_)
        if not row:
            raise HTTPException(404, f"{label} not found")
        return row

    def save_upload(file: UploadFile, dest: Path, max_bytes: int) -> int:
        total = 0
        try:
            with open(dest, "wb") as out:
                while True:
                    chunk = file.file.read(CHUNK)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise HTTPException(413, f"That file is larger than the {max_bytes // (1024 * 1024)} MB limit.")
                    out.write(chunk)
        except BaseException:
            dest.unlink(missing_ok=True)
            raise
        return total

    def unlink(*paths: Optional[str]) -> None:
        for p in paths:
            if p:
                Path(p).unlink(missing_ok=True)

    # ------------------------------------------------------------ meta/health
    @app.get("/api/meta")
    def meta() -> dict:
        return {"app": APP_NAME, "tagline": TAGLINE, "version": __version__, "max_upload_mb": cfg.max_upload_mb,
                **public_catalog()}

    @app.get("/api/health")
    def health() -> dict:
        info = ffmpeg_info(cfg.ffmpeg)
        plan = ffmpeg_install_plan()
        s = svc.settings()
        return {"ffmpeg": info.version if info.usable else None, "captions_ok": info.libass,
                "ffmpeg_fix": "" if info.usable else plan.command,
                "whisper": whisper_available(), "whisper_model": s["whisper_model"],
                "ollama_enabled": bool(s["ollama_enabled"]), "pexels": bool(s["pexels_key"]), "version": __version__}

    @app.post("/api/ollama/test")
    def ollama_test(body: dict) -> dict:
        url = str(body.get("url") or svc.settings()["ollama_url"])
        model = str(body.get("model") or svc.settings()["ollama_model"])
        client = Ollama(url, model)
        models = client.models()
        return {"reachable": bool(models) or client.available(), "models": models,
                "model_installed": any(m == model or m.startswith(model + ":") or m.split(":")[0] == model for m in models)}

    @app.get("/api/stats")
    def stats() -> dict:
        done = db.list("videos", "status='done'", order="")
        saved = 0.0
        for v in done:
            st = _json(v["stats_json"], {})
            saved += max(0.0, float(st.get("source_duration", 0)) - float(st.get("final_duration", 0)))
        return {
            "videos": len(done), "projects": db.scalar("SELECT COUNT(*) FROM projects") or 0,
            "processing": db.scalar("SELECT COUNT(*) FROM videos WHERE status IN ('queued','running')") or 0,
            "time_saved": round(saved, 1),
            "fillers_removed": sum(int(_json(v["stats_json"], {}).get("fillers_removed", 0)) for v in done),
            "broll_clips": db.scalar("SELECT COUNT(*) FROM broll") or 0,
        }

    # --------------------------------------------------------------- settings
    def settings_out() -> dict:
        s = svc.settings()
        key = s.pop("pexels_key", "") or ""
        s["pexels_key_set"] = bool(key)
        s["logo_url"] = "/api/settings/logo" if (cfg.assets_dir / "logo.png").exists() else None
        return s

    @app.get("/api/settings")
    def get_settings() -> dict:
        return settings_out()

    @app.put("/api/settings")
    def put_settings(body: SettingsUpdate) -> dict:
        values = {k: v for k, v in body.model_dump().items() if v is not None}
        if "ollama_url" in values:
            values["ollama_url"] = values["ollama_url"].strip().rstrip("/")
        if "pexels_key" in values:
            values["pexels_key"] = values["pexels_key"].strip()
        db.set_settings(values)
        return settings_out()

    @app.post("/api/settings/logo")
    def upload_logo(file: UploadFile = File(...)) -> dict:
        tmp = cfg.work_dir / f"logo_{new_id()}"
        save_upload(file, tmp, 15 * 1024 * 1024)
        try:
            run_ffmpeg(cfg, ["-i", str(tmp), "-frames:v", "1", "-f", "image2", "-c:v", "png",
                             str(cfg.assets_dir / "logo.png")])
        except MediaError:
            raise HTTPException(400, "That does not look like an image. Use a PNG, JPG or WebP file.")
        finally:
            tmp.unlink(missing_ok=True)
        return settings_out()

    @app.delete("/api/settings/logo")
    def delete_logo() -> dict:
        (cfg.assets_dir / "logo.png").unlink(missing_ok=True)
        return settings_out()

    @app.get("/api/settings/logo")
    def get_logo() -> FileResponse:
        p = cfg.assets_dir / "logo.png"
        if not p.exists():
            raise HTTPException(404, "No logo")
        return FileResponse(p, media_type="image/png")

    # --------------------------------------------------------------- projects
    @app.post("/api/projects")
    def create_project(file: UploadFile = File(...)) -> dict:
        original = Path(file.filename or "video").name[:140]
        ext = Path(original).suffix.lower()
        if ext not in VIDEO_EXTS:
            raise HTTPException(400, "Unsupported file type. Use MP4, MOV, MKV, WebM, AVI or a similar video file.")
        pid = new_id()
        dest = cfg.uploads_dir / f"{pid}{ext}"
        size = save_upload(file, dest, cfg.max_upload_mb * 1024 * 1024)
        try:
            info = probe(cfg, dest)
            if not info.has_video:
                raise MediaError("This file has no video track.")
        except MediaError as e:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, str(e))
        thumb = cfg.uploads_dir / f"{pid}.jpg"
        try:
            make_thumbnail(cfg, dest, thumb, at=min(1.0, info.duration * 0.1), width=480)
        except MediaError:
            thumb = None  # type: ignore[assignment]
        db.insert("projects", {
            "id": pid, "name": Path(original).stem[:120] or "Untitled", "filename": original, "path": str(dest),
            "size": size, "duration": info.duration, "width": info.width, "height": info.height, "fps": info.fps,
            "has_audio": int(info.has_audio), "thumb_path": str(thumb) if thumb else None, "created_at": now()})
        return project_out(db.get("projects", pid))  # type: ignore[arg-type]

    @app.get("/api/projects")
    def list_projects() -> list[dict]:
        return [project_out(p) for p in db.list("projects")]

    @app.get("/api/projects/{pid}")
    def get_project(pid: str) -> dict:
        return project_out(need("projects", pid, "Project"))

    @app.delete("/api/projects/{pid}")
    def delete_project(pid: str) -> dict:
        p = need("projects", pid, "Project")
        for v in db.list("videos", "project_id=?", (pid,), order=""):
            jobs.cancel(v["id"])
            unlink(v.get("output_path"), v.get("thumb_path"), v.get("srt_path"))
            db.delete("videos", v["id"])
        unlink(p["path"], p.get("thumb_path"), p.get("transcript_path"))
        db.delete("projects", pid)
        return {"ok": True}

    @app.get("/api/projects/{pid}/thumb")
    def project_thumb(pid: str) -> FileResponse:
        p = need("projects", pid, "Project")
        if not p.get("thumb_path") or not Path(p["thumb_path"]).exists():
            raise HTTPException(404, "No thumbnail")
        return FileResponse(p["thumb_path"], media_type="image/jpeg")

    @app.get("/api/projects/{pid}/source")
    def project_source(pid: str) -> FileResponse:
        p = need("projects", pid, "Project")
        if not Path(p["path"]).exists():
            raise HTTPException(404, "Source file missing")
        return FileResponse(p["path"])

    @app.post("/api/projects/{pid}/analyze")
    def analyze_project(pid: str) -> dict:
        """How much dead air could each pacing level remove? Fast: audio only."""
        p = need("projects", pid, "Project")
        if not p["has_audio"]:
            result = {"has_audio": False, "pacing": {}}
        else:
            src = Path(p["path"])
            per: dict[str, Any] = {}
            cache: dict[tuple[float, float], list] = {}
            for key, cfg_p in PACING.items():
                k = (cfg_p["noise_db"], cfg_p["min_silence"])
                if k not in cache:
                    cache[k] = detect_silences(cfg, src, cfg_p["noise_db"], cfg_p["min_silence"])
                segs = tl.speech_segments(cache[k], p["duration"], cfg_p["keep"] / 2)
                kept = sum(e - s for s, e in segs) or p["duration"]
                per[key] = {"kept": round(kept, 1), "removed": round(p["duration"] - kept, 1),
                            "pauses": len(cache[k])}
            result = {"has_audio": True, "pacing": per}
        db.update("projects", pid, {"analysis_json": json.dumps(result)})
        return result

    @app.post("/api/projects/{pid}/transcript")
    def upload_transcript(pid: str, file: UploadFile = File(...)) -> dict:
        need("projects", pid, "Project")
        raw = file.file.read(5 * 1024 * 1024 + 1)
        if len(raw) > 5 * 1024 * 1024:
            raise HTTPException(413, "Caption file is too large.")
        try:
            words = parse_subtitles(raw.decode("utf-8-sig", errors="replace"))
        except ValueError as e:
            raise HTTPException(400, str(e))
        path = cfg.cache_dir / f"{pid}.transcript.json"
        save_words(path, words, "srt")
        db.update("projects", pid, {"transcript_path": str(path), "transcript_source": "srt"})
        return {"words": len(words), "project": project_out(db.get("projects", pid))}  # type: ignore[arg-type]

    @app.delete("/api/projects/{pid}/transcript")
    def delete_transcript(pid: str) -> dict:
        p = need("projects", pid, "Project")
        unlink(p.get("transcript_path"))
        db.update("projects", pid, {"transcript_path": None, "transcript_source": None})
        return project_out(db.get("projects", pid))  # type: ignore[arg-type]

    @app.post("/api/projects/{pid}/render")
    def render_project(pid: str, req: RenderRequest) -> list[dict]:
        p = need("projects", pid, "Project")
        out = []
        for platform in req.platforms:
            vid = new_id()
            db.insert("videos", {
                "id": vid, "project_id": pid, "title": (req.options.title or p["name"])[:140],
                "platform": platform, "style": req.options.style, "status": "queued",
                "options_json": req.options.model_dump_json(), "created_at": now()})
            jobs.submit(vid)
            out.append(video_out(db.get("videos", vid)))  # type: ignore[arg-type]
        return out

    # ----------------------------------------------------------------- videos
    @app.get("/api/videos")
    def list_videos(status: Optional[str] = None, platform: Optional[str] = None,
                    q: Optional[str] = None, project_id: Optional[str] = None) -> list[dict]:
        where, params = [], []
        if status:
            where.append("status=?"); params.append(status)
        if platform:
            where.append("platform=?"); params.append(platform)
        if project_id:
            where.append("project_id=?"); params.append(project_id)
        if q:
            where.append("title LIKE ?"); params.append(f"%{q}%")
        rows = db.list("videos", " AND ".join(where), tuple(params))
        names = {p["id"]: p["name"] for p in db.list("projects", order="")}
        out = []
        for v in rows:
            d = video_out(v)
            d["project_name"] = names.get(v["project_id"], "")
            out.append(d)
        return out

    @app.get("/api/videos/{vid}")
    def get_video(vid: str) -> dict:
        return video_out(need("videos", vid, "Video"))

    @app.patch("/api/videos/{vid}")
    def patch_video(vid: str, body: VideoPatch) -> dict:
        need("videos", vid, "Video")
        db.update("videos", vid, {"title": body.title.strip()})
        return video_out(db.get("videos", vid))  # type: ignore[arg-type]

    @app.delete("/api/videos/{vid}")
    def delete_video(vid: str) -> dict:
        v = need("videos", vid, "Video")
        jobs.cancel(vid)
        unlink(v.get("output_path"), v.get("thumb_path"), v.get("srt_path"))
        db.delete("videos", vid)
        return {"ok": True}

    @app.post("/api/videos/{vid}/cancel")
    def cancel_video(vid: str) -> dict:
        v = need("videos", vid, "Video")
        if v["status"] not in ("queued", "running"):
            raise HTTPException(409, "This video is not processing.")
        if not jobs.cancel(vid):
            db.update("videos", vid, {"status": "cancelled", "stage": "Cancelled", "finished_at": now()})
        return video_out(db.get("videos", vid))  # type: ignore[arg-type]

    @app.post("/api/videos/{vid}/retry")
    def retry_video(vid: str) -> dict:
        v = need("videos", vid, "Video")
        if v["status"] not in ("failed", "cancelled"):
            raise HTTPException(409, "Only failed or cancelled videos can be retried.")
        jobs.submit(vid)
        return video_out(db.get("videos", vid))  # type: ignore[arg-type]

    def _output(v: dict) -> Path:
        if v["status"] != "done" or not v.get("output_path") or not Path(v["output_path"]).exists():
            raise HTTPException(404, "This video is not available.")
        return Path(v["output_path"])

    @app.get("/api/videos/{vid}/file")
    def video_file(vid: str) -> FileResponse:
        return FileResponse(_output(need("videos", vid, "Video")), media_type="video/mp4")

    @app.get("/api/videos/{vid}/download")
    def video_download(vid: str) -> FileResponse:
        v = need("videos", vid, "Video")
        name = f"{_slug(v['title'])}-{v['platform']}.mp4"
        return FileResponse(_output(v), media_type="video/mp4", filename=name)

    @app.get("/api/videos/{vid}/thumb")
    def video_thumb(vid: str) -> FileResponse:
        v = need("videos", vid, "Video")
        if not v.get("thumb_path") or not Path(v["thumb_path"]).exists():
            raise HTTPException(404, "No thumbnail")
        return FileResponse(v["thumb_path"], media_type="image/jpeg")

    @app.get("/api/videos/{vid}/captions.srt")
    def video_srt(vid: str) -> FileResponse:
        v = need("videos", vid, "Video")
        if not v.get("srt_path") or not Path(v["srt_path"]).exists():
            raise HTTPException(404, "No captions for this video")
        return FileResponse(v["srt_path"], media_type="application/x-subrip",
                            filename=f"{_slug(v['title'])}-{v['platform']}.srt")

    # ----------------------------------------------------------------- b-roll
    @app.get("/api/broll")
    def list_broll() -> list[dict]:
        return [broll_out(b) for b in db.list("broll")]

    @app.post("/api/broll")
    def add_broll(file: UploadFile = File(...), tags: str = Form("")) -> dict:
        original = Path(file.filename or "clip").name[:140]
        ext = Path(original).suffix.lower()
        if ext not in VIDEO_EXTS:
            raise HTTPException(400, "Unsupported file type for B-roll.")
        bid = new_id()
        dest = cfg.broll_dir / f"{bid}{ext}"
        save_upload(file, dest, 1024 * 1024 * 1024)
        try:
            info = probe(cfg, dest)
            if not info.has_video:
                raise MediaError("This file has no video track.")
        except MediaError as e:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, str(e))
        thumb = cfg.broll_dir / f"{bid}.jpg"
        try:
            make_thumbnail(cfg, dest, thumb, at=min(0.5, info.duration / 2), width=320)
        except MediaError:
            thumb = None  # type: ignore[assignment]
        db.insert("broll", {"id": bid, "name": Path(original).stem[:120], "path": str(dest), "tags": tags.strip()[:300],
                            "duration": info.duration, "width": info.width, "height": info.height,
                            "thumb_path": str(thumb) if thumb else None, "created_at": now()})
        return broll_out(db.get("broll", bid))  # type: ignore[arg-type]

    @app.patch("/api/broll/{bid}")
    def patch_broll(bid: str, body: BrollPatch) -> dict:
        need("broll", bid, "Clip")
        fields = {k: v.strip() for k, v in body.model_dump().items() if v is not None}
        db.update("broll", bid, fields)
        return broll_out(db.get("broll", bid))  # type: ignore[arg-type]

    @app.delete("/api/broll/{bid}")
    def delete_broll(bid: str) -> dict:
        b = need("broll", bid, "Clip")
        unlink(b["path"], b.get("thumb_path"))
        db.delete("broll", bid)
        return {"ok": True}

    @app.get("/api/broll/{bid}/file")
    def broll_file(bid: str) -> FileResponse:
        return FileResponse(need("broll", bid, "Clip")["path"])

    @app.get("/api/broll/{bid}/thumb")
    def broll_thumb(bid: str) -> FileResponse:
        b = need("broll", bid, "Clip")
        if not b.get("thumb_path") or not Path(b["thumb_path"]).exists():
            raise HTTPException(404, "No thumbnail")
        return FileResponse(b["thumb_path"], media_type="image/jpeg")

    # ----------------------------------------------------------------- static
    @app.exception_handler(MediaError)
    async def media_error_handler(_: Request, exc: MediaError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app
