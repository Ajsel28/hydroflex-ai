"""Download public meteorological data for Albania and record provenance.

Sources (no API key required):
  * NASA POWER hourly/daily point API (MERRA-2 meteorology, CERES/MERRA-2 irradiance)
  * Open-Meteo historical archive (ERA5 reanalysis) — used as an independent cross-check

Run:  python -m hydroflex.data.fetch
Raw responses are stored under data/raw/, one provenance JSON per dataset under data/provenance/.
All timestamps are UTC (NASA POWER ``time-standard=UTC``; Open-Meteo ``timezone=GMT``).
"""

from __future__ import annotations

import datetime as dt
import json
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from hydroflex import DATA_DIR

RAW = DATA_DIR / "raw"
PROV = DATA_DIR / "provenance"

POWER_HOURLY = "https://power.larc.nasa.gov/api/temporal/hourly/point"
POWER_DAILY = "https://power.larc.nasa.gov/api/temporal/daily/point"
OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"


@dataclass(frozen=True)
class Site:
    key: str
    name: str
    lat: float
    lon: float
    role: str


# Points are chosen to represent resource regions, NOT specific power plants.
SITES: list[Site] = [
    Site("solar_fier", "Fier / Myzeqe plain (coastal lowland)", 40.92, 19.55, "solar"),
    Site("solar_vlore", "Vlorë coastal plain", 40.47, 19.49, "solar"),
    Site("wind_vlore", "Vlorë–Karaburun coast", 40.40, 19.35, "wind"),
    Site("wind_lezhe", "Lezhë–Shëngjin coast", 41.78, 19.60, "wind"),
    Site("load_tirana", "Tirana (demand temperature proxy)", 41.33, 19.82, "demand"),
]

# Drin basin precipitation points (White Drin, Black Drin, Kukës/Fierza, Koman)
BASIN: list[Site] = [
    Site("drin_white", "White Drin upper basin", 42.55, 20.55, "hydro"),
    Site("drin_black", "Black Drin basin", 41.55, 20.55, "hydro"),
    Site("drin_kukes", "Kukës / Fierza reservoir area", 42.10, 20.40, "hydro"),
    Site("drin_koman", "Koman / Vau i Dejës area", 42.05, 19.85, "hydro"),
]

HOURLY_PARAMS = "ALLSKY_SFC_SW_DWN,T2M,WS50M,WS10M"
HOURLY_YEARS = [2019, 2020, 2021, 2022, 2023]
DAILY_START, DAILY_END = "20000101", "20231231"


def _get(url: str, dest: Path, retries: int = 3) -> bool:
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310 (fixed https hosts)
                dest.write_bytes(r.read())
            return True
        except Exception as exc:  # pragma: no cover - network
            print(f"  attempt {attempt + 1} failed: {exc}")
            time.sleep(3 * (attempt + 1))
    return False


def _provenance(key: str, **fields: object) -> None:
    PROV.mkdir(parents=True, exist_ok=True)
    rec = {"dataset_id": key, "date_accessed": dt.date.today().isoformat(), **fields}
    (PROV / f"{key}.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")


def fetch_power_hourly() -> None:
    for s in SITES:
        for y in HOURLY_YEARS:
            dest = RAW / f"nasa_power_hourly_{s.key}_{y}.csv"
            if dest.exists() and dest.stat().st_size > 10_000:
                continue
            url = (f"{POWER_HOURLY}?parameters={HOURLY_PARAMS}&community=RE&longitude={s.lon}"
                   f"&latitude={s.lat}&start={y}0101&end={y}1231&format=CSV&time-standard=UTC")
            print(f"NASA POWER hourly {s.key} {y}")
            ok = _get(url, dest)
            if not ok:
                print(f"  FAILED {s.key} {y}")
        _provenance(
            f"nasa_power_hourly_{s.key}",
            name=f"NASA POWER hourly meteorology — {s.name}",
            provider="NASA Langley Research Center, POWER Project",
            source_url=f"{POWER_HOURLY}?parameters={HOURLY_PARAMS}&community=RE&longitude={s.lon}&latitude={s.lat}",
            geographic_coverage=f"point lat={s.lat}, lon={s.lon} (native grid ~0.5°x0.625° meteorology, 1°x1° solar)",
            time_coverage=f"{HOURLY_YEARS[0]}-01-01 to {HOURLY_YEARS[-1]}-12-31",
            temporal_resolution="hourly",
            time_standard="UTC",
            units={"ALLSKY_SFC_SW_DWN": "W/m^2 (all-sky surface shortwave downward irradiance)",
                   "T2M": "degC (2 m air temperature)", "WS50M": "m/s (50 m wind speed)",
                   "WS10M": "m/s (10 m wind speed)"},
            license="NASA POWER data are freely available; acknowledgement requested by NASA POWER",
            processing="Raw CSV as delivered; converted to capacity factors / demand drivers in hydroflex.data.profiles",
            nature="observed-derived reanalysis / satellite estimate (NOT measured power production)",
            role=s.role,
        )


