"""System parameters, technology costs and their provenance.

Monetary unit inside the optimiser: thousand EUR (kEUR) — improves LP conditioning.
Energy: MWh. Power: MW. Water volume: hm3 (1 hm3 = 1e6 m3). Time step: hours.

Every default carries a source tag:
  [S:...] sourced value, [A] modelling assumption (explicitly an assumption), [D] derived.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field, model_validator

USD_TO_EUR = 0.92  # [A] approximate 2023–2024 average exchange rate


def crf(rate: float, years: float) -> float:
    """Capital recovery factor: annuity per unit of overnight capital."""
    if rate == 0:
        return 1.0 / years
    return rate * (1 + rate) ** years / ((1 + rate) ** years - 1)


@dataclass(frozen=True)
class Assumption:
    key: str
    value: float
    unit: str
    tag: str
    source: str


class TechnologyCosts(BaseModel):
    """Overnight capital costs and fixed O&M; annualised via the capital recovery factor."""

    discount_rate: float = Field(0.07, ge=0.0, le=0.25, description="[A] real discount rate")
    regional_cost_multiplier: float = Field(1.25, ge=0.5, le=3.0,
                                            description="[A] premium over IRENA global weighted averages")
    pv_capex_eur_per_kw: float = Field(691 * USD_TO_EUR, gt=0, description="[S:IRENA RPGC 2024] USD 691/kW")
    wind_capex_eur_per_kw: float = Field(1041 * USD_TO_EUR, gt=0, description="[S:IRENA RPGC 2024] USD 1041/kW")
    battery_energy_capex_eur_per_kwh: float = Field(192 * USD_TO_EUR, gt=0,
                                                    description="[S:IRENA RPGC 2024] USD 192/kWh project cost")
    battery_power_capex_eur_per_kw: float = Field(60.0, ge=0, description="[A] incremental power-conversion cost")
    import_capacity_capex_eur_per_kw: float = Field(400.0, ge=0,
                                                    description="[A] illustrative interconnector cost (marginal-value only)")
    pv_lifetime: float = Field(25, gt=0)
    wind_lifetime: float = Field(25, gt=0)
    battery_lifetime: float = Field(15, gt=0)
    pv_fom_frac: float = Field(0.015, ge=0, description="[A] fixed O&M as fraction of capex per year")
    wind_fom_frac: float = Field(0.025, ge=0)
    battery_fom_frac: float = Field(0.025, ge=0)

    def overnight_keur_per_unit(self) -> dict[str, float]:
        """Overnight capital per MW (or per MWh for battery energy), kEUR, incl. regional multiplier."""
        m = self.regional_cost_multiplier
        return {
            "pv": self.pv_capex_eur_per_kw * m,  # EUR/kW == kEUR/MW
            "wind": self.wind_capex_eur_per_kw * m,
            "battery_power": self.battery_power_capex_eur_per_kw * m,
            "battery_energy": self.battery_energy_capex_eur_per_kwh * m,  # EUR/kWh == kEUR/MWh
            "import_capacity": self.import_capacity_capex_eur_per_kw,
        }

    def annualised_keur_per_unit(self) -> dict[str, float]:
        """Annualised cost (annuity + fixed O&M), kEUR per MW-year or per MWh-year."""
        o = self.overnight_keur_per_unit()
        r = self.discount_rate
        return {
            "pv": o["pv"] * (crf(r, self.pv_lifetime) + self.pv_fom_frac),
            "wind": o["wind"] * (crf(r, self.wind_lifetime) + self.wind_fom_frac),
            "battery_power": o["battery_power"] * (crf(r, self.battery_lifetime) + self.battery_fom_frac),
            "battery_energy": o["battery_energy"] * (crf(r, self.battery_lifetime) + self.battery_fom_frac),
            "import_capacity": o["import_capacity"] * crf(r, 40),
        }


class SystemParams(BaseModel):
    """Single-node (copper-plate) representation of the Albanian electricity system."""

    # --- Reservoir hydropower: Drin cascade aggregated into one equivalent reservoir -------------
    hydro_res_p_mw: float = Field(1350.0, ge=0, le=5000, description="[S:KESH] Fierza 500 + Koman 600 + Vau i Dejes 250 MW")
    hydro_head_m: float = Field(230.0, gt=0, le=600, description="[A] aggregate cascade head (sum of stage heads)")
    hydro_efficiency: float = Field(0.88, gt=0, le=1.0, description="[A] turbine-generator efficiency")
    res_vmin_hm3: float = Field(600.0, ge=0, description="[A] minimum operating volume")
    res_vmax_hm3: float = Field(2400.0, gt=0, le=10000, description="[A] maximum operating volume (live 1800 hm3)")
    res_v0_frac: float = Field(0.60, ge=0, le=1, description="[A] initial live-storage fraction")
    res_terminal: str = Field("geq", pattern="^(geq|eq|free)$",
                              description="terminal reservoir condition relative to initial volume")
    min_release_m3s: float = Field(20.0, ge=0, le=500, description="[A] minimum (environmental) release")
    hydro_vom_eur_mwh: float = Field(1.0, ge=0, description="[A] hydro variable O&M")
    # --- Other hydro (run-of-river aggregate, incl. Devoll, small HPPs) ------------------------
    ror_p_mw: float = Field(930.0, ge=0, le=5000,
                            description="[D] IRENA RRA 2,096 MW hydro (2018) + Moglice 184 MW minus Drin 1,350 MW")
    # --- Variable renewables -----------------------------------------------------------------
    pv_existing_mw: float = Field(300.0, ge=0, le=20000, description="[A] order-of-magnitude existing PV fleet")
    wind_existing_mw: float = Field(0.0, ge=0, le=20000, description="[A] negligible existing wind")
    # --- Battery ------------------------------------------------------------------------------
    battery_power_existing_mw: float = Field(0.0, ge=0, le=20000)
    battery_energy_existing_mwh: float = Field(0.0, ge=0, le=100000)
    battery_eta_charge: float = Field(0.95, gt=0, le=1, description="[A] one-way; round trip ~0.90")
    battery_eta_discharge: float = Field(0.95, gt=0, le=1)
    battery_soc_min_frac: float = Field(0.05, ge=0, lt=1)
    battery_soc0_frac: float = Field(0.5, ge=0, le=1)
    battery_terminal: str = Field("geq", pattern="^(geq|cyclic)$",
                                  description="geq: SOC0 = soc0*E and SOC_T >= SOC0; cyclic: SOC0 free, SOC_T = SOC0")
    battery_degradation_eur_mwh: float = Field(5.0, ge=0, le=200,
                                               description="[A] throughput-based degradation proxy per MWh discharged")
    # --- Interconnection (aggregate NTC, not a power-flow model) -------------------------------
    import_capacity_mw: float = Field(900.0, ge=0, le=10000, description="[A] aggregate import NTC")
    export_capacity_mw: float = Field(900.0, ge=0, le=10000, description="[A] aggregate export NTC")
    export_price_ratio: float = Field(0.85, ge=0, le=1.0, description="[A] export price / import price")
    import_price_multiplier: float = Field(1.0, gt=0, le=10)
    import_availability: float = Field(1.0, ge=0, le=1, description="fraction of NTC available")
    # --- Reliability -------------------------------------------------------------------------
    voll_eur_mwh: float = Field(5000.0, ge=100, le=100000, description="[A] value of lost load")
    # --- Demand ------------------------------------------------------------------------------
    demand_multiplier: float = Field(1.0, gt=0, le=3)

    @model_validator(mode="after")
    def _check(self) -> SystemParams:
        if self.res_vmax_hm3 <= self.res_vmin_hm3:
            raise ValueError("res_vmax_hm3 must exceed res_vmin_hm3")
        return self

    @property
    def mwh_per_hm3(self) -> float:
        """Energy conversion: rho*g*H*eta [J/m3] * 1e6 m3/hm3 / 3.6e9 J/MWh."""
        return 1000.0 * 9.81 * self.hydro_head_m * self.hydro_efficiency * 1e6 / 3.6e9

    @property
    def turbine_max_hm3_per_h(self) -> float:
        return self.hydro_res_p_mw / self.mwh_per_hm3

    @property
    def min_release_hm3_per_h(self) -> float:
        return self.min_release_m3s * 3600.0 / 1e6


class InvestmentOptions(BaseModel):
    """Investment decision bounds (first-stage). Capacities are additions to existing fleets."""

    enabled: bool = False
    budget_meur: float | None = Field(None, ge=0, le=20000, description="overnight capital budget, MEUR")
    pv_max_mw: float = Field(2000.0, ge=0, le=20000)
    wind_max_mw: float = Field(1000.0, ge=0, le=20000)
    battery_power_max_mw: float = Field(1000.0, ge=0, le=20000)
    battery_energy_max_mwh: float = Field(4000.0, ge=0, le=100000)
    battery_max_duration_h: float = Field(8.0, gt=0, le=100, description="E <= duration * P")


def assumptions_table(p: SystemParams | None = None, c: TechnologyCosts | None = None) -> list[dict]:
    """Flat table of parameter values and their descriptions (feeds API, paper and UI)."""
    p = p or SystemParams()
    c = c or TechnologyCosts()
    rows = []
    for model in (p, c):
        for name, field in type(model).model_fields.items():
            rows.append({"parameter": name, "value": getattr(model, name), "description": field.description or "",
                         "group": type(model).__name__})
    ann = c.annualised_keur_per_unit()
    for k, v in ann.items():
        rows.append({"parameter": f"annualised_{k}", "value": round(v, 3),
                     "description": "[D] kEUR per MW-yr (MWh-yr for battery energy)", "group": "Derived"})
    rows.append({"parameter": "mwh_per_hm3", "value": round(p.mwh_per_hm3, 2),
                 "description": "[D] rho*g*H*eta energy equivalent of water", "group": "Derived"})
    return rows
