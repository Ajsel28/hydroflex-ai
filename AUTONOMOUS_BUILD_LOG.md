# HYDROFLEX AI — Autonomous Build Log

All entries are written during the build. Times are local (session date 2026-10-29).

## Stage 0 — Environment inspection
- OS: Windows 11 Home; 4 logical CPUs. Shells: Git Bash + PowerShell 5.1.
- Python 3.13.5 (system); Node v24.14.1; npm 11.11.0.
- The enclosing git repository was the user's *home directory* (`C:/Users/User`). To avoid ever committing
  personal files, a dedicated repository was initialised inside `hydroflex-ai/` (branch `main`).
- LaTeX: no `pdflatex`/`xelatex`/`tectonic` installed. MiKTeX is available via winget but a system install was
  not attempted. Download of the portable Tectonic binary was **blocked by the environment's permission
  classifier** ("code from external"). → Paper PDF compilation is a blocker requiring user authorisation.
- Network: NASA POWER, Open-Meteo, PyPI reachable.

## Stage 1 — Python environment
- `.venv` created; installed: pypsa 1.4.0, linopy 0.10.1, highspy 1.15.1, scipy 1.18.1, numpy 2.5.4,
  pandas 3.1.0, xarray 2026.9.0, fastapi 0.162.0, uvicorn 0.54.0, pydantic 2.14.2, matplotlib 3.11.2,
  pytest 9.2.0, ruff 0.17.3, mypy 2.4.1. All succeeded.

## Stage 2 — Data acquisition (all succeeded, no API keys)
- NASA POWER hourly (UTC) 2019–2023 for 5 points (2 solar, 2 wind, Tirana demand proxy):
  ALLSKY_SFC_SW_DWN, T2M, WS50M, WS10M → 25 CSV files.
- NASA POWER daily 2000–2023 PRECTOTCORR, T2M for 4 Drin-basin points → 4 CSV files.
- Open-Meteo ERA5 archive, Tirana 2021 hourly (cross-check only).
- Provenance JSON written per dataset in `data/provenance/`.
- Facts verified by web search (cited in paper): Drin cascade 1,350 MW (KESH; Fierza 500, Koman 600, Vau i Dejës 250);
  hydro 2,096 MW end-2018 (IRENA RRA Albania, via exit.al summary); Moglicë 184 MW; IRENA RPGC 2024 costs
  (PV USD 691/kW, onshore wind USD 1,041/kW, battery USD 192/kWh).
- Not accessible without credentials: ENTSO-E Transparency (requires a token) → demand and prices are SYNTHETIC.

## Stage 3 — Processed profiles
- PV CF (2019–2023) ≈ 0.170–0.176; wind CF ≈ 0.108–0.119 (coarse MERRA-2; likely conservative).
- Reconstructed annual inflow index 2001–2023: q05 = 0.784, median 0.99, min 0.67 (2011).
- Reference year chosen algorithmically (closest to median inflow among 2019–2023): **2022**.
  Note: the reconstruction is uncalibrated against gauges; it should not be read as the observed 2022 hydrology.

## Stage 4 — Optimisation engine
- Native sparse LP (scipy COO → HiGHS via highspy). Dispatch / investment / two-stage stochastic / CVaR.
- Smoke runs: 168 h (0.5 s), 720 h (0.7 s), 8760 h hourly dispatch (≈9–10 s), all Optimal, zero balance residuals.
- Hourly annual investment LP: 136 s (simplex), 219 s (IPM; crossover dominated). 3-hourly: 11 s (IPM).
  Decision: investment sweeps at 3-h resolution; resolution effect quantified as an experiment.
- PyPSA cross-check (Store+Links battery, StorageUnit reservoir): objectives agree to ~1e-13 relative
  on 3 cases (normal, severe drought, compound shock with PV/wind expansion).
- Marginal-value accounting fixed so that first-stage rows (budget, duration) are excluded from operational value.

## Stage 5 — Tests
- 48 tests pass (physics, conservation, behaviour, infeasibility, budget, CVaR reconciliation, VSS ≥ 0,
  dual-vs-finite-difference subgradient check, PyPSA cross-check, data/provenance checks).
