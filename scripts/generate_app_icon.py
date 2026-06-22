from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
ASSET_DIR = ROOT / "src" / "assets"


def rounded_line(draw, points, fill, width):
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width // 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_icon(size):
    scale = size / 256
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def s(value):
        return int(round(value * scale))

    draw.ellipse(
        (s(16), s(16), s(240), s(240)),
        fill="#FFFFFF",
    )
    draw_fox_mark(draw, s, include_badge=True)

    return canvas


def draw_fox_mark(draw, s, include_badge):
    draw.polygon(
        [
            (s(52), s(44)),
            (s(108), s(68)),
            (s(148), s(68)),
            (s(204), s(44)),
            (s(184), s(122)),
            (s(160), s(184)),
            (s(96), s(184)),
            (s(72), s(122)),
        ],
        fill="#F97316",
    )
    draw.polygon(
        [(s(72), s(64)), (s(108), s(68)), (s(84), s(100))],
        fill="#FED7AA",
    )
    draw.polygon(
        [(s(184), s(64)), (s(148), s(68)), (s(172), s(100))],
        fill="#FED7AA",
    )
    draw.polygon(
        [
            (s(92), s(122)),
            (s(128), s(86)),
            (s(164), s(122)),
            (s(150), s(184)),
            (s(106), s(184)),
        ],
        fill="#FFFFFF",
    )
    draw.ellipse(
        (s(97), s(109), s(111), s(123)),
        fill="#111827",
    )
    draw.ellipse(
        (s(145), s(109), s(159), s(123)),
        fill="#111827",
    )
    draw.polygon(
        [(s(117), s(142)), (s(139), s(142)), (s(128), s(154))],
        fill="#111827",
    )

    if include_badge:
        draw.ellipse(
            (s(160), s(154), s(208), s(202)),
            fill="#22C55E",
        )
        draw.polygon(
            [(s(176), s(164)), (s(176), s(192)), (s(199), s(178))],
            fill="#FFFFFF",
        )


def draw_header_mark(size):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    scale = size / 152

    def s(value):
        return int(round((value - 52) * scale))

    draw_fox_mark(draw, s, include_badge=False)
    return canvas


def render(size):
    supersampled = draw_icon(size * 4)
    return supersampled.resize((size, size), Image.Resampling.LANCZOS)


def render_header_mark(size):
    supersampled = draw_header_mark(size * 4)
    return supersampled.resize((size, size), Image.Resampling.LANCZOS)


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    outputs = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 256,
    }
    for name, size in outputs.items():
        render(size).save(ICON_DIR / name)

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [render(size) for size in ico_sizes]
    images[-1].save(
        ICON_DIR / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ico_sizes],
        append_images=images[:-1],
    )
    render_header_mark(128).save(ASSET_DIR / "app-mark.png")


if __name__ == "__main__":
    main()
