from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
INSTALLER_DIR = ROOT / "src-tauri" / "installer"


def fox_mark(size, include_badge=True):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    scale = size / 256

    def s(value):
        return int(round(value * scale))

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
    draw.polygon([(s(72), s(64)), (s(108), s(68)), (s(84), s(100))], fill="#FED7AA")
    draw.polygon([(s(184), s(64)), (s(148), s(68)), (s(172), s(100))], fill="#FED7AA")
    draw.polygon(
        [(s(92), s(122)), (s(128), s(86)), (s(164), s(122)), (s(150), s(184)), (s(106), s(184))],
        fill="#FFFFFF",
    )
    draw.ellipse((s(97), s(109), s(111), s(123)), fill="#111827")
    draw.ellipse((s(145), s(109), s(159), s(123)), fill="#111827")
    draw.polygon([(s(117), s(142)), (s(139), s(142)), (s(128), s(154))], fill="#111827")

    if include_badge:
        draw.ellipse((s(160), s(154), s(208), s(202)), fill="#22C55E")
        draw.polygon([(s(176), s(164)), (s(176), s(192)), (s(199), s(178))], fill="#FFFFFF")

    return canvas


def paste_center(base, overlay, center):
    base.alpha_composite(overlay, (center[0] - overlay.width // 2, center[1] - overlay.height // 2))


def save_bmp(image, path):
    image.convert("RGB").save(path, format="BMP")


def make_sidebar():
    image = Image.new("RGBA", (164, 314), "#FFF7ED")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 163, 313), fill="#FFF7ED")
    draw.rectangle((0, 0, 163, 313), outline="#FED7AA", width=1)
    draw.rectangle((0, 0, 163, 8), fill="#F97316")

    draw.ellipse((31, 45, 133, 147), fill="#FFFFFF")
    paste_center(image, fox_mark(94, include_badge=True), (82, 103))

    draw.rounded_rectangle((36, 198, 128, 224), radius=13, fill="#F97316")
    draw.polygon([(74, 205), (74, 217), (86, 211)], fill="#FFFFFF")

    draw.line((36, 250, 128, 250), fill="#FDBA74", width=2)
    draw.line((52, 266, 112, 266), fill="#FED7AA", width=2)
    return image


def make_header():
    image = Image.new("RGBA", (150, 57), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 149, 56), fill="#FFFFFF")
    draw.rectangle((0, 53, 149, 56), fill="#F97316")
    draw.ellipse((8, 8, 48, 48), fill="#FFF7ED")
    paste_center(image, fox_mark(38, include_badge=False), (28, 30))
    draw.rounded_rectangle((60, 18, 134, 38), radius=10, fill="#FFF7ED", outline="#FDBA74", width=1)
    draw.polygon([(89, 23), (89, 33), (99, 28)], fill="#F97316")
    return image


def main():
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)
    save_bmp(make_sidebar(), INSTALLER_DIR / "sidebar.bmp")
    save_bmp(make_header(), INSTALLER_DIR / "header.bmp")


if __name__ == "__main__":
    main()
