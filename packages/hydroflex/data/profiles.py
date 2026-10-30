"""Transform raw meteorology into model input profiles.

Every output series carries a ``nature`` label:

* ``weather-derived``  — physically modelled from NASA POWER reanalysis (PV, wind capacity factors).
                          These are NOT measured power production.
* ``reconstructed``    — conceptual hydrological model driven by observed-derived precipitation
                          (reservoir inflow, run-of-river availability). NOT gauged inflows.
* ``synthetic``        — generated from documented assumptions and a fixed random seed (demand, prices).
                          SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS.

Internally every timestamp is UTC. Local time (Europe/Tirane, CET/CEST) is used only to shape
behavioural demand and price patterns, and conversions are done with pandas tz handling.

Run:  python -m hydroflex.data.profiles
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from hydroflex import DATA_DIR, SYNTHETIC_LABEL
from hydroflex.data.fetch import BASIN, HOURLY_YEARS

RAW = DATA_DIR / "raw"
PROCESSED = DATA_DIR / "processed"
PROV = DATA_DIR / "provenance"
SEED = 20260101
LOCAL_TZ = "Europe/Tirane"


# ----------------------------------------------------------------------------------------------
# Assumptions used to calibrate reconstructed / synthetic series (all documented in DATA_CARD.md)
# ----------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class ProfileAssumptions:
    annual_demand_twh: float = 8.0          # assumed gross national demand incl. losses (order of magnitude)
    heating_base_c: float = 16.0
    cooling_base_c: float = 24.0
    heating_slope: float = 0.030            # fractional load increase per degC below base
    cooling_slope: float = 0.035            # fractional load increase per degC above base
    demand_noise_sd: float = 0.02
    drin_mean_energy_twh: float = 4.1       # assumed long-run mean Drin cascade energy (Fierza ~1.33 TWh/yr reported)
    ror_mean_energy_twh: float = 2.6        # assumed long-run mean energy of other hydro (run-of-river aggregate)
    ror_capacity_mw: float = 930.0
    cascade_mwh_per_hm3: float = 551.6      # rho*g*H*eta/3.6e9*1e6 with H=230 m, eta=0.88 (see config)
    import_price_mean: float = 105.0        # EUR/MWh, synthetic regional wholesale price level
    price_noise_sd: float = 0.08
    snow_threshold_c: float = 0.5
    degree_day_factor: float = 3.0          # mm / degC / day
    fast_fraction: float = 0.35
    k_fast_per_day: float = 1 / 4.0
    k_slow_per_day: float = 1 / 45.0
    pv_system_losses: float = 0.86
    pv_tilt_gain: float = 1.10
    pv_temp_coeff: float = -0.004
    pv_noct_c: float = 45.0
    wind_hub_m: float = 100.0
    wind_shear: float = 0.14
    wind_losses: float = 0.85


A = ProfileAssumptions()


# ----------------------------------------------------------------------------------------------
# Readers
# ----------------------------------------------------------------------------------------------
def _read_power_csv(path: Path) -> pd.DataFrame:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("-END HEADER-")) + 1
    df = pd.read_csv(path, skiprows=start)
    if "HR" in df.columns:
        idx = pd.to_datetime(dict(year=df.YEAR, month=df.MO, day=df.DY, hour=df.HR), utc=True)
    else:
        idx = pd.to_datetime(dict(year=df.YEAR, month=df.MO, day=df.DY), utc=True)
    df.index = idx
    df = df.drop(columns=[c for c in ("YEAR", "MO", "DY", "HR") if c in df.columns])
    return df.replace(-999.0, np.nan).interpolate(limit_direction="both")


def read_hourly(site_key: str, year: int) -> pd.DataFrame:
    return _read_power_csv(RAW / f"nasa_power_hourly_{site_key}_{year}.csv")


def raw_available() -> bool:
    need = [RAW / f"nasa_power_daily_{b.key}.csv" for b in BASIN]
    need += [RAW / f"nasa_power_hourly_{k}_{y}.csv" for k in ("solar_fier", "wind_vlore", "wind_lezhe", "load_tirana")
             for y in HOURLY_YEARS]
    return all(p.exists() for p in need)


# ----------------------------------------------------------------------------------------------
# Physical conversions
# ----------------------------------------------------------------------------------------------
def pv_capacity_factor(ghi_wm2: np.ndarray, t_air_c: np.ndarray) -> np.ndarray:
    """Simplified PVWatts-style model on horizontal irradiance with a constant tilt gain.

    cf = min(1, GHI*gain/1000 * losses * (1 + gamma*(T_cell - 25))),
    T_cell = T_air + GHI*(NOCT-20)/800.
    """
    ghi = np.clip(ghi_wm2, 0, None)
    t_cell = t_air_c + ghi * (A.pv_noct_c - 20.0) / 800.0
    cf = ghi * A.pv_tilt_gain / 1000.0 * A.pv_system_losses * (1 + A.pv_temp_coeff * (t_cell - 25.0))
    return np.clip(cf, 0.0, 1.0)


def wind_power_curve(v_hub: np.ndarray) -> np.ndarray:
    """Generic IEC class-II turbine curve: cubic ramp 3->12 m/s, rated to 25 m/s cut-out."""
    v = np.asarray(v_hub, dtype=float)
    cf = np.where((v >= 3.0) & (v < 12.0), (v**3 - 27.0) / (12.0**3 - 27.0), 0.0)
    cf = np.where((v >= 12.0) & (v <= 25.0), 1.0, cf)
    return cf


def wind_capacity_factor(ws50: np.ndarray) -> np.ndarray:
    v_hub = ws50 * (A.wind_hub_m / 50.0) ** A.wind_shear
    return np.clip(wind_power_curve(v_hub) * A.wind_losses, 0.0, 1.0)


# ----------------------------------------------------------------------------------------------
# Hydrology: degree-day snow + two parallel linear reservoirs (conceptual, uncalibrated to gauges)
# ----------------------------------------------------------------------------------------------
def basin_daily() -> pd.DataFrame:
    frames = [_read_power_csv(RAW / f"nasa_power_daily_{b.key}.csv") for b in BASIN]
    p = pd.concat([f["PRECTOTCORR"] for f in frames], axis=1).mean(axis=1)
    t = pd.concat([f["T2M"] for f in frames], axis=1).mean(axis=1)
    return pd.DataFrame({"precip_mm": p, "t2m_c": t})


def runoff_index(daily: pd.DataFrame) -> pd.DataFrame:
    """Return unscaled runoff (mm/day) and its fast component."""
    snow = fast = slow = 0.0
    q, qf = [], []
    for p, t in zip(daily.precip_mm.to_numpy(), daily.t2m_c.to_numpy(), strict=True):
        if t < A.snow_threshold_c:
            snow += p
            rain = 0.0
        else:
            rain = p
        melt = min(snow, max(t, 0.0) * A.degree_day_factor)
        snow -= melt
        w = rain + melt
        fast += A.fast_fraction * w
        slow += (1 - A.fast_fraction) * w
        of, os_ = A.k_fast_per_day * fast, A.k_slow_per_day * slow
        fast -= of
        slow -= os_
        q.append(of + os_)
        qf.append(of)
    return pd.DataFrame({"runoff_mm": q, "fast_mm": qf}, index=daily.index)


def build_inflow() -> pd.DataFrame:
    """Reconstructed daily inflow (hm3/h) for the aggregated Drin reservoir and ROR availability (MW).

    Scaling: the 2001–2023 mean annual inflow volume equals the volume needed to produce the assumed
    long-run mean cascade energy. Year 2000 is used as hydrological spin-up and discarded.
    """
    daily = basin_daily()
    ro = runoff_index(daily).loc["2001":"2023"]
    years = ro.index.year
    mean_annual_runoff = ro.runoff_mm.groupby(years).sum().mean()
    target_hm3 = A.drin_mean_energy_twh * 1e6 / A.cascade_mwh_per_hm3
    scale = target_hm3 / mean_annual_runoff                 # hm3 per mm of index runoff
    inflow_hm3_day = ro.runoff_mm * scale
    out = pd.DataFrame({"drin_inflow_hm3_per_h": inflow_hm3_day / 24.0})
    # Run-of-river: normalised flow index with a bias to the faster component (small catchments)
    idx = 0.6 * ro.fast_mm / ro.fast_mm.mean() + 0.4 * ro.runoff_mm / ro.runoff_mm.mean()
    target_mwh = A.ror_mean_energy_twh * 1e6
    lo, hi = 0.0, 5.0
    for _ in range(60):  # bisection on the scaling such that capped mean energy matches target
        mid = 0.5 * (lo + hi)
        e = (np.minimum(A.ror_capacity_mw, mid * idx * A.ror_capacity_mw) * 24).groupby(years).sum().mean()
        lo, hi = (mid, hi) if e < target_mwh else (lo, mid)
    out["ror_avail_mw"] = np.minimum(A.ror_capacity_mw, lo * idx * A.ror_capacity_mw)
    out["basin_precip_mm"] = daily.precip_mm.loc["2001":"2023"]
    out["basin_t2m_c"] = daily.t2m_c.loc["2001":"2023"]
    return out


# ----------------------------------------------------------------------------------------------
# Synthetic demand and prices (explicitly synthetic)
# ----------------------------------------------------------------------------------------------
_DIURNAL = np.array([0.80, 0.76, 0.74, 0.73, 0.74, 0.79, 0.88, 0.97, 1.02, 1.03, 1.03, 1.02,
                     1.01, 0.99, 0.97, 0.97, 1.00, 1.07, 1.15, 1.18, 1.16, 1.09, 0.99, 0.88])
_PRICE_DIURNAL = np.array([0.88, 0.84, 0.82, 0.81, 0.83, 0.90, 1.02, 1.12, 1.08, 0.98, 0.88, 0.82,
                           0.78, 0.78, 0.82, 0.90, 1.02, 1.18, 1.30, 1.32, 1.22, 1.08, 0.98, 0.92])
_PRICE_MONTH = np.array([1.18, 1.10, 0.98, 0.86, 0.80, 0.92, 1.08, 1.10, 1.00, 0.98, 1.04, 1.16])


def synthetic_demand(t_air_c: pd.Series, rng: np.random.Generator) -> pd.Series:
    local = t_air_c.index.tz_convert(LOCAL_TZ)
    hdh = np.clip(A.heating_base_c - t_air_c.to_numpy(), 0, None)
    cdh = np.clip(t_air_c.to_numpy() - A.cooling_base_c, 0, None)
    weekday = np.where(local.dayofweek >= 5, 0.93, 1.0)
    shape = _DIURNAL[local.hour] * weekday * (1 + A.heating_slope * hdh + A.cooling_slope * cdh)
    noise = np.empty(len(shape))
    e = 0.0
    for i in range(len(shape)):  # AR(1) with persistence 0.9
        e = 0.9 * e + rng.normal(0, A.demand_noise_sd * np.sqrt(1 - 0.81))
        noise[i] = e
    shape = shape * (1 + noise)
    hours = len(shape)
    scale = A.annual_demand_twh * 1e6 * (hours / 8760.0) / shape.sum()
    return pd.Series(shape * scale, index=t_air_c.index, name="demand_mw")


def synthetic_import_price(index: pd.DatetimeIndex, rng: np.random.Generator) -> pd.Series:
    local = index.tz_convert(LOCAL_TZ)
    base = A.import_price_mean * _PRICE_DIURNAL[local.hour] * _PRICE_MONTH[local.month - 1]
    noise = np.empty(len(index))
    e = 0.0
    for i in range(len(index)):
        e = 0.95 * e + rng.normal(0, A.price_noise_sd * np.sqrt(1 - 0.95**2))
        noise[i] = e
    p = base * np.exp(noise)
    p = p * A.import_price_mean / p.mean()
    return pd.Series(p, index=index, name="import_price_eur_mwh")


# ----------------------------------------------------------------------------------------------
# Assembly
# ----------------------------------------------------------------------------------------------
def hourly_profiles(year: int, inflow: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED + year)
    solar = read_hourly("solar_fier", year)
    w1, w2 = read_hourly("wind_vlore", year), read_hourly("wind_lezhe", year)
    load = read_hourly("load_tirana", year)
    idx = solar.index
    if len(idx) == 8784:  # leap year: drop 29 Feb so every year has 8760 steps
        keep = ~((idx.month == 2) & (idx.day == 29))
        solar, w1, w2, load = (d[keep] for d in (solar, w1, w2, load))
        idx = solar.index
    df = pd.DataFrame(index=idx)
    df["pv_cf"] = pv_capacity_factor(solar.ALLSKY_SFC_SW_DWN.to_numpy(), solar.T2M.to_numpy())
    df["wind_cf"] = 0.5 * (wind_capacity_factor(w1.WS50M.to_numpy()) + wind_capacity_factor(w2.WS50M.to_numpy()))
    df["t2m_tirana_c"] = load.T2M.to_numpy()
    df["demand_mw"] = synthetic_demand(load.T2M, rng).to_numpy()
    df["import_price_eur_mwh"] = synthetic_import_price(idx, rng).to_numpy()
    day = idx.floor("D")
    inf = inflow.reindex(pd.DatetimeIndex(day.unique()))
    df["drin_inflow_hm3_per_h"] = inf.drin_inflow_hm3_per_h.reindex(day).to_numpy()
    df["ror_avail_mw"] = inf.ror_avail_mw.reindex(day).to_numpy()
    return df


def choose_reference_year(inflow: pd.DataFrame) -> tuple[int, pd.Series]:
    annual = inflow.drin_inflow_hm3_per_h.groupby(inflow.index.year).sum() * 24.0
    index = annual / annual.mean()
    candidates = index.loc[HOURLY_YEARS]
    ref = int((candidates - index.median()).abs().idxmin())
    return ref, index


def build_all() -> dict:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    inflow = build_inflow()
    inflow.to_csv(PROCESSED / "inflow_daily_2001_2023.csv", index_label="date_utc")
    ref, index = choose_reference_year(inflow)
    index.rename("annual_inflow_index").to_csv(PROCESSED / "annual_inflow_index.csv", index_label="year")
    summary: dict = {"reference_year": ref, "years": {}}
    for y in HOURLY_YEARS:
        df = hourly_profiles(y, inflow)
        df.to_csv(PROCESSED / f"hourly_profiles_{y}.csv", index_label="timestamp_utc")
        summary["years"][y] = {
            "pv_cf_mean": round(float(df.pv_cf.mean()), 4),
            "wind_cf_mean": round(float(df.wind_cf.mean()), 4),
            "demand_twh": round(float(df.demand_mw.sum() / 1e6), 3),
            "demand_peak_mw": round(float(df.demand_mw.max()), 1),
            "drin_inflow_hm3": round(float(df.drin_inflow_hm3_per_h.sum()), 1),
            "ror_energy_twh": round(float(df.ror_avail_mw.sum() / 1e6), 3),
            "import_price_mean": round(float(df.import_price_eur_mwh.mean()), 2),
            "inflow_index": round(float(index.loc[y]), 3),
        }
    summary["inflow_index_quantiles"] = {q: round(float(index.quantile(q)), 3) for q in (0.05, 0.25, 0.5, 0.75, 0.95)}
    summary["inflow_index_min_year"] = int(index.idxmin())
    summary["inflow_index_min"] = round(float(index.min()), 3)
    (PROCESSED / "profile_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    _write_processed_provenance(ref)
    return summary


def _write_processed_provenance(ref: int) -> None:
    common = {"date_accessed": pd.Timestamp.now("UTC").date().isoformat(), "time_standard": "UTC",
              "geographic_coverage": "Albania (aggregate single-node representation)"}
    records = {
        "processed_hourly_profiles": {
            "name": "HydroFlex hourly model inputs (one file per weather year 2019–2023)",
            "provider": "Derived by HydroFlex AI from NASA POWER (see raw provenance records)",
            "source_url": "local: data/processed/hourly_profiles_<year>.csv",
            "time_coverage": "2019–2023, 8760 h per year (29 Feb removed in leap years)",
            "temporal_resolution": "hourly",
            "units": {"pv_cf": "p.u. of installed MWp", "wind_cf": "p.u. of installed MW", "demand_mw": "MW",
                      "import_price_eur_mwh": "EUR/MWh", "drin_inflow_hm3_per_h": "hm3/h",
                      "ror_avail_mw": "MW", "t2m_tirana_c": "degC"},
            "nature": {"pv_cf": "weather-derived", "wind_cf": "weather-derived",
                       "demand_mw": f"synthetic ({SYNTHETIC_LABEL})",
                       "import_price_eur_mwh": f"synthetic ({SYNTHETIC_LABEL})",
                       "drin_inflow_hm3_per_h": "reconstructed (conceptual hydrology, not gauged)",
                       "ror_avail_mw": "reconstructed (conceptual hydrology, not gauged)",
                       "t2m_tirana_c": "reanalysis"},
            "processing": "See hydroflex.data.profiles; reference year selected as the 2019–2023 year whose "
                          f"reconstructed inflow index is closest to the 2001–2023 median: {ref}",
            "random_seed": f"{SEED} + year",
            "license": "Derived data released with the repository (MIT); NASA POWER acknowledgement applies",
        },
        "processed_inflow_daily": {
            "name": "Reconstructed daily Drin inflow and run-of-river availability 2001–2023",
            "provider": "Derived by HydroFlex AI from NASA POWER daily precipitation and temperature",
            "source_url": "local: data/processed/inflow_daily_2001_2023.csv",
            "time_coverage": "2001-01-01 to 2023-12-31 (2000 used as spin-up)",
            "temporal_resolution": "daily",
            "units": {"drin_inflow_hm3_per_h": "hm3/h (daily mean)", "ror_avail_mw": "MW"},
            "nature": "reconstructed — volume scaled to an assumed long-run mean energy; NOT observed inflows",
            "processing": "Degree-day snow model + two parallel linear reservoirs; parameters assumed, not "
                          "calibrated against gauge records (none were accessible)",
            "license": "Derived data (MIT)",
        },
    }
    for key, rec in records.items():
        (PROV / f"{key}.json").write_text(json.dumps({"dataset_id": key, **common, **rec}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    print(json.dumps(build_all(), indent=2))
