# Data Card — HYDROFLEX AI

Machine-readable provenance for every dataset is in `data/provenance/*.json` (fields: name, provider,
source_url, date_accessed, geographic_coverage, time_coverage, temporal_resolution, units, license,
processing, nature). This card summarises them.

| Dataset | Provider | Coverage | Resolution | Nature | Used for |
|---|---|---|---|---|---|
| NASA POWER hourly (ALLSKY_SFC_SW_DWN, T2M, WS50M, WS10M) at 5 points | NASA LaRC POWER | 2019–2023 | hourly, UTC | satellite/reanalysis estimate | PV & wind capacity factors; demand temperature driver |
| NASA POWER daily (PRECTOTCORR, T2M) at 4 Drin-basin points | NASA LaRC POWER | 2000–2023 | daily, UTC | reanalysis precipitation | reconstructed inflow index |
| Open-Meteo archive (ERA5) Tirana | Open-Meteo / Copernicus ERA5 | 2021 | hourly, GMT | reanalysis | cross-check of temperature/irradiance only |
| Natural Earth Admin-0 1:50m | Natural Earth | static | — | cartographic | maps |
| Processed hourly profiles | derived (this repo) | 2019–2023 (ref. year 2022) | hourly, UTC | mixed: weather-derived / reconstructed / **synthetic** | model input |
| Reconstructed daily inflow | derived (this repo) | 2001–2023 | daily | **reconstructed** | scenarios, stochastic set |
| Synthetic fallback profiles | generated (seed 7) | 8760 h | hourly | **synthetic** | only if processed data absent |

**SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS.** Demand and price series are
synthetic in every configuration; the label is attached to every API payload (`data_label`) and displayed
in the UI.

## Sourced facts (secondary sources, retrieved 2026-10-29)
- Drin cascade 1,350 MW: Fierza 500 MW, Koman 600 MW, Vau i Dejës 250 MW — KESH (kesh.al) and Wikipedia
  station articles; Fierza mean annual output ≈ 1,330 GWh (Wikipedia).
- Hydropower 2,096 MW (≈95% of capacity) at end-2018; Moglicë 184 MW added by 2020; IRENA projection of ~15%
  (large HPP) / ~20% (small HPP) lower average output by 2050 vs 2010 — IRENA *Renewables Readiness Assessment:
  Albania* (2021), as summarised by Exit News.
- Technology costs: IRENA *Renewable Power Generation Costs in 2024* (2025): PV USD 691/kW, onshore wind
  USD 1,041/kW, battery storage USD 192/kWh (global weighted averages).

## Time handling
All series are indexed in UTC. Local time (Europe/Tirane, CET/CEST with DST) is used only to shape
behavioural demand and price patterns, via pandas tz conversion. Leap days are removed so every year has 8760 h.

## Processing summary
- PV: horizontal irradiance × 1.10 tilt gain × 0.86 losses × temperature derate (−0.4%/°C, NOCT 45 °C).
- Wind: 50 m speed → 100 m hub (shear 0.14), generic 3/12/25 m/s power curve, 0.85 losses; mean of two coastal points.
- Inflow: basin mean precipitation & temperature → snow (T < 0.5 °C) / melt (3 mm/°C/day) → 35% fast
  (k = 1/4 d⁻¹) and 65% slow (k = 1/45 d⁻¹) linear reservoirs → scaled to the assumed mean volume.
  Run-of-river availability: normalised blend of fast and total runoff, capped at 930 MW, scaled to 2.6 TWh/yr.
- Reference year: the 2019–2023 year with inflow index closest to the 2001–2023 median (selected: 2022).

## Known biases
Coarse reanalysis wind (likely low), uncalibrated hydrology, synthetic demand shape, constant export-price ratio.
