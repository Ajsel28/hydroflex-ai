"""Encode rendered frames + original soundtrack into the final MP4 and verify it.

    python video/src/encode.py  ->  video/HydroFlex_AI_Demo.mp4  (H.264 High, 1920x1080, 30 fps, AAC 192 kb/s)
Uses the FFmpeg build bundled with the `imageio-ffmpeg` wheel (no system install).
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
B = ROOT / "video" / "build"
OUT = ROOT / "video" / "HydroFlex_AI_Demo.mp4"


def main() -> None:
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    frames = sorted((B / "frames").glob("*.jpg"))
    if not frames:
        raise SystemExit("no frames: run node video/src/render.mjs first")
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-framerate", "30", "-i", str(B / "frames" / "%05d.jpg"),
           "-i", str(B / "music.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
           "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
           "-color_trc", "bt709", "-color_range", "tv", "-profile:v", "high", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-shortest",
           "-movflags", "+faststart", "-metadata", "title=HYDROFLEX AI — research demo",
           "-metadata", "artist=Ajsel Budlla", "-metadata", "comment=Music: original synthesis (video/src/make_music.py)",
           str(OUT)]
    subprocess.run(cmd, check=True)
    # verification: decode the whole file and read stream info
    probe = subprocess.run([ff, "-hide_banner", "-i", str(OUT), "-f", "null", "-"], capture_output=True, text=True)
    info = probe.stderr
    head = probe.stderr.split("Output #0")[0]
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    seconds = int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3)) if dur else None
    vid = re.search(r"Video: (\w+).*?, (\d+)x(\d+).*?, ([\d.]+) fps", head)
    aud = re.search(r"Audio: (\w+).*?, (\d+) Hz", head)
    pix = re.search(r"Video: \w+.*?, (yuv\w+)", head)
    frames_out = re.findall(r"frame=\s*(\d+)", info)
    report = {"file": str(OUT.relative_to(ROOT)), "bytes": OUT.stat().st_size, "duration_s": seconds,
              "video_codec": vid.group(1) if vid else None, "width": int(vid.group(2)) if vid else None,
              "height": int(vid.group(3)) if vid else None, "fps": float(vid.group(4)) if vid else None,
              "audio": f"{aud.group(1)} {aud.group(2)} Hz" if aud else None, "pix_fmt": pix.group(1) if pix else None,
              "decoded_frames": int(frames_out[-1]) if frames_out else None, "input_frames": len(frames),
              "decode_errors": probe.returncode != 0 or "error" in info.lower().split("output #0")[-1]}
    (ROOT / "video" / "HydroFlex_AI_Demo.verify.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
