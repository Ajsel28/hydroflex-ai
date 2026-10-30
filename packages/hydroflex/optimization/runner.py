"""Assemble model inputs from profiles + scenarios and run the native model.

Short windows (< 1 year) need reservoir boundary conditions that respect seasonal storage.
With ``boundary="nested"`` a coarse (6-hourly) full-year run of the same scenario and fleet is
solved first; its reservoir volumes at the window start and end become the window's initial
volume and terminal target. This preserves intertemporal coupling of the seasonal reservoir
instead of forcing V_T = V_0 inside an isolated week. With ``boundary="fixed"`` the window uses
V_0 from the parameters and V_T >= V_0.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import pandas as pd

from hydroflex.climate.scenarios import PRESETS, ScenarioSpec, apply_scenario
from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts
from hydroflex.data.loader import aggregate, load_profiles
from hydroflex.optimization.model import ModelInput, ModelResult, RiskOptions, ScenarioData, solve


@dataclass
class RunConfig:
    scenarios: list[ScenarioSpec] = field(default_factory=lambda: [PRESETS["normal"]])
    params: SystemParams = field(default_factory=SystemParams)
    costs: TechnologyCosts = field(default_factory=TechnologyCosts)
    invest: InvestmentOptions = field(default_factory=InvestmentOptions)
    hours: int = 8760
    start_hour: int = 0
    resolution_h: int = 1
    risk: RiskOptions = field(default_factory=RiskOptions)
    boundary: Literal["nested", "fixed"] = "nested"
    fixed_capacity: dict[str, float] | None = None
    year: int | None = None
    time_limit: float = 300.0


def scenario_frames(cfg: RunConfig) -> tuple[list[pd.DataFrame], str, pd.DataFrame]:
    base, mode = load_profiles(cfg.year)
    frames = []
    for s in cfg.scenarios:
        frames.append(apply_scenario(base, s))
    return frames, mode, base


def _window(df: pd.DataFrame, start: int, hours: int, res: int) -> pd.DataFrame:
    hours = min(hours, len(df) - start)
    return aggregate(df.iloc[start:start + hours], res)


def make_input(cfg: RunConfig) -> tuple[ModelInput, str, pd.DatetimeIndex]:
    frames, mode, _ = scenario_frames(cfg)
    full_year = cfg.start_hour == 0 and cfg.hours >= len(frames[0])
    scen = []
    for spec, df in zip(cfg.scenarios, frames, strict=True):
        w = _window(df, cfg.start_hour, cfg.hours, cfg.resolution_h)
        sd = ScenarioData.from_frame(w, spec.key, spec.label, spec.probability, cfg.params)
        if not full_year and cfg.boundary == "nested":
            v0, vt = nested_boundary(cfg, spec, df)
            sd.v0_hm3, sd.v_terminal_hm3 = v0, vt
        scen.append(sd)
    ts = _window(frames[0], cfg.start_hour, cfg.hours, cfg.resolution_h).index
    mi = ModelInput(params=cfg.params, costs=cfg.costs, invest=cfg.invest, scenarios=scen, dt=float(cfg.resolution_h),
                    timestamps=ts, risk=cfg.risk, fixed_capacity=cfg.fixed_capacity, time_limit=cfg.time_limit)
    if full_year and cfg.params.res_terminal != "free":
        pass  # annual cycle: V_T >= V_0 (or =) closes the seasonal storage cycle
    return mi, mode, ts


def nested_boundary(cfg: RunConfig, spec: ScenarioSpec, df: pd.DataFrame, coarse_h: int = 6) -> tuple[float, float]:
    """Reservoir volumes at window start/end from a coarse full-year run of the same scenario.

    The coarse run uses the window's capacities when they are fixed, otherwise the existing fleet.
    """
    yr = aggregate(df, coarse_h)
    sd = ScenarioData.from_frame(yr, spec.key, spec.label, 1.0, cfg.params)
    mi = ModelInput(params=cfg.params, costs=cfg.costs, invest=InvestmentOptions(enabled=False), scenarios=[sd],
                    dt=float(coarse_h), fixed_capacity=cfg.fixed_capacity, time_limit=60)
    res = solve(mi)
    if not res.optimal:
        p = cfg.params
        v0 = p.res_vmin_hm3 + p.res_v0_frac * (p.res_vmax_hm3 - p.res_vmin_hm3)
        return v0, v0
    V = np.concatenate([[res.scenario_results[0]["res_v_start_hm3"]], res.timeseries[spec.key]["reservoir_hm3"]])
    i0 = cfg.start_hour // coarse_h
    i1 = min((cfg.start_hour + cfg.hours) // coarse_h, len(V) - 1)
    return float(V[i0]), float(V[i1])


def run(cfg: RunConfig, keep_timeseries: bool = True) -> tuple[ModelResult, ModelInput, str]:
    mi, mode, _ = make_input(cfg)
    return solve(mi, keep_timeseries=keep_timeseries), mi, mode
