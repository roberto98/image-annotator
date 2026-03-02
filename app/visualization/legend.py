# visualization/legend.py
"""Legend panel rendering for annotated images."""

from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Image as PILImage
from typing import Dict, Tuple

from app.visualization.palettes import RGBColor

# Maps annotation type to legend section title (order matters for display)
_TYPE_SECTIONS = [
    ("polygon",   "POLYGONS"),
    ("line",      "LINES"),
    ("circle",    "CIRCLES"),
    ("rectangle", "RECTANGLES"),
    ("angle",     "ANGLES"),
    ("point",     "POINTS"),
]


def create_legend_panel(
    image: PILImage,
    visible_annotations: Dict[str, Tuple[RGBColor, str]],
    font: ImageFont.FreeTypeFont,
    legend_width: int = 300,
) -> PILImage:
    """Attach a legend panel to the right of the image.

    Args:
        image: The annotated image.
        visible_annotations: name → (color, ann_type) for every drawn annotation.
        font: Font to use for legend text.
        legend_width: Width of the legend panel in pixels.

    Returns:
        New image with legend panel on the right.
    """
    if image.mode == "RGBA":
        image = image.convert("RGB")

    width, height = image.size
    font_size = getattr(font, "size", 12)

    new_img = Image.new("RGB", (width + legend_width, height), (255, 255, 255))
    new_img.paste(image, (0, 0))
    draw = ImageDraw.Draw(new_img)

    legend_x = width + 20
    y = 30

    draw.text((legend_x, y), "LEGEND", fill=(0, 0, 0), font=font)
    y += int(font_size * 1.5)

    # Group by type in display order
    groups: Dict[str, Dict[str, RGBColor]] = {t: {} for t, _ in _TYPE_SECTIONS}
    for name, (color, ann_type) in visible_annotations.items():
        if ann_type in groups:
            groups[ann_type][name] = color
        else:
            groups.setdefault(ann_type, {})[name] = color

    any_drawn = False
    for ann_type, section_title in _TYPE_SECTIONS:
        items = groups.get(ann_type, {})
        if items:
            y = _draw_section(draw, section_title, ann_type, items, legend_x, y, font, font_size)
            y += int(font_size * 0.5)
            any_drawn = True

    if not any_drawn:
        draw.text((legend_x, y), "No annotations visible", fill=(100, 100, 100), font=font)

    return new_img


def _draw_section(
    draw: ImageDraw.ImageDraw,
    title: str,
    ann_type: str,
    items: Dict[str, RGBColor],
    legend_x: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    font_size: int,
) -> int:
    draw.text((legend_x, y), title, fill=(80, 80, 80), font=font)
    y += int(font_size * 1.2)

    sq = font_size
    for name, color in items.items():
        _draw_type_icon(draw, ann_type, color, legend_x, y, sq)
        draw.text((legend_x + sq + 10, y + sq // 4), name, fill=(0, 0, 0), font=font)
        y += int(sq * 1.5)

    return y


def _draw_type_icon(
    draw: ImageDraw.ImageDraw,
    ann_type: str,
    color: RGBColor,
    x: int,
    y: int,
    sq: int,
) -> None:
    """Draw a small icon representing the annotation type."""
    if ann_type == "point":
        r = sq // 2
        cx, cy = x + r, y + r
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline=(0, 0, 0), width=1)
    elif ann_type == "polygon":
        draw.rectangle((x, y, x + sq, y + sq), fill=color, outline=(0, 0, 0), width=1)
    elif ann_type == "circle":
        r = sq // 2
        cx, cy = x + r, y + r
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=None, outline=color, width=2)
    elif ann_type == "rectangle":
        draw.rectangle((x, y, x + sq, y + sq), fill=None, outline=color, width=2)
    elif ann_type == "line":
        mid_y = y + sq // 2
        draw.line([(x, mid_y), (x + sq, mid_y)], fill=color, width=3)
        r = 2
        draw.ellipse((x - r, mid_y - r, x + r, mid_y + r), fill=color)
        draw.ellipse((x + sq - r, mid_y - r, x + sq + r, mid_y + r), fill=color)
    elif ann_type == "angle":
        # Draw a small "V" (two lines meeting at bottom centre)
        mid_x = x + sq // 2
        draw.line([(x, y), (mid_x, y + sq)], fill=color, width=2)
        draw.line([(x + sq, y), (mid_x, y + sq)], fill=color, width=2)
    else:
        draw.rectangle((x, y, x + sq, y + sq), fill=color, outline=(0, 0, 0), width=1)
