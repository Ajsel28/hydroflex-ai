# Third-party data, software and attribution

The **code** in this repository is released under the MIT License (`LICENSE`). Third-party data redistributed
here keep their own terms:

| Data | Location | Terms |
|---|---|---|
| NASA POWER hourly/daily point data | `data/raw/nasa_power_*` | Freely available. *"These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program."* |
| Open-Meteo historical weather (ERA5) | `data/raw/open_meteo_*` | CC BY 4.0 — Open-Meteo.com; contains modified Copernicus Climate Change Service information (ERA5). |
| Natural Earth Admin-0 1:50m (subset) | `data/processed/balkans_ne50m.geojson`, web map | Public domain (naturalearthdata.com). |
| Derived profiles, reconstructed inflows, synthetic demand/prices, experiment outputs | `data/processed`, `data/synthetic`, `results/` | MIT (this project). Demand and prices are **synthetic**. |

Technology-cost figures are quoted from IRENA, *Renewable Power Generation Costs in 2024* (2025). Plant capacities
come from KESH. Both are cited in the paper; no IRENA or KESH datasets are redistributed.

Major open-source dependencies (all permissive licences): HiGHS/highspy (MIT), PyPSA (MIT), linopy (MIT),
NumPy/SciPy/pandas (BSD-3), FastAPI (MIT), pydantic (MIT), matplotlib (PSF-style), React (MIT), Vite (MIT),
Tailwind CSS (MIT), Plotly.js (MIT), KaTeX (MIT), d3-geo (ISC), topojson-client (ISC), world-atlas (ISC; Natural
Earth data), lucide (ISC), Motion (MIT), Tectonic (MIT, used only to compile the paper). Web fonts are served by
Google Fonts under the SIL Open Font License.

This is an independent research prototype. It is **not endorsed** by NASA, IRENA, KESH, OST, ERE, Whitman
College or any other institution.