def fetch_power_daily_basin() -> None:
    for s in BASIN:
        dest = RAW / f"nasa_power_daily_{s.key}.csv"
        if not (dest.exists() and dest.stat().st_size > 10_000):
            url = (f"{POWER_DAILY}?parameters=PRECTOTCORR,T2M&community=RE&longitude={s.lon}&latitude={s.lat}"
                   f"&start={DAILY_START}&end={DAILY_END}&format=CSV&time-standard=UTC")
            print(f"NASA POWER daily {s.key}")
            _get(url, dest)
        _provenance(
            f"nasa_power_daily_{s.key}",
            name=f"NASA POWER daily precipitation — {s.name}",
            provider="NASA Langley Research Center, POWER Project",
            source_url=f"{POWER_DAILY}?parameters=PRECTOTCORR,T2M&community=RE&longitude={s.lon}&latitude={s.lat}",
            geographic_coverage=f"point lat={s.lat}, lon={s.lon}",
            time_coverage="2000-01-01 to 2023-12-31",
            temporal_resolution="daily",
            time_standard="UTC",
            units={"PRECTOTCORR": "mm/day (bias-corrected total precipitation, MERRA-2)", "T2M": "degC"},
            license="NASA POWER data are freely available; acknowledgement requested by NASA POWER",
            processing="Basin-averaged; transformed by a conceptual linear-reservoir rainfall-runoff model into a "
                       "RECONSTRUCTED inflow index (hydroflex.data.profiles.build_inflow)",
            nature="observed-derived reanalysis precipitation; downstream inflows are reconstructed, NOT gauged",
            role="hydro",
        )


def fetch_open_meteo_crosscheck() -> None:
    s = SITES[-1]
    dest = RAW / "open_meteo_era5_tirana_2021.json"
    if not (dest.exists() and dest.stat().st_size > 10_000):
        url = (f"{OPEN_METEO}?latitude={s.lat}&longitude={s.lon}&start_date=2021-01-01&end_date=2021-12-31"
               "&hourly=temperature_2m,shortwave_radiation,wind_speed_100m&timezone=GMT")
        print("Open-Meteo ERA5 Tirana 2021")
        _get(url, dest)
    _provenance(
        "open_meteo_era5_tirana_2021",
        name="Open-Meteo historical weather (ERA5) — Tirana, 2021",
        provider="Open-Meteo.com (Copernicus ERA5 reanalysis)",
        source_url=OPEN_METEO,
        geographic_coverage=f"point lat={s.lat}, lon={s.lon}",
        time_coverage="2021-01-01 to 2021-12-31",
        temporal_resolution="hourly",
        time_standard="UTC (GMT)",
        units={"temperature_2m": "degC", "shortwave_radiation": "W/m^2", "wind_speed_100m": "km/h"},
        license="Open-Meteo data CC BY 4.0; ERA5 contains modified Copernicus Climate Change Service information",
        processing="Used only to cross-check NASA POWER temperature and irradiance (reanalysis vs reanalysis)",
        nature="reanalysis",
        role="cross-check",
    )


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    fetch_power_daily_basin()
    fetch_power_hourly()
    fetch_open_meteo_crosscheck()
    print("done")


if __name__ == "__main__":
    main()
