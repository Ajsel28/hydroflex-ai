"""Policy-brief generator: a short, clearly qualified summary built only from executed results.

    python -m hydroflex.experiments.policy_brief      -> research/POLICY_BRIEF.md

Each statement is copied from the computed `finding` of an experiment in ref-summary.json, together with its
hypothesis test outcome and its limitation. No language model is involved and no number is typed by hand.
"""

from __future__ import annotations

import json

from hydroflex import REPO_ROOT, RESULTS_DIR, SYNTHETIC_LABEL

ORDER = [("B", "Drought is a cost and import risk first"), ("F", "Interconnection availability governs reliability"),
         ("G", "Demand growth under constrained imports"), ("C", "Solar displaces imports with diminishing returns"),
         ("D", "Batteries: arbitrage alone does not pay"), ("E", "Coordination adds a small synergy"),
         ("H", "Budget-constrained investment"), ("I", "Planning under uncertainty"),
         ("J", "Marginal value of flexibility"), ("K", "How reliable is the planning approximation?")]


def main() -> None:
    f = RESULTS_DIR / "experiments" / "ref-summary.json"
    if not f.exists():
        print("ref-summary.json missing; run the experiment pipeline first")
        return
    ex = {e["id"]: e for e in json.loads(f.read_text(encoding="utf-8"))["experiments"]}
    lines = ["# HYDROFLEX AI — Research policy brief (model implications, not recommendations)", "",
             f"> **Status:** research prototype; not validated against observed Albanian grid operations. {SYNTHETIC_LABEL}"
             " for demand and prices; inflows reconstructed from reanalysis precipitation; PV/wind weather-derived.",
             "> Every statement below is generated from executed model runs (`results/experiments/ref-summary.json`).",
             ""]
    for k, head in ORDER:
        e = ex.get(k)
        if not e:
            continue
        verdict = {True: "hypothesis supported", False: "hypothesis not supported", None: "descriptive"}[e.get("supported")]
        lines += [f"## {head}", "", e["finding"], "",
                  f"*Experiment {k} — {e['title']} ({verdict}). Caveat: {e['limitations']}*", ""]
    lines += ["## What this does not show", "",
              "- No transmission, reserve, or unit-commitment constraints are modelled.",
              "- Costs, VOLL, scenario probabilities and the export-price ratio are assumptions; see the tornado analysis.",
              "- Results are conditional on synthetic demand and prices and must be re-run with observed data before "
              "any policy use.", ""]
    out = REPO_ROOT / "research" / "POLICY_BRIEF.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("  policy brief:", out.relative_to(REPO_ROOT))


if __name__ == "__main__":
    main()
