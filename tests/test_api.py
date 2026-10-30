"""API contract tests (FastAPI TestClient, real solver)."""

import pytest
from fastapi.testclient import TestClient
from hydroflex_api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_metadata_and_sources():
    m = client.get("/api/model/metadata").json()
    assert m["equations"] and "NOT validated" in m["validation_status"]
    s = client.get("/api/data/sources").json()
    assert len(s["datasets"]) >= 5
    assert all("nature" in d for d in s["datasets"])


def test_scenarios():
    d = client.get("/api/scenarios").json()
    assert {p["key"] for p in d["presets"]} == {"normal", "moderate_drought", "severe_drought", "compound_shock"}
    assert abs(sum(s["probability"] for s in d["stochastic_set"]) - 1) < 1e-6


def test_profiles_endpoint():
    d = client.get("/api/data/profiles?start_day=0&days=7&resolution_h=1").json()
    assert len(d["timestamps"]) == 168 and "pv_cf" in d["series"]


def test_simulate_roundtrip_and_registry():
    body = {"scenario": "severe_drought", "horizon": {"hours": 48, "start_day": 30, "resolution_h": 1},
            "system": {"battery_power_mw": 100, "battery_energy_mwh": 400}}
    r = client.post("/api/simulate", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["optimal"] and d["freshly_computed"] is True
    assert d["solver"]["name"] == "HiGHS"
    assert len(d["timeseries"]["timestamps"]) == 48
    ts = d["timeseries"]["scenarios"]["severe_drought"]
    assert set(ts) >= {"demand", "hydro", "imports", "unserved", "soc_mwh", "reservoir_hm3"}
    assert d["scenarios"][0]["max_balance_residual_mw"] < 1e-4
    assert "SYNTHETIC" in d["data_label"]
    got = client.get(f"/api/experiments/{d['run_id']}")
    assert got.status_code == 200
    csv = client.get(f"/api/experiments/{d['run_id']}/download?format=csv")
    assert csv.status_code == 200 and csv.text.startswith("timestamp_utc")
    assert any(e["run_id"] == d["run_id"] for e in client.get("/api/experiments").json()["experiments"])


@pytest.mark.parametrize("body", [
    {"horizon": {"hours": 10}},
    {"system": {"pv_mw": -5}},
    {"scenario": "unknown"},
    {"scenario_overrides": {"drought_severity": 1.5}},
    {"system": {"battery_power_mw": 0, "battery_energy_mwh": 100}},
])
def test_validation_rejects_bad_input(body):
    assert client.post("/api/simulate", json=body).status_code == 422


def test_investment_size_limit():
    body = {"horizon": {"hours": 8760, "start_day": 0, "resolution_h": 1}}
    assert client.post("/api/optimize/investments", json=body).status_code == 422


def test_investment_small():
    body = {"horizon": {"hours": 168, "start_day": 180, "resolution_h": 1}, "budget_meur": 100}
    d = client.post("/api/optimize/investments", json=body).json()
    assert d["optimal"] and d["expected"]["capex_overnight_meur"] <= 100 + 1e-6


def test_unknown_experiment():
    assert client.get("/api/experiments/does-not-exist").status_code == 404
