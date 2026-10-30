"""Collect every number shown in the demo video from the experiment files (no hand-typed values).

    python video/src/make_scene_data.py   ->  video/build/scene_data.js   (window.SCENE_DATA = {...})
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXP = ROOT / "results" / "experiments"
OUT = ROOT / "video" / "build"


def load(name: str) -> dict:
    return json.loads((EXP / f"{name}.json").read_text(encoding="utf-8"))


def albania_paths() -> dict:
    gj = json.loads((ROOT / "data" / "processed" / "balkans_ne50m.geojson").read_text(encoding="utf-8"))
    lon0, lon1, lat0, lat1 = 18.9, 21.3, 39.55, 42.75
    kx = math.cos(math.radians(41.2))
    W, H = 520.0, 760.0
    sx = W / ((lon1 - lon0) * kx)
    sy = H / (lat1 - lat0)
    s = min(sx, sy)

    def proj(lon: float, lat: float) -> tuple[float, float]:
        return ((lon - lon0) * kx * s, (lat1 - lat) * s)

    out: dict = {"neighbours": []}
    for f in gj["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        ds = []
        for poly in polys:
            ring = poly[0]
            pts = [proj(lon, lat) for lon, lat in ring]
            if any(-200 < x < W + 200 and -200 < y < H + 200 for x, y in pts):
                ds.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        if not ds:
            continue
        if f["properties"]["name"] == "Albania":
            out["albania"] = " ".join(ds)
        else:
            out["neighbours"].append(" ".join(ds))
    nodes = [("Fierza", 42.25, 20.04), ("Koman", 42.10, 19.82), ("Vau i Dejës", 42.01, 19.63),
             ("Devoll", 40.95, 20.25), ("Fier PV", 40.92, 19.50), ("Tirana", 41.33, 19.82)]
    out["nodes"] = [{"name": n, "x": proj(lon, lat)[0], "y": proj(lon, lat)[1]} for n, lat, lon in nodes]
    out["size"] = [W, H]
    return out


def main() -> None:
    A = load("ref-A-normal-annual")["scenarios"][0]
    B = load("ref-B-severe-annual")["scenarios"][0]
    demo = load("ref-demo-week")["demo_verification"]
    J = {(r["resource"], r["scenario"]): r for r in load("ref-J-marginal")["rows"]}
    IST = load("ref-I-stochastic")
    I3 = {r["plan"]: r for r in load("exp-I2-chronological-check")["rows"]}
    K = load("exp-H-chronological-check")
    R = {r["tag"]: r["metrics"] for r in load("exp-resolution")["rows"]}
    D = {r["tag"]: r["metrics"] for r in load("exp-D")["rows"]}
    F = {r["tag"]: r["metrics"] for r in load("exp-F")["rows"]}
    V = load("exp-validation")
    from hydroflex.config import TechnologyCosts

    ann = TechnologyCosts().annualised_keur_per_unit()
    batt_cost = 1600 * ann["battery_energy"] + 400 * ann["battery_power"]
    batt_saving = D["normal|b0/0"]["opex_keur_annualised"] - D["normal|b400/1600"]["opex_keur_annualised"]
    errs = [abs(r["repweek_expected_total_keur"] - r["chrono_expected_total_keur"]) / 1e3 for r in K["rows"]]
    data = {
        "geo": albania_paths(),
        "annual": {
            "normal": {"net_imports_twh": A["net_imports_mwh"] / 1e6, "opex_meur": A["opex_keur_annualised"] / 1e3,
                       "ens_mwh": A["ens_mwh"], "hydro_twh": (A["hydro_res_mwh"] + A["ror_mwh"]) / 1e6},
            "severe": {"net_imports_twh": B["net_imports_mwh"] / 1e6, "opex_meur": B["opex_keur_annualised"] / 1e3,
                       "ens_mwh": B["ens_mwh"], "hydro_twh": (B["hydro_res_mwh"] + B["ror_mwh"]) / 1e6},
        },
        "week": {k: {"imports_gwh": v["imports_mwh"] / 1e3, "cost_meur": v["objective_keur"] / 1e3, "ens_mwh": v["ens_mwh"]}
                 for k, v in demo.items()},
        "marginal": {"pv_value": J[("solar_pv", "normal")]["fd_central_keur_per_unit_yr"], "pv_cost": ann["pv"],
                     "imp_value_normal": J[("import_capacity", "normal")]["fd_central_keur_per_unit_yr"],
                     "imp_value_compound": J[("import_capacity", "compound_shock")]["fd_central_keur_per_unit_yr"]},
        "battery": {"saving_meur": batt_saving / 1e3, "cost_meur": batt_cost / 1e3},
        "shortage": {"ens_gwh_ntc50": F["avail0.5"]["ens_mwh"] / 1e3,
                     "saving_meur_ntc50": (F["avail0.5"]["opex_keur_annualised"] - F["avail0.5|batt"]["opex_keur_annualised"]) / 1e3},
        "stochastic": {"vss_meur": IST["deterministic_comparison"]["vss_keur_annualised"] / 1e3,
                       "scenarios": [{"label": s["label"], "p": s["probability"], "opex_meur": s["opex_keur"] / 1e3}
                                     for s in IST["scenarios"]],
                       "cvar_meur": IST["risk"]["cvar_keur_annualised"] / 1e3},
        "i2": {"cvar_det": I3["deterministic"]["chrono_cvar_opex_keur"] / 1e3, "cvar_stoch": I3["stochastic_cvar"]["chrono_cvar_opex_keur"] / 1e3,
               "cost_det": I3["deterministic"]["chrono_expected_total_keur"] / 1e3,
               "cost_stoch": I3["stochastic_cvar"]["chrono_expected_total_keur"] / 1e3,
               "wind_added": I3["stochastic_cvar"]["additions"]["wind"]},
        "validation": {"chrono_err_min": min(errs), "chrono_err_max": max(errs),
                       "pypsa_max_rel": max(r["rel_diff"] for r in V["rows"])},
        "resolution": {f"{h}h": (R[f"res{h}|nobatt"]["opex_keur_annualised"] - R[f"res{h}"]["opex_keur_annualised"]) / 1e3
                       for h in (1, 2, 3, 6)},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "scene_data.js").write_text("window.SCENE_DATA = " + json.dumps(data) + ";\n", encoding="utf-8")
    (OUT / "scene_numbers.json").write_text(json.dumps({k: v for k, v in data.items() if k != "geo"}, indent=2),
                                           encoding="utf-8")
    print(json.dumps({k: v for k, v in data.items() if k != "geo"}, indent=1)[:2500])


if __name__ == "__main__":
    main()
