"""Build a scroll-seekable transparent process film from a light-backed GIF.

The supplied animation has an opaque white matte.  Removing every white pixel
would also erase the pale desk surfaces, so this script only removes light
pixels connected to the outer canvas and softly feathers the resulting edge.
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


EDGE_SEEDS = (
    (0.00, 0.00),
    (0.50, 0.00),
    (1.00, 0.00),
    (0.00, 0.50),
    (1.00, 0.50),
    (0.00, 1.00),
    (0.50, 1.00),
    (1.00, 1.00),
)


def remove_connected_matte(frame: Image.Image, threshold: int) -> Image.Image:
    rgba = frame.convert("RGBA")
    width, height = rgba.size

    for x_ratio, y_ratio in EDGE_SEEDS:
        point = (
            min(width - 1, round((width - 1) * x_ratio)),
            min(height - 1, round((height - 1) * y_ratio)),
        )
        pixel = rgba.getpixel(point)
        if pixel[3] == 0 or min(pixel[:3]) < 232:
            continue
        ImageDraw.floodfill(rgba, point, (255, 255, 255, 0), thresh=threshold)

    alpha = rgba.getchannel("A")
    removed = alpha.point(lambda value: 255 if value == 0 else 0)
    softened_background = removed.filter(ImageFilter.GaussianBlur(0.7))
    feathered_alpha = ImageChops.darker(alpha, ImageOps.invert(softened_background))
    rgba.putalpha(feathered_alpha)
    return rgba


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_gif", type=Path)
    parser.add_argument("output_webm", type=Path)
    parser.add_argument("output_poster", type=Path)
    parser.add_argument("--ffmpeg", required=True, type=Path)
    parser.add_argument("--size", type=int, default=960)
    parser.add_argument("--threshold", type=int, default=18)
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()

    args.output_webm.parent.mkdir(parents=True, exist_ok=True)
    args.output_poster.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(args.input_gif) as animation, tempfile.TemporaryDirectory(
        prefix="hatab-process-frames-"
    ) as temporary_directory:
        frame_directory = Path(temporary_directory)
        frame_count = getattr(animation, "n_frames", 1)

        for frame_index in range(frame_count):
            animation.seek(frame_index)
            frame = animation.convert("RGBA")
            frame.thumbnail((args.size, args.size), Image.Resampling.LANCZOS)

            canvas = Image.new("RGBA", (args.size, args.size), (255, 255, 255, 255))
            offset = (
                (args.size - frame.width) // 2,
                (args.size - frame.height) // 2,
            )
            canvas.alpha_composite(frame, offset)
            transparent_frame = remove_connected_matte(canvas, args.threshold)

            frame_path = frame_directory / f"frame-{frame_index:04d}.png"
            transparent_frame.save(frame_path, optimize=False, compress_level=2)
            if frame_index == 0:
                transparent_frame.save(args.output_poster, optimize=True)

        command = [
            str(args.ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-framerate",
            str(args.fps),
            "-i",
            str(frame_directory / "frame-%04d.png"),
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
            "-row-mt",
            "1",
            "-deadline",
            "good",
            "-cpu-used",
            "3",
            "-crf",
            "29",
            "-b:v",
            "0",
            "-metadata:s:v:0",
            "alpha_mode=1",
            "-an",
            str(args.output_webm),
        ]
        subprocess.run(command, check=True)

    print(
        {
            "frames": frame_count,
            "size": args.size,
            "webm": str(args.output_webm),
            "poster": str(args.output_poster),
        }
    )


if __name__ == "__main__":
    main()
