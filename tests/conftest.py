import numpy as np
import pandas as pd
import pytest

from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts
from hydroflex.optimization.model import ModelInput, RiskOptions, ScenarioData


def toy_scenario(T: int = 48, key: str = "toy", prob: float = 1.0, inflow: float = 0.8, demand: float = 900.0,
                 pv_scale: float = 1.0, price: float = 100.0, seed: int = 0, import_avail: float = 1.0) -> ScenarioData:
    rng = np.random.default_rng(seed)
    h = np.arange(T) % 24
    pv = np.clip(np.sin(np.pi * (h - 6) / 12), 0, None) * 0.8 * pv_scale
    wind = np.clip(0.2 + 0.1 * rng.standard_normal(T), 0, 1)
    d = demand * (1 + 0.2 * np.sin(np.pi * (h - 8) / 12))
    pr = price * (1 + 0.3 * np.sin(np.pi * (h - 12) / 12) ** 2)
    return ScenarioData(key=key, label=key, probability=prob, demand=d, pv_cf=pv, wind_cf=wind,
                        ror_avail=np.full(T, 250.0), inflow=np.full(T, inflow), import_price=pr,
                        import_availability=import_avail)


def toy_input(scen=None, params: SystemParams | None = None, invest: InvestmentOptions | None = None,
              risk: RiskOptions | None = None, fixed=None, dt: float = 1.0) -> ModelInput:
    return ModelInput(params=params or SystemParams(), costs=TechnologyCosts(), invest=invest or InvestmentOptions(),
                      scenarios=scen or [toy_scenario()], dt=dt, risk=risk or RiskOptions(), fixed_capacity=fixed,
                      timestamps=pd.date_range("2022-01-01", periods=len((scen or [toy_scenario()])[0].demand),
                                               freq=f"{int(dt)}h", tz="UTC"))


@pytest.fixture
def battery_params() -> SystemParams:
    return SystemParams(battery_power_existing_mw=200, battery_energy_existing_mwh=800)
