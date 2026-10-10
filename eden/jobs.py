"""Background job runner. A small thread pool is plenty: FFmpeg already uses
every core, so by default renders run one at a time and queue up behind each other."""
from __future__ import annotations

import threading
import traceback
from concurrent.futures import ThreadPoolExecutor

from .db import now
from .media import Cancelled, MediaError, ProcHandle
from .pipeline import run_pipeline
from .services import Services


class JobManager:
    def __init__(self, svc: Services):
        self.svc = svc
        self.pool = ThreadPoolExecutor(max_workers=svc.cfg.workers, thread_name_prefix="eden-render")
        self.handles: dict[str, ProcHandle] = {}
        self.lock = threading.Lock()

    def recover(self) -> None:
        """Anything still marked queued/running at startup was interrupted by a restart."""
        for v in self.svc.db.list("videos", "status IN ('queued','running')"):
            self.svc.db.update("videos", v["id"], {
                "status": "failed", "stage": "Interrupted",
                "message": "Eden was restarted while this video was processing. Press Retry to run it again.",
                "finished_at": now()})

    def submit(self, video_id: str) -> None:
        self.svc.db.update("videos", video_id, {"status": "queued", "progress": 0, "stage": "Queued", "message": ""})
        handle = ProcHandle()
        with self.lock:
            self.handles[video_id] = handle
        self.pool.submit(self._run, video_id, handle)

    def cancel(self, video_id: str) -> bool:
        with self.lock:
            h = self.handles.get(video_id)
        if not h:
            return False
        h.kill()
        return True

    def _run(self, video_id: str, handle: ProcHandle) -> None:
        db = self.svc.db
        try:
            if handle.cancel.is_set():
                raise Cancelled()
            db.update("videos", video_id, {"status": "running", "stage": "Starting", "progress": 1})
            run_pipeline(self.svc, video_id, handle)
        except Cancelled:
            db.update("videos", video_id, {"status": "cancelled", "stage": "Cancelled", "message": "",
                                           "finished_at": now()})
        except MediaError as e:
            db.update("videos", video_id, {"status": "failed", "stage": "Failed", "message": str(e)[:1200],
                                           "finished_at": now()})
        except Exception as e:  # never let a worker thread die silently
            traceback.print_exc()
            db.update("videos", video_id, {"status": "failed", "stage": "Failed",
                                           "message": f"Unexpected error: {type(e).__name__}: {str(e)[:400]}",
                                           "finished_at": now()})
        finally:
            with self.lock:
                self.handles.pop(video_id, None)

    def shutdown(self) -> None:
        with self.lock:
            for h in self.handles.values():
                h.kill()
        self.pool.shutdown(wait=False, cancel_futures=True)
