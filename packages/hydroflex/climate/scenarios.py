"""Climate and market stress scenarios.

A scenario is a transparent transformation of the reference-year input profiles:

    inflow_s(t)   = (1 - d_s) * inflow(t)          (reservoir and run-of-river)
    demand_s(t)   = (1 + g_s) * demand(t)
    price_s(t)    = m_s * price(t)
    import_cap_s  = a_s * NTC

d is the drought severity (negative values represent wet years). The four named presets are
configurable assumptions; their drought severities are anchored on the reconstructed 2001–2023
inflow-index distribution (moderate ~ 5th percentile, severe beyond the reconstructed minimum),
NOT on specific historical events.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from hydroflex import DATA_DIR


class ScenarioSpec(BaseModel):
    key: str
    label: str
    drought_severity: float = Field(0.0, ge=-0.5, le=0.9, description="fractional inflow reduction")
    demand_growth: float = Field(0.0, ge=-0.5, le=1.0)
    import_price_multiplier: float = Field(1.0, gt=0, le=10)
    import_availability: float = Field(1.0, ge=0, le=1)
    probability: float = Field(1.0, ge=0, le=1)
    description: str = ""


PRESETS: dict[str, ScenarioSpec] = {
    "normal": ScenarioSpec(key="normal", label="Normal", description="Reference-year inflows, demand and prices."),
    "moderate_drought": ScenarioSpec(
        key="moderate_drought", label="Moderate drought", drought_severity=0.22,
        description="Inflows -22% (≈5th percentile of the reconstructed 2001–2023 annual inflow index)."),
    "severe_drought": ScenarioSpec(
        key="severe_drought", label="Severe drought", drought_severity=0.40,
        description="Inflows -40% (beyond the reconstructed minimum of 0.67; climate-stress extrapolation)."),
    "compound_shock": ScenarioSpec(
        key="compound_shock", label="Compound shock", drought_severity=0.40, demand_growth=0.08,
        import_price_multiplier=1.8, import_availability=0.7,
        description="Severe drought + 8% demand growth + 1.8x import prices + 30% interconnector derating "
                    "(regional scarcity assumption)."),
}


def apply_scenario(df: pd.DataFrame, s: ScenarioSpec) -> pd.DataFrame:
    out = df.copy()
    f = 1.0 - s.drought_severity
    out["drin_inflow_hm3_per_h"] = df["drin_inflow_hm3_per_h"] * f
    out["ror_avail_mw"] = df["ror_avail_mw"] * f
    out["demand_mw"] = df["demand_mw"] * (1.0 + s.demand_growth)
    out["import_price_eur_mwh"] = df["import_price_eur_mwh"] * s.import_price_multiplier
    out["import_availability"] = s.import_availability
    out.attrs = dict(df.attrs)
    return out


def stochastic_scenario_set() -> list[ScenarioSpec]:
    """Five-scenario set for two-stage planning.

    Historical-bin probabilities are computed from the reconstructed 2001–2023 annual inflow index
    (wet > 1.10, normal 0.90–1.10, dry < 0.90, with the bin-mean index as its severity). A climate-stress
    allowance [assumption] of 10% (severe drought) + 5% (compound shock) is then carved out of the
    historical mass proportionally. Probabilities are therefore partly assumed and must be read as such.
    """
    f = DATA_DIR / "processed" / "annual_inflow_index.csv"
    if f.exists():
        idx = pd.read_csv(f, index_col=0).iloc[:, 0]
    else:  # synthetic fallback: symmetric spread
        idx = pd.Series(np.linspace(0.75, 1.25, 23))
    bins = {"wet_year": idx[idx > 1.10], "normal": idx[(idx >= 0.90) & (idx <= 1.10)], "dry_year": idx[idx < 0.90]}
    hist_mass = 0.85
    n = len(idx)
    out = []
    labels = {"wet_year": "Wet year", "normal": "Normal", "dry_year": "Dry year"}
    for k, v in bins.items():
        if len(v) == 0:
            continue
        out.append(ScenarioSpec(
            key=k, label=labels[k], drought_severity=round(1 - float(v.mean()), 4),
            probability=round(hist_mass * len(v) / n, 4),
            description=f"{len(v)} of {n} reconstructed years; mean inflow index {v.mean():.3f}"))
    out.append(PRESETS["severe_drought"].model_copy(update={"probability": 0.10}))
    out.append(PRESETS["compound_shock"].model_copy(update={"probability": 0.05}))
    tot = sum(s.probability for s in out)
    for s in out:
        s.probability = s.probability / tot
    return out


def describe_presets() -> list[dict]:
    return [json.loads(s.model_dump_json()) for s in PRESETS.values()]
