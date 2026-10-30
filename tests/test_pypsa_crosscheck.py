"""Independent verification: native sparse LP vs PyPSA/linopy formulation of the same system."""

import numpy as np
import pytest
from hydroflex.climate.scenarios import PRESETS
from hydroflex.config import InvestmentOptions, SystemParams
from hydroflex.optimization.model import solve
from hydroflex.optimization.runner import RunConfig, make_input

pypsa = pytest.importorskip("pypsa")
from hydroflex.optimization.pypsa_model import solve_pypsa  # noqa: E402

P = SystemParams(min_release_m3s=0, res_terminal="eq", battery_terminal="cyclic",
                 battery_power_existing_mw=200, battery_energy_existing_mwh=800)


@pytest.mark.pypsa
@pytest.mark.parametrize("scenario,invest", [("normal", False), ("severe_drought", False), ("compound_shock", True)])
def test_native_matches_pypsa(scenario, invest):
    cfg = RunConfig(scenarios=[PRESETS[scenario]], params=P, hours=168, start_hour=24 * 200,
                    invest=InvestmentOptions(enabled=invest, battery_power_max_mw=0, battery_energy_max_mwh=0))
    mi, _, _ = make_input(cfg)
    r = solve(mi)
    q = solve_pypsa(mi, pv_extendable=invest, wind_extendable=invest)
    assert r.optimal and q["status"] == "ok"
    assert abs(r.objective_keur - q["objective_keur"]) <= 1e-6 * max(1.0, abs(r.objective_keur))
    m = r.scenario_results[0]
    # dispatch is not necessarily unique in an LP; totals of the objective-relevant flows are compared
    for k in ("ens_mwh",):
        assert abs(m[k] - q[k]) < 1e-3
    assert abs(r.capacities["pv"] - q["pv_p_nom"]) < 1e-3 or not invest
    assert np.isfinite(q["marginal_price_eur_mwh"]).all()
