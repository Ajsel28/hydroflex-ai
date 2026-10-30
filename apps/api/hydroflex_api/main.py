"""HYDROFLEX AI REST API (FastAPI).

Live optimisation runs execute the real HiGHS LP. Safeguards for public demos:
  * one solve at a time (process-wide semaphore), queued requests wait up to 120 s
  * per-client rate limit (default 12 runs / 10 min)
  * problem-size caps per endpoint and solver time limits
Reference experiments produced by ``python -m hydroflex.experiments.run_all`` are served read-only and
always flagged ``reference: true`` / ``freshly_computed: false``.
"""

from __future__ import annotations

import csv
import io
import json
import os
import threading
import time
from collections import defaultdict, deque
from typing import Any

import anyio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from hydroflex import DATA_DIR, REPO_ROOT, __version__
from hydroflex.climate.scenarios import describe_presets, stochastic_scenario_set
from hydroflex.config import assumptions_table
from hydroflex.data.loader import load_profiles
from hydroflex.optimization.model import __doc__ as MODEL_DOC
from hydroflex.service import run_investment, run_simulation, run_stochastic

from hydroflex_api import registry
from hydroflex_api.schemas import InvestmentRequest, SimulateRequest, StochasticRequest

MAX_STEPS = {"simulate": 8760, "investment": 2920, "stochastic_total": 7300}
RATE_LIMIT = int(os.getenv("HYDROFLEX_RATE_LIMIT", "60"))  # deployment config sets 12
RATE_WINDOW_S = 600
ORIGINS = [o.strip() for o in os.getenv("HYDROFLEX_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,"
                                         "http://localhost:4173,http://127.0.0.1:4173").split(",") if o.strip()]

app = FastAPI(title="HYDROFLEX AI API", version=__version__,
              description="Climate-aware optimisation of hydropower, renewables and storage for Albania "
                          "(research prototype; not an operational model).")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])

_solver_sem = anyio.Semaphore(1)
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()
_busy = {"running": False, "since": None}


def _rate_check(request: Request) -> None:
    ip = request.client.host if request.client else "anon"
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW_S:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            raise HTTPException(429, f"Rate limit: at most {RATE_LIMIT} optimisation runs per {RATE_WINDOW_S // 60} min")
        q.append(now)


async def _run(fn, *args) -> dict[str, Any]:
    try:
        with anyio.fail_after(120):
            await _solver_sem.acquire()
    except TimeoutError as exc:
        raise HTTPException(503, "Solver busy; try again shortly") from exc
    try:
        _busy.update(running=True, since=time.time())
        out = await anyio.to_thread.run_sync(lambda: fn(*args))
    finally:
        _busy.update(running=False, since=None)
        _solver_sem.release()
    registry.save(out)
    return out


@app.on_event("startup")
def _startup() -> None:
    registry.sync_reference()


@app.get("/api/health")
def health() -> dict[str, Any]:
    import highspy

    df, mode = load_profiles()
    return {"status": "ok", "version": __version__, "solver": "HiGHS", "highspy": getattr(highspy, "__version__", ""),
            "data_mode": mode, "reference_year": df.attrs.get("year"), "solver_busy": _busy["running"],
            "reference_experiments": sum(1 for r in registry.list_runs() if r["reference"])}


@app.get("/api/model/metadata")
def model_metadata() -> dict[str, Any]:
    eq_file = REPO_ROOT / "docs" / "equations.json"
    return {"name": "HYDROFLEX AI", "version": __version__,
            "title": "Climate-Aware Stochastic Optimization of Hydropower, Renewable Generation, and Battery Storage "
                     "for Electricity-System Resilience in Albania",
            "formulation": MODEL_DOC, "equations": json.loads(eq_file.read_text(encoding="utf-8")) if eq_file.exists() else [],
            "assumptions": assumptions_table(), "limits": MAX_STEPS,
            "validation_status": "Verified against an independent PyPSA formulation on test cases and by automated "
                                 "conservation tests. NOT validated against observed Albanian grid operations.",
            "network": "single-node copper plate; aggregate interconnector (not an AC power-flow model)"}


@app.get("/api/data/sources")
def data_sources() -> dict[str, Any]:
    prov = []
    for f in sorted((DATA_DIR / "provenance").glob("*.json")):
        prov.append(json.loads(f.read_text(encoding="utf-8")))
    summ = DATA_DIR / "processed" / "profile_summary.json"
    return {"datasets": prov, "profile_summary": json.loads(summ.read_text(encoding="utf-8")) if summ.exists() else None}


