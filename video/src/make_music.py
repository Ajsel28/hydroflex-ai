"""Original, copyright-free ambient soundtrack for the HydroFlex AI demo (synthesised from scratch with NumPy).

    python video/src/make_music.py [duration_s=116.2]  ->  video/build/music.wav (44.1 kHz, 16-bit stereo)

Harmony: Am – F – C – G (8 s per chord). Layers: detuned additive pad, sub bass, soft plucked arpeggio
(enters at 12 s, rests during the closing), simple stereo feedback-delay reverb. Licence: same as the repository (MIT).
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[1] / "build" / "music.wav"


def note(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def pad(freqs: list[float], dur: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros((len(t), 2))
    for f in freqs:
        for det, pan in ((-0.004, 0.25), (0.0, 0.5), (0.004, 0.75)):
            ff = f * (1 + det)
            ph = rng.uniform(0, 2 * np.pi)
            sig = sum((0.5 ** k) * np.sin(2 * np.pi * ff * (k + 1) * t + ph * (k + 1)) for k in range(4))
            out[:, 0] += sig * (1 - pan)
            out[:, 1] += sig * pan
    env = np.minimum(1, t / 2.2) * np.minimum(1, (dur - t) / 2.2)
    return out * env[:, None]


def pluck(f: float, dur: float = 1.2) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 4.0)


def main() -> None:
    dur = float(sys.argv[1]) if len(sys.argv) > 1 else 116.2
    rng = np.random.default_rng(20261030)
    n = int(dur * SR)
    mix = np.zeros((n + SR * 3, 2))
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
    bass = [45, 41, 36, 43]
    step = 8.0
    for i in range(int(np.ceil(dur / step))):
        t0 = int(i * step * SR)
        c = chords[i % 4]
        seg = pad([note(m) for m in c] + [note(c[0] + 12)], step + 2.0, rng) * 0.05
        mix[t0:t0 + len(seg)] += seg[: len(mix) - t0]
        tt = np.arange(int((step + 1.0) * SR)) / SR
        b = np.sin(2 * np.pi * note(bass[i % 4]) * tt) * np.minimum(1, tt / 0.6) * np.exp(-tt * 0.15) * 0.06
        mix[t0:t0 + len(b), 0] += b[: len(mix) - t0]
        mix[t0:t0 + len(b), 1] += b[: len(mix) - t0]
        # arpeggio during the demonstration part
        if 12 <= i * step < dur - 10:
            arp = [c[0] + 12, c[1] + 12, c[2] + 12, c[1] + 24]
            for k in range(16):
                ts = int((i * step + k * 0.5) * SR)
                p = pluck(note(arp[k % 4])) * (0.022 if k % 4 == 0 else 0.015)
                pan = 0.35 + 0.3 * ((k % 4) / 3)
                end = min(len(mix), ts + len(p))
                mix[ts:end, 0] += p[: end - ts] * (1 - pan)
                mix[ts:end, 1] += p[: end - ts] * pan
    # stereo feedback delay ("reverb")
    for d, g in ((0.29, 0.35), (0.43, 0.25), (0.61, 0.15)):
        k = int(d * SR)
        mix[k:, 0] += g * mix[:-k, 1]
        mix[k:, 1] += g * mix[:-k, 0]
    mix = mix[:n]
    t = np.arange(n) / SR
    fade = np.minimum(1, t / 2.0) * np.minimum(1, (dur - t) / 4.0)
    mix *= fade[:, None]
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= 10 ** (-6 / 20)  # peak -6 dBFS: background level under on-screen narration
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcm = (mix * 32767).astype("<i2")
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"music: {OUT} ({dur:.1f} s)")


if __name__ == "__main__":
    main()
