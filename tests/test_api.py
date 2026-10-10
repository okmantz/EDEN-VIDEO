"""API behaviour that does not need a render."""
import base64

import pytest
from conftest import SRT, needs_ffmpeg


def test_meta_and_health(client):
    meta = client.get("/api/meta").json()
    assert meta["app"] == "EDEN VIDEO"
    keys = {p["key"] for p in meta["platforms"]}
    assert {"instagram_reels", "tiktok", "facebook_reels", "youtube_shorts", "youtube"} <= keys
    assert len(meta["styles"]) >= 5
    assert "whisper" in client.get("/api/health").json()


def test_index_and_static(client):
    r = client.get("/")
    assert r.status_code == 200 and "EDEN VIDEO" in r.text
    assert client.get("/static/styles.css").status_code == 200
    assert client.get("/static/js/app.js").status_code == 200


def test_settings_roundtrip_and_secret_is_never_returned(client):
    s = client.put("/api/settings", json={"display_name": "Sam", "pexels_key": "secret123", "default_style": "cinematic"}).json()
    assert s["display_name"] == "Sam" and s["default_style"] == "cinematic"
    assert s["pexels_key_set"] is True and "pexels_key" not in s
    assert client.get("/api/settings").json()["display_name"] == "Sam"
    assert client.put("/api/settings", json={"pexels_key": ""}).json()["pexels_key_set"] is False


@pytest.mark.parametrize("body", [{"brand_color": "red"}, {"default_style": "nope"}, {"default_platforms": ["x"]},
                                  {"loudness": 5}, {"whisper_model": "gigantic"}])
def test_settings_validation(client, body):
    assert client.put("/api/settings", json=body).status_code == 422


def test_rejects_non_video_upload(client):
    r = client.post("/api/projects", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    r = client.post("/api/projects", files={"file": ("fake.mp4", b"not really a video", "video/mp4")})
    assert r.status_code == 400 and client.get("/api/projects").json() == []


def test_unknown_ids_404(client):
    for path in ("/api/projects/nope", "/api/videos/nope", "/api/videos/nope/file", "/api/broll/nope/file"):
        assert client.get(path).status_code == 404
    assert client.post("/api/projects/nope/render", json={"platforms": ["tiktok"]}).status_code == 404


def test_render_request_is_validated(client):
    assert client.post("/api/projects/x/render", json={"platforms": []}).status_code == 422
    assert client.post("/api/projects/x/render", json={"platforms": ["tiktok"], "options": {"focus": 3}}).status_code == 422


@needs_ffmpeg
def test_transcript_upload_and_removal(client, sample_video):
    with open(sample_video, "rb") as f:
        pid = client.post("/api/projects", files={"file": ("a.mp4", f, "video/mp4")}).json()["id"]
    assert client.post(f"/api/projects/{pid}/transcript", files={"file": ("x.srt", b"nonsense", "text/plain")}).status_code == 400
    r = client.post(f"/api/projects/{pid}/transcript", files={"file": ("x.srt", SRT.encode(), "text/plain")})
    assert r.json()["words"] == 22 and r.json()["project"]["transcript_source"] == "srt"
    assert client.delete(f"/api/projects/{pid}/transcript").json()["transcript_source"] is None


@needs_ffmpeg
def test_analyze_reports_savings_per_pacing(client, sample_video):
    with open(sample_video, "rb") as f:
        pid = client.post("/api/projects", files={"file": ("a.mp4", f, "video/mp4")}).json()["id"]
    a = client.post(f"/api/projects/{pid}/analyze").json()
    assert a["has_audio"] and set(a["pacing"]) == {"relaxed", "balanced", "tight"}
    assert a["pacing"]["tight"]["removed"] >= a["pacing"]["relaxed"]["removed"] > 2
    assert client.get(f"/api/projects/{pid}").json()["analysis"]["pacing"]["tight"]


@needs_ffmpeg
def test_broll_library_crud(client, broll_clip):
    with open(broll_clip, "rb") as f:
        b = client.post("/api/broll", files={"file": ("Office Desk.mp4", f, "video/mp4")}, data={"tags": "office, desk"}).json()
    assert b["name"] == "Office Desk" and b["thumb_url"]
    assert client.patch(f"/api/broll/{b['id']}", json={"tags": "work"}).json()["tags"] == "work"
    assert client.get(b["thumb_url"]).status_code == 200
    assert client.delete(f"/api/broll/{b['id']}").status_code == 200
    assert client.get("/api/broll").json() == []


def test_optional_password_protects_everything(tmp_path):
    from fastapi.testclient import TestClient

    from eden.config import Config
    from eden.main import create_app

    app = create_app(Config(data_dir=tmp_path / "d", password="hunter2"))
    with TestClient(app) as c:
        assert c.get("/api/meta").status_code == 401
        assert c.get("/").status_code == 401
        bad = base64.b64encode(b"u:wrong").decode()
        assert c.get("/api/meta", headers={"Authorization": f"Basic {bad}"}).status_code == 401
        good = base64.b64encode(b"anyone:hunter2").decode()
        assert c.get("/api/meta", headers={"Authorization": f"Basic {good}"}).status_code == 200


def test_ollama_assist_degrades_gracefully(client):
    r = client.post("/api/ollama/test", json={"url": "http://127.0.0.1:9", "model": "x"}).json()
    assert r["reachable"] is False and r["models"] == []


def test_ai_enhance_parses_and_sanitises(monkeypatch):
    from eden import ai

    class Fake(ai.Ollama):
        def generate_json(self, system, prompt):
            return {"title": "  A great clip ", "description": "Short.", "hashtags": ["Coffee Time", "#News", 3],
                    "keywords": ["Coffee!", "time", None]}

    out = ai.enhance(Fake("http://x", "m"), "some transcript text", "TikTok", "Viral Pop")
    assert out == {"title": "A great clip", "description": "Short.", "hashtags": ["#coffeetime", "#news"],
                   "keywords": ["coffee", "time"]}
    assert ai.enhance(Fake("http://x", "m"), "   ", "TikTok", "Viral Pop") is None

    class Broken(ai.Ollama):
        def generate_json(self, system, prompt):
            return None
    assert ai.enhance(Broken("http://x", "m"), "text", "TikTok", "Viral Pop") is None


@needs_ffmpeg
def test_ai_failure_does_not_break_a_render(client, sample_video):
    """AI assist on, Ollama unreachable: the edit still completes and says so."""
    from conftest import wait_for_videos
    client.put("/api/settings", json={"ollama_enabled": True, "ollama_url": "http://127.0.0.1:9"})
    with open(sample_video, "rb") as f:
        pid = client.post("/api/projects", files={"file": ("a.mp4", f, "video/mp4")}).json()["id"]
    client.post(f"/api/projects/{pid}/transcript", files={"file": ("x.srt", SRT.encode(), "text/plain")})
    r = client.post(f"/api/projects/{pid}/render", json={"platforms": ["tiktok"], "options": {"use_ai": True, "broll": "off"}})
    [v] = wait_for_videos(client, [r.json()[0]["id"]])
    assert v["status"] == "done" and any("Ollama" in w for w in v["warnings"])
    assert v["meta"]["ai_used"] is False
