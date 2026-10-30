"""Data-pipeline sanity checks: ranges, units, provenance completeness."""

import json

import numpy as np
import pytest
from hydroflex import DATA_DIR
from hydroflex.climate.scenarios import PRESETS, apply_scenario, stochastic_scenario_set
from hydroflex.data.loader import aggregate, load_profiles, synthetic_profiles
from hydroflex.data.profiles import pv_capacity_factor, wind_power_curve

REQUIRED_PROV = {"name", "provider", "source_url", "date_accessed", "geographic_coverage", "time_coverage",
                 "temporal_resolution", "units", "license", "processing", "nature"}


def test_profiles_ranges():
    df, mode = load_profiles()
    assert len(df) == 8760
    assert df.isna().sum().sum() == 0
    assert df.pv_cf.between(0, 1).all() and df.wind_cf.between(0, 1).all()
    assert abs(df.demand_mw.sum() / 1e6 - 8.0) < 0.05
    assert (df.drin_inflow_hm3_per_h >= 0).all()
    assert str(df.index.tz) == "UTC"


def test_synthetic_fallback_labelled():
    df = synthetic_profiles()
    assert "SYNTHETIC" in df.attrs["label"]
    assert len(df) == 8760 and df.pv_cf.between(0, 1).all()


def test_aggregate_preserves_energy():
    df, _ = load_profiles()
    a = aggregate(df, 3)
    assert abs(a.demand_mw.sum() * 3 - df.demand_mw.sum()) < 1e-6 * df.demand_mw.sum()


def test_pv_and_wind_models():
    assert pv_capacity_factor(np.array([0.0]), np.array([20.0]))[0] == 0
    assert 0.8 < pv_capacity_factor(np.array([1000.0]), np.array([25.0]))[0] <= 1.0
    assert wind_power_curve(np.array([2.0]))[0] == 0 and wind_power_curve(np.array([13.0]))[0] == 1
    assert wind_power_curve(np.array([26.0]))[0] == 0


def test_scenarios_transform():
    df, _ = load_profiles()
    s = apply_scenario(df, PRESETS["compound_shock"])
    assert np.allclose(s.drin_inflow_hm3_per_h, 0.6 * df.drin_inflow_hm3_per_h)
    assert np.allclose(s.demand_mw, 1.08 * df.demand_mw)


def test_stochastic_set_probabilities():
    sc = stochastic_scenario_set()
    assert abs(sum(s.probability for s in sc) - 1) < 1e-9
    assert len({s.key for s in sc}) == len(sc)


@pytest.mark.parametrize("f", sorted((DATA_DIR / "provenance").glob("*.json")), ids=lambda p: p.stem)
def test_provenance_records_complete(f):
    rec = json.loads(f.read_text(encoding="utf-8"))
    missing = REQUIRED_PROV - set(rec)
    assert not missing, missing
