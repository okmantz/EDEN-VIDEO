"""SQLite storage. One short-lived connection per operation keeps it thread safe."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    duration REAL DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    fps REAL DEFAULT 0,
    has_audio INTEGER DEFAULT 1,
    thumb_path TEXT,
    analysis_json TEXT,
    transcript_path TEXT,
    transcript_source TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    style TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress REAL DEFAULT 0,
    stage TEXT DEFAULT '',
    message TEXT DEFAULT '',
    warnings_json TEXT DEFAULT '[]',
    options_json TEXT DEFAULT '{}',
    stats_json TEXT DEFAULT '{}',
    meta_json TEXT DEFAULT '{}',
    output_path TEXT,
    thumb_path TEXT,
    srt_path TEXT,
    duration REAL DEFAULT 0,
    size INTEGER DEFAULT 0,
    created_at REAL NOT NULL,
    finished_at REAL
);
CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE TABLE IF NOT EXISTS broll (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    tags TEXT DEFAULT '',
    duration REAL DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    thumb_path TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    duration REAL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sfx (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    duration REAL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

TABLE_COLUMNS: dict[str, set[str]] = {}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.conn() as c:
            c.executescript(SCHEMA)
            for table in ("projects", "videos", "broll", "music", "sfx", "settings"):
                TABLE_COLUMNS[table] = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    # ---- generic helpers -------------------------------------------------- #
    def insert(self, table: str, row: dict[str, Any]) -> None:
        self._check(table, row)
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        with self.conn() as c:
            c.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(row.values()))

    def update(self, table: str, id_: str, fields: dict[str, Any]) -> None:
        if not fields:
            return
        self._check(table, fields)
        sets = ", ".join(f"{k}=?" for k in fields)
        with self.conn() as c:
            c.execute(f"UPDATE {table} SET {sets} WHERE id=?", [*fields.values(), id_])

    def get(self, table: str, id_: str) -> Optional[dict[str, Any]]:
        with self.conn() as c:
            r = c.execute(f"SELECT * FROM {table} WHERE id=?", (id_,)).fetchone()
        return dict(r) if r else None

    def delete(self, table: str, id_: str) -> None:
        with self.conn() as c:
            c.execute(f"DELETE FROM {table} WHERE id=?", (id_,))

    def list(self, table: str, where: str = "", params: tuple = (), order: str = "created_at DESC",
             limit: Optional[int] = None) -> list[dict[str, Any]]:
        sql = f"SELECT * FROM {table}"
        if where:
            sql += f" WHERE {where}"
        if order:
            sql += f" ORDER BY {order}"
        if limit:
            sql += f" LIMIT {int(limit)}"
        with self.conn() as c:
            return [dict(r) for r in c.execute(sql, params).fetchall()]

    def scalar(self, sql: str, params: tuple = ()) -> Any:
        with self.conn() as c:
            r = c.execute(sql, params).fetchone()
        return r[0] if r else None

    @staticmethod
    def _check(table: str, row: dict[str, Any]) -> None:
        bad = set(row) - TABLE_COLUMNS.get(table, set())
        if bad:
            raise ValueError(f"Unknown column(s) for {table}: {sorted(bad)}")

    # ---- settings --------------------------------------------------------- #
    def get_settings(self) -> dict[str, Any]:
        with self.conn() as c:
            rows = c.execute("SELECT key, value FROM settings").fetchall()
        out: dict[str, Any] = {}
        for r in rows:
            try:
                out[r["key"]] = json.loads(r["value"])
            except json.JSONDecodeError:
                out[r["key"]] = r["value"]
        return out

    def set_settings(self, values: dict[str, Any]) -> None:
        with self.conn() as c:
            for k, v in values.items():
                c.execute("INSERT INTO settings(key, value) VALUES(?, ?) "
                          "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, json.dumps(v)))


def now() -> float:
    return time.time()
