# Recording instructions

1. Start the API from the repo root: `.venv/Scripts/python -m uvicorn hydroflex_api.main:app --port 8000`.
   Check `http://127.0.0.1:8000/api/health` returns `"status":"ok"`.
2. Confirm reference experiments exist in `results/experiments/` (run `python -m hydroflex.experiments.run_all` if not).
3. Start the web app: `cd apps/web && npm run build && npm run preview` (port 4173) or `npm run dev` (port 5173).
4. Browser: Chrome, window 1920×1080, zoom 100%, dark theme, bookmarks bar hidden, notifications off.
5. Warm up: run each step of `video/DEMO_SCENARIO.json` once (the first solve loads libraries).
6. Record with OBS Studio (free): 1080p30, display capture, microphone peaking around −12 dB. Narration may be recorded separately.
7. Alternative: **Presentation mode** (`/present`) steps through the same sequence with the arrow keys; each run step calls the API live.
8. After recording, check every spoken number against the screen; adjust `VIDEO_CAPTIONS.srt` timings if needed.
9. Never present a reference experiment as a live run — the "Reference experiment" tag must be visible whenever one is shown.