@app.get("/api/data/profiles")
def data_profiles(start_day: int = 0, days: int = 365, resolution_h: int = 24) -> dict[str, Any]:
    df, mode = load_profiles()
    start_day = max(0, min(364, start_day))
    days = max(1, min(365 - start_day, days))
    resolution_h = resolution_h if resolution_h in (1, 3, 6, 24) else 24
    sub = df.iloc[start_day * 24:(start_day + days) * 24]
    agg = sub.groupby(sub.index.floor(f"{resolution_h}h")).mean(numeric_only=True)
    return {"data_mode": mode, "timestamps": [t.isoformat().replace("+00:00", "Z") for t in agg.index],
            "series": {c: agg[c].round(4).tolist() for c in agg.columns}}


@app.get("/api/scenarios")
def scenarios() -> dict[str, Any]:
    return {"presets": describe_presets(), "stochastic_set": [s.model_dump() for s in stochastic_scenario_set()]}


@app.post("/api/simulate")
async def simulate(req: SimulateRequest, request: Request) -> JSONResponse:
    steps = req.horizon.hours // req.horizon.resolution_h
    if steps > MAX_STEPS["simulate"]:
        raise HTTPException(422, "horizon too large")
    _rate_check(request)
    out = await _run(run_simulation, req.model_dump())
    return JSONResponse(out)


@app.post("/api/optimize/investments")
async def optimize_investments(req: InvestmentRequest, request: Request) -> JSONResponse:
    steps = req.horizon.hours // req.horizon.resolution_h
    if steps > MAX_STEPS["investment"]:
        raise HTTPException(422, f"investment runs are limited to {MAX_STEPS['investment']} time steps "
                                 "(e.g. a full year at 3-hourly resolution)")
    _rate_check(request)
    return JSONResponse(await _run(run_investment, req.model_dump()))


@app.post("/api/optimize/stochastic")
async def optimize_stochastic(req: StochasticRequest, request: Request) -> JSONResponse:
    n = len(stochastic_scenario_set())
    steps = req.horizon.hours // req.horizon.resolution_h if req.method == "annual_chronological" else 168 * req.n_weeks
    if steps * n > MAX_STEPS["stochastic_total"]:
        raise HTTPException(422, f"stochastic runs are limited to {MAX_STEPS['stochastic_total']} scenario-steps "
                                 f"({n} scenarios); use 6-hourly resolution for a full year")
    _rate_check(request)
    return JSONResponse(await _run(run_stochastic, req.model_dump()))


@app.get("/api/experiments")
def experiments() -> dict[str, Any]:
    return {"experiments": registry.list_runs()}


@app.get("/api/experiments/{run_id}")
def experiment(run_id: str) -> JSONResponse:
    d = registry.load(run_id)
    if d is None:
        raise HTTPException(404, "unknown run id")
    if registry.list_runs and any(r["run_id"] == run_id and r["reference"] for r in registry.list_runs()):
        d["freshly_computed"] = False
        d["reference"] = True
    return JSONResponse(d)


@app.get("/api/experiments/{run_id}/download")
def experiment_download(run_id: str, format: str = "json") -> Response:
    d = registry.load(run_id)
    if d is None:
        raise HTTPException(404, "unknown run id")
    if format == "json":
        return Response(json.dumps(d, indent=1), media_type="application/json",
                        headers={"Content-Disposition": f"attachment; filename={run_id}.json"})
    if format == "csv":
        ts = d.get("timeseries") or {}
        buf = io.StringIO()
        w = csv.writer(buf)
        stamps = ts.get("timestamps", [])
        cols: list[tuple[str, str]] = []
        for sk, series in (ts.get("scenarios") or {}).items():
            cols += [(sk, name) for name in series]
        w.writerow(["timestamp_utc"] + [f"{sk}.{n}" for sk, n in cols])
        for i, t in enumerate(stamps):
            w.writerow([t] + [ts["scenarios"][sk][n][i] for sk, n in cols])
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename={run_id}.csv"})
    if format == "metrics_csv":
        buf = io.StringIO()
        scen = d.get("scenarios", [])
        keys = sorted({k for s in scen for k in s})
        w = csv.DictWriter(buf, fieldnames=keys)
        w.writeheader()
        for s in scen:
            w.writerow(s)
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={run_id}_metrics.csv"})
    raise HTTPException(422, "format must be json, csv or metrics_csv")


@app.get("/api/paper")
def paper() -> Response:
    pdf = REPO_ROOT / "research" / "paper" / "HydroFlex_AI_Research_Paper.pdf"
    if pdf.exists():
        return Response(pdf.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition": "inline; filename=HydroFlex_AI_Research_Paper.pdf"})
    tex = REPO_ROOT / "research" / "paper" / "main.tex"
    if tex.exists():
        return Response(tex.read_text(encoding="utf-8"), media_type="text/plain",
                        headers={"Content-Disposition": "attachment; filename=main.tex",
                                 "X-HydroFlex-Note": "PDF not compiled in this environment; LaTeX source served"})
    raise HTTPException(404, "paper not available")
