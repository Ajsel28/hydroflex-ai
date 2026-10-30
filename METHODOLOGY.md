# Methodology

Units: power MW, energy MWh, water hm³ (10⁶ m³), money kEUR inside the optimiser (EUR for prices), time step Δt in hours.
Timestamps are UTC.

## 1. Decision structure
- **First stage** (shared by all scenarios): `x_pv, x_w` (MW), `x_bp` (MW), `x_be` (MWh). Each lies in
  `[x⁰, x⁰ + x̄]` when investing and is fixed otherwise. `x_imp` (MW) and `x_vmax` (hm³) are always fixed;
  modelling them as variables lets their reduced costs be read as marginal values.
- **Second stage** (per scenario s, step t): `g_pv, g_w, g_ror, h, σ, V, c, d, e, m, y, u`, all ≥ 0.

## 2. Objective
```
min  w Σ_k A_k (x_k − x_k⁰)  +  Σ_s π_s L_s  +  λ [ ζ + 1/(1−α) Σ_s π_s φ_s ]
L_s = Σ_t Δt ( p_m m − ρ p_m y + VOLL u + c_h h + c_deg d ) / 1000
φ_s ≥ L_s − ζ ,  φ_s ≥ 0
```
`A_k = C_k [CRF(r, n_k) + f_k]`; `w = TΔt/8760`. Existing capacity is sunk and not charged.

## 3. Constraints
| Name | Equation |
|---|---|
| Energy balance | `g_pv + g_w + g_ror + h + d + m + u = D + c + y` (dual = marginal cost) |
| VRE availability | `g_pv ≤ f_pv x_pv`, `g_w ≤ f_w x_w` (curtailment = available − g; not double counted) |
| Run-of-river | `g_ror ≤ R` |
| Water balance | `V_{t+1} = V_t + Δt (I − h/κ − σ)`, `V_min ≤ V ≤ x_vmax`, `κ = ρ g H η·10⁶/3.6·10⁹` |
| Turbine / release | `h ≤ P_h`, `h/κ + σ ≥ r_min` |
| Terminal | `V_0 = V⁰`, `V_T ≥ V^T` (annual: `V^T = V⁰`; windows: nested boundary) |
| Battery | `e_{t+1} = e_t + Δt (η_c c − d/η_d)`, `ε x_be ≤ e ≤ x_be`, `c, d ≤ x_bp`, `e_0 = s₀ x_be`, `e_T ≥ e_0`, `x_be ≤ δ_max x_bp` |
| Interconnection | `m ≤ a_s x_imp`, `y ≤ Y` |
| Shortage | `u ≤ D` |
| Budget | `Σ_k C_k (x_k − x_k⁰) ≤ B` |

## 4. Time structure
- Dispatch studies: full chronological year (8760 h), with `V_T = V_0`.
- Short live windows (168 h, 720 h): **nested boundary**, where `V_0` and `V_T` come from a 6-hourly annual run of the
  same scenario and fleet.
- Investment and stochastic studies: **representative weeks**. Each scenario gets 8 hourly weeks (days 7, 52, …, 325; each
  weighted 1/8). A week starts at the reservoir volume of a coarse (6-h) full-year run of that scenario with the
  *existing* fleet. Its end volume is not constrained; instead it is valued at that run's **marginal water value**
  (dual of the water balance, kEUR/hm³). This is a first-order future-cost function:
  objective += π·wv·(V_target − V_T). The boundaries are fleet-independent, so optimisation, deterministic-plan
  evaluation, wait-and-see runs and the frontier all share them. CVaR is defined per scenario over its weeks.
  The live API uses 4 weeks.
  - *Why a water value:* an earlier version pinned V_T ≥ V_target (hard boundary) and recomputed boundaries per
    fleet. Re-evaluating plans with full-year chronology showed that this created spurious scarcity in sampled weeks
    and overstated expected cost by 0.6–20.4 MEUR/yr. With the water value the absolute error is 1.7–10.0 MEUR/yr (7 plans) and the
    ranking of the strategies tested matches chronology (`exp-H-chronological-check`; superseded hard-boundary
    artefacts kept in `results/superseded/`).
- The resolution study quantifies the downward bias in storage value at 2, 3 and 6 h steps.

## 5. Solvers
HiGHS via highspy. Dispatch uses the default strategy. Chronological multi-scenario and annual investment
problems use IPM with crossover. Representative-week problems use dual simplex, because the first-stage
columns are dense and stall IPM.

## 6. Metrics
ENS, loss-of-load hours and probability, peak shortfall, gross/net imports, import-limit binding hours,
curtailment, reservoir minimum and spill, battery throughput and cycles, domestic-supply share, operating and
total cost, cost per MWh served, and the shadow price (mean, max). Every run also reports conservation residuals.

## 7. Stochastic diagnostics
- **RP**: optimal value of the stochastic programme (risk term excluded when comparing expected cost).
- **EEV**: the deterministic plan (optimised for the normal scenario only), evaluated on all scenarios.
- **VSS = EEV − RP**, **WS** = Σ π_s · (optimal value with scenario s known), **EVPI = RP − WS**.

## 8. Marginal value of flexibility
`MV_k = c_k − d̄_k − (A_firststage^T y)_k`. This is a subgradient of the convex, piecewise-linear value function,
so `Δ⁺ ≤ MV ≤ Δ⁻`, where Δ⁺ and Δ⁻ are the finite-difference values of adding the next increment and of the
last increment. Duals at zero-capacity corners are flagged unreliable; finite differences are reported
alongside them.

## 9. Scenario construction
See `hydroflex/climate/scenarios.py` and the paper, Section 3.
