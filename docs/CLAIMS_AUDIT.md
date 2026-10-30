# Claims audit

Every headline number quoted in the README, paper abstract and demo video, recomputed from
`results/experiments/*.json` by `scripts/audit_claims.py` (rounding tolerance shown implicitly by the quoted precision).

| Claim | Quoted | Recomputed | OK |
|---|---|---|---|
| Net imports, normal year (TWh) | 0.77 | 0.7679 | ✅ |
| Net imports, moderate drought (TWh) | 2.26 | 2.258 | ✅ |
| Net imports, severe drought (TWh) | 3.48 | 3.477 | ✅ |
| Operating cost normal (MEUR/yr) | 40.8 | 40.8 | ✅ |
| Operating cost severe (MEUR/yr) | 324.5 | 324.5 | ✅ |
| Drought cost increase (MEUR/yr) | 284 | 283.7 | ✅ |
| ENS normal & severe (MWh) | 0 | 0 | ✅ |
| ENS at 50% NTC, +8% demand (GWh) | 311 | 310.7 | ✅ |
| Battery ENS reduction at 50% NTC (%) | 13 | 13.06 | ✅ |
| Battery saving under shortage (MEUR/yr) | 199.8 | 199.8 | ✅ |
| Battery 400/1600 annualised cost (MEUR/yr) | 51.7 | 51.66 | ✅ |
| Battery arbitrage share of cost, min (%) | 13 | 13.36 | ✅ |
| Battery arbitrage share of cost, max (%) | 27 | 27.22 | ✅ |
| PV marginal value, normal (kEUR/MW-yr) | 140 | 139.8 | ✅ |
| PV annualised cost (kEUR/MW-yr) | 80 | 80.11 | ✅ |
| Import-capacity value, compound (kEUR/MW-yr) | 175 | 175.4 | ✅ |
| PV import reduction +500 MW, normal (MWh/MW) | 1074 | 1074 | ✅ |
| PV+battery synergy, normal (MEUR/yr) | 1.75 | 1.753 | ✅ |
| VSS base case (MEUR/yr) | 0.0 | -0 | ✅ |
| I2 CVaR reduction, chronological (MEUR/yr) | 74.5 | 74.46 | ✅ |
| I2 expected-cost increase, chronological (MEUR/yr) | 15.1 | 15.05 | ✅ |
| I2 wind added (MW) | 230 | 229.9 | ✅ |
| Rep-week vs chronology error min (MEUR/yr) | 1.7 | 1.656 | ✅ |
| Rep-week vs chronology error max (MEUR/yr) | 10.0 | 10.01 | ✅ |
| Battery value removed at 6-h steps (%) | 87 | 86.86 | ✅ |
| PyPSA vs native max relative difference | 0.0 | 0 | ✅ |

**26 / 26 claims match.**

Data status (unchanged): NASA POWER meteorology (observed-derived reanalysis), reconstructed river inflows, SYNTHETIC demand and prices, single-node system; no validation against observed Albanian grid operations.
