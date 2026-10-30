"""Pydantic request schemas with physical parameter ranges (units in field names)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

PresetKey = Literal["normal", "moderate_drought", "severe_drought", "compound_shock"]


class SystemOverrides(BaseModel):
    """Total installed capacities and economic assumptions. ``None`` keeps the documented default."""

    pv_mw: float | None = Field(None, ge=0, le=10000, description="total installed PV (MW)")
    wind_mw: float | None = Field(None, ge=0, le=10000, description="total installed wind (MW)")
    battery_power_mw: float | None = Field(None, ge=0, le=5000)
    battery_energy_mwh: float | None = Field(None, ge=0, le=40000)
    import_capacity_mw: float | None = Field(None, ge=0, le=5000)
    voll_eur_mwh: float | None = Field(None, ge=100, le=50000)
    discount_rate: float | None = Field(None, ge=0, le=0.25)
    battery_cost_multiplier: float | None = Field(None, gt=0, le=5, description="scales battery capex")

    @model_validator(mode="after")
    def _battery(self) -> SystemOverrides:
        if (self.battery_energy_mwh or 0) > 0 and self.battery_power_mw == 0:
            raise ValueError("battery_energy_mwh > 0 requires battery_power_mw > 0")
        return self


class ScenarioOverrides(BaseModel):
    drought_severity: float | None = Field(None, ge=-0.5, le=0.9, description="fractional inflow reduction")
    demand_growth: float | None = Field(None, ge=-0.3, le=0.6)
    import_price_multiplier: float | None = Field(None, gt=0, le=5)
    import_availability: float | None = Field(None, ge=0, le=1)


class Horizon(BaseModel):
    hours: int = Field(168, ge=24, le=8760)
    start_day: int = Field(14, ge=0, le=364, description="day of year (0 = 1 Jan, UTC)")
    resolution_h: Literal[1, 2, 3, 6] = 1

    @model_validator(mode="after")
    def _fit(self) -> Horizon:
        if self.start_day * 24 + self.hours > 8760:
            self.hours = 8760 - self.start_day * 24
        if self.hours < 24:
            raise ValueError("horizon must cover at least 24 h within the year")
        return self


class SimulateRequest(BaseModel):
    scenario: PresetKey = "normal"
    scenario_overrides: ScenarioOverrides = Field(default_factory=ScenarioOverrides)
    system: SystemOverrides = Field(default_factory=SystemOverrides)
    horizon: Horizon = Field(default_factory=Horizon)
    label: str | None = Field(None, max_length=120)


class InvestmentRequest(SimulateRequest):
    budget_meur: float = Field(500.0, ge=0, le=5000, description="overnight capital budget (MEUR)")
    pv_max_mw: float = Field(2000, ge=0, le=10000)
    wind_max_mw: float = Field(1000, ge=0, le=10000)
    battery_power_max_mw: float = Field(1000, ge=0, le=5000)
    battery_energy_max_mwh: float = Field(4000, ge=0, le=40000)
    horizon: Horizon = Field(default_factory=lambda: Horizon(hours=8760, start_day=0, resolution_h=6))


class StochasticRequest(BaseModel):
    budget_meur: float = Field(500.0, ge=0, le=5000)
    risk_alpha: float = Field(0.9, ge=0.5, le=0.99)
    risk_lambda: float = Field(0.0, ge=0, le=20)
    system: SystemOverrides = Field(default_factory=SystemOverrides)
    horizon: Horizon = Field(default_factory=lambda: Horizon(hours=8760, start_day=0, resolution_h=6))
    compare_deterministic: bool = Field(True, description="also solve and evaluate the deterministic plan, VSS and EVPI")
    method: Literal["representative_weeks", "annual_chronological"] = "representative_weeks"
    n_weeks: Literal[4, 8] = Field(4, description="representative weeks per scenario (live API default 4)")
    boundary_passes: Literal[1, 2] = 1
    label: str | None = Field(None, max_length=120)
