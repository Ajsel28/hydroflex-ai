"""Experiment registry: run payloads as JSON files, metadata index in SQLite (no external database)."""

from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any

from hydroflex import RESULTS_DIR

RUNS = RESULTS_DIR / "runs"
REFERENCE = RESULTS_DIR / "experiments"
DB = RESULTS_DIR / "registry.sqlite"
_lock = threading.Lock()
_ref_state: dict[str, float] = {"sig": -1.0}


def _maybe_sync() -> None:
    """Re-index reference experiments when files in results/experiments/ change (cheap stat-based check)."""
    if not REFERENCE.exists():
        return
    files = list(REFERENCE.glob("*.json"))
    sig = float(len(files)) + sum(p.stat().st_mtime for p in files)
    if sig != _ref_state["sig"]:
        _ref_state["sig"] = sig
        sync_reference()


def _conn() -> sqlite3.Connection:
    RUNS.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, kind TEXT, label TEXT, created_utc TEXT,
                 status TEXT, objective_keur REAL, scenario TEXT, path TEXT, reference INTEGER)""")
    return c


def save(payload: dict[str, Any], reference: bool = False) -> None:
    base = REFERENCE if reference else RUNS
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{payload['run_id']}.json"
    path.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False, default=str), encoding="utf-8")
    with _lock, _conn() as c:
        c.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?)", (
            payload["run_id"], payload["kind"], payload.get("label"), payload["created_utc"], payload["status"],
            payload.get("objective_keur"), ",".join(s["key"] for s in payload.get("scenarios", [])),
            str(path.relative_to(RESULTS_DIR)), int(reference)))


def sync_reference() -> None:
    """Index reference experiments written by the pipeline (results/experiments/*.json)."""
    if not REFERENCE.exists():
        return
    with _lock, _conn() as c:
        for f in REFERENCE.glob("*.json"):
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            if "run_id" not in d:
                continue
            c.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?)", (
                d["run_id"], d["kind"], d.get("label"), d["created_utc"], d["status"], d.get("objective_keur"),
                ",".join(s["key"] for s in d.get("scenarios", [])), str(f.relative_to(RESULTS_DIR)), 1))


def list_runs(limit: int = 200) -> list[dict[str, Any]]:
    _maybe_sync()
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, kind, label, created_utc, status, objective_keur, scenario, reference FROM runs "
                         "ORDER BY reference DESC, created_utc DESC LIMIT ?", (limit,)).fetchall()
    keys = ["run_id", "kind", "label", "created_utc", "status", "objective_keur", "scenarios", "reference"]
    return [dict(zip(keys, r, strict=True)) | {"reference": bool(r[-1])} for r in rows]


def load(run_id: str) -> dict[str, Any] | None:
    if not run_id.replace("-", "").replace("_", "").replace(".", "").isalnum():
        return None
    _maybe_sync()
    with _lock, _conn() as c:
        row = c.execute("SELECT path FROM runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    f = RESULTS_DIR / row[0]
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
