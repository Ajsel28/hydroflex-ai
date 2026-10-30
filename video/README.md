# HYDROFLEX AI — demo video

**File:** `HydroFlex_AI_Demo.mp4` (1920×1080, 30 fps, H.264 + AAC, ≈116 s).
**Captions:** `HydroFlex_AI_Demo_Captions.srt`. **Verification report:** `HydroFlex_AI_Demo.verify.json`.

## What is in it
| Time | Content | Source |
|---|---|---|
| 0:00–0:12 | Animated title, Natural Earth outline of Albania, Drin cascade nodes | `src/scenes.html` (motion graphics) |
| 0:12–0:30 | Animated energy-flow architecture; KaTeX equations (energy, water, battery balances) | motion graphics |
| 0:30–0:55 | **Real website footage**: Mission Control (reference run), Climate Stress Lab running a live 168-h HiGHS optimisation | `build/shots/*` captured by `src/capture.mjs` against the local API |
| 0:55–1:07 | Live severe-drought run in the Lab | website footage |
| 1:07–1:15 | Drought results card (annual net imports, cost, ENS) | motion graphics, numbers from experiment files |
| 1:15–1:21 | Live run with a 300 MW / 1,200 MWh battery | website footage |
| 1:21–1:29 | Investment frontier page (reference experiment) | website footage |
| 1:29–1:37 | Marginal value of flexibility bars | motion graphics |
| 1:37–1:49 | Risk page (reference experiment); two-stage stochastic + CVaR, I2 trade-off, chronological validation | footage + graphics |
| 1:49–1:56 | Closing: author, repository, website | motion graphics |

## Honesty rules applied
- Every number on screen comes from `build/scene_numbers.json`, which `src/make_scene_data.py` generates from
  `results/experiments/*.json`. The live-run footage shows the solver's actual output during capture
  (`build/shots/capture_log.json` records the HiGHS status of each run).
- Live runs are tagged "● live HiGHS run"; reference experiments are tagged "● reference experiment".
- The data limitations (synthetic demand and prices, reconstructed inflows, single-node model, no operational
  validation) appear on screen and in the captions.
- **Audio:** an original synthesised ambient track (`src/make_music.py`, MIT). No third-party music.
  There is no voice-over; the narration is on screen and in the captions.

## Rebuild
```bash
# 1. servers: API on :8000 and built web app on :4173 (see the repository README)
cd apps/web && node ../../video/src/capture.mjs && cd ../..   # real footage (live HiGHS runs)
python video/src/make_scene_data.py                            # numbers + map geometry from results
node video/src/render.mjs 30                                   # 3,486 deterministic frames
python video/src/make_music.py 116.2                           # original soundtrack
python video/src/make_captions.py                              # SRT captions
python video/src/encode.py                                     # MP4 + verification report
```
Tools: Playwright (browser capture and frame rendering), KaTeX, FFmpeg (via the `imageio-ffmpeg` wheel), NumPy.
The earlier planning documents (`VIDEO_SCRIPT.md`, `SHOT_LIST.md`, `STORYBOARD.md`, `RECORDING_INSTRUCTIONS.md`)
describe a manual screen-recording alternative.
