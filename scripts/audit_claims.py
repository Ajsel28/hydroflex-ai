"""Audit: recompute every headline number quoted in README / paper abstract / video from results/experiments/.

    python scripts/audit_claims.py  ->  docs/CLAIMS_AUDIT.md   (exit code 1 if any claim deviates)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
E = ROOT / "results" / "experiments"


def L(n: str) -> dict:
    return json.loads((E / f"{n}.json").read_text(encoding="utf-8"))


def by(n: str) -> dict:
    return {r["tag"]: r["metrics"] for r in L(n)["rows"] if r.get("optimal")}


def main() -> None:
    from hydroflex.config import TechnologyCosts

    ann = TechnologyCosts().annualised_keur_per_unit()
    A, Bm, Bs = (L(x)["scenarios"][0] for x in ("ref-A-normal-annual", "ref-B-moderate-annual", "ref-B-severe-annual"))
    C, D, F = by("exp-C"), by("exp-D"), by("exp-F")
    Ee = L("exp-E")["synergy"]
    J = {(r["resource"], r["scenario"]): r for r in L("ref-J-marginal")["rows"]}
    IST = L("ref-I-stochastic")["deterministic_comparison"]
    I3 = {r["plan"]: r for r in L("exp-I2-chronological-check")["rows"]}
    K = L("exp-H-chronological-check")["rows"]
    R = by("exp-resolution")
    V = L("exp-validation")["rows"]
    bcost = {800: 800 * ann["battery_energy"] + 200 * ann["battery_power"], 1600: 1600 * ann["battery_energy"] + 400 * ann["battery_power"],
             3200: 3200 * ann["battery_energy"] + 800 * ann["battery_power"]}
    shares = [(D[f"{sc}|b0/0"]["opex_keur_annualised"] - D[f"{sc}|b{be // 4}/{be}"]["opex_keur_annualised"]) / bcost[be]
              for sc in ("normal", "severe_drought") for be in (800, 1600, 3200)]
    errs = [abs(r["repweek_expected_total_keur"] - r["chrono_expected_total_keur"]) / 1e3 for r in K]
    claims = [
        ("Net imports, normal year (TWh)", 0.77, A["net_imports_mwh"] / 1e6, 0.005),
        ("Net imports, moderate drought (TWh)", 2.26, Bm["net_imports_mwh"] / 1e6, 0.005),
        ("Net imports, severe drought (TWh)", 3.48, Bs["net_imports_mwh"] / 1e6, 0.005),
        ("Operating cost normal (MEUR/yr)", 40.8, A["opex_keur_annualised"] / 1e3, 0.05),
        ("Operating cost severe (MEUR/yr)", 324.5, Bs["opex_keur_annualised"] / 1e3, 0.05),
        ("Drought cost increase (MEUR/yr)", 284, (Bs["opex_keur_annualised"] - A["opex_keur_annualised"]) / 1e3, 0.5),
        ("ENS normal & severe (MWh)", 0, A["ens_mwh"] + Bs["ens_mwh"], 1e-6),
        ("ENS at 50% NTC, +8% demand (GWh)", 311, F["avail0.5"]["ens_mwh"] / 1e3, 0.5),
        ("Battery ENS reduction at 50% NTC (%)", 13, 100 * (1 - F["avail0.5|batt"]["ens_mwh"] / F["avail0.5"]["ens_mwh"]), 0.5),
        ("Battery saving under shortage (MEUR/yr)", 199.8, (F["avail0.5"]["opex_keur_annualised"] - F["avail0.5|batt"]["opex_keur_annualised"]) / 1e3, 0.05),
        ("Battery 400/1600 annualised cost (MEUR/yr)", 51.7, bcost[1600] / 1e3, 0.05),
        ("Battery arbitrage share of cost, min (%)", 13, 100 * min(shares), 0.5),
        ("Battery arbitrage share of cost, max (%)", 27, 100 * max(shares), 0.5),
        ("PV marginal value, normal (kEUR/MW-yr)", 140, J[("solar_pv", "normal")]["fd_central_keur_per_unit_yr"], 0.5),
        ("PV annualised cost (kEUR/MW-yr)", 80, ann["pv"], 0.5),
        ("Import-capacity value, compound (kEUR/MW-yr)", 175, J[("import_capacity", "compound_shock")]["fd_central_keur_per_unit_yr"], 0.5),
        ("PV import reduction +500 MW, normal (MWh/MW)", 1074, (C["normal|pv0"]["imports_mwh"] - C["normal|pv500"]["imports_mwh"]) / 500, 0.5),
        ("PV+battery synergy, normal (MEUR/yr)", 1.75, Ee["normal"]["synergy_keur"] / 1e3, 0.005),
        ("VSS base case (MEUR/yr)", 0.0, IST["vss_keur_annualised"] / 1e3, 0.005),
        ("I2 CVaR reduction, chronological (MEUR/yr)", 74.5, (I3["deterministic"]["chrono_cvar_opex_keur"] - I3["stochastic_cvar"]["chrono_cvar_opex_keur"]) / 1e3, 0.05),
        ("I2 expected-cost increase, chronological (MEUR/yr)", 15.1, (I3["stochastic_cvar"]["chrono_expected_total_keur"] - I3["deterministic"]["chrono_expected_total_keur"]) / 1e3, 0.05),
        ("I2 wind added (MW)", 230, I3["stochastic_cvar"]["additions"]["wind"], 0.5),
        ("Rep-week vs chronology error min (MEUR/yr)", 1.7, min(errs), 0.05),
        ("Rep-week vs chronology error max (MEUR/yr)", 10.0, max(errs), 0.05),
        ("Battery value removed at 6-h steps (%)", 87, 100 * (1 - (R["res6|nobatt"]["opex_keur_annualised"] - R["res6"]["opex_keur_annualised"]) /
                                                             (R["res1|nobatt"]["opex_keur_annualised"] - R["res1"]["opex_keur_annualised"])), 0.5),
        ("PyPSA vs native max relative difference", 0.0, max(r["rel_diff"] for r in V), 1e-9),
    ]
    rows, bad = [], 0
    for name, quoted, val, tol in claims:
        ok = abs(quoted - val) <= tol
        bad += not ok
        rows.append(f"| {name} | {quoted} | {val:.4g} | {'✅' if ok else '❌'} |")
    md = ["# Claims audit", "", "Every headline number quoted in the README, paper abstract and demo video, recomputed from",
          "`results/experiments/*.json` by `scripts/audit_claims.py` (rounding tolerance shown implicitly by the quoted precision).", "",
          "| Claim | Quoted | Recomputed | OK |", "|---|---|---|---|", *rows, "",
          f"**{len(claims) - bad} / {len(claims)} claims match.**", "",
          "Data status (unchanged): NASA POWER meteorology (observed-derived reanalysis), reconstructed river inflows, "
          "SYNTHETIC demand and prices, single-node system; no validation against observed Albanian grid operations."]
    (ROOT / "docs" / "CLAIMS_AUDIT.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(rows))
    print(f"{len(claims) - bad}/{len(claims)} match")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
