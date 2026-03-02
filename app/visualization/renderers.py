# visualization/renderers.py
"""Annotation rendering functions for all annotation types."""

import math
from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Image as PILImage
from typing import Any, Dict, Tuple
import logging

from app.visualization.palettes import RGBColor

logger = logging.getLogger(__name__)

# Scaling factors relative to min(image_width, image_height)
FONT_SCALE: float = 0.015
POINT_SCALE: float = 0.002


def validate_coordinates(x: float, y: float, width: int, height: int) -> Tuple[float, float]:
    """Clamp coordinates to image bounds."""
    return max(0.0, min(float(x), width - 1)), max(0.0, min(float(y), height - 1))


def get_font(base_size: int) -> ImageFont.FreeTypeFont:
    """Get font scaled to image dimensions, falling back to default if unavailable."""
    font_size = max(12, int(base_size * FONT_SCALE))
    try:
        return ImageFont.truetype("arial.ttf", font_size)
    except OSError:
        return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _draw_label(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    text: str,
    x: float,
    y: float,
    font: ImageFont.FreeTypeFont,
) -> Tuple[PILImage, ImageDraw.ImageDraw]:
    """Draw text with a semi-transparent dark background bubble."""
    tw, th = _text_size(draw, text, font)
    if image.mode != "RGBA":
        image = image.convert("RGBA")
        draw = ImageDraw.Draw(image)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((x - 2, y - 2, x + tw + 2, y + th + 2), fill=(0, 0, 0, 128))
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)
    draw.text((x, y), text, fill=(255, 255, 255), font=font)
    return image, draw


def _endpoint_marker(
    draw: ImageDraw.ImageDraw, x: float, y: float, color: RGBColor, radius: int = 4
) -> None:
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill=color, outline=(0, 0, 0), width=1,
    )


# ---------------------------------------------------------------------------
# Type-specific draw functions
# Each returns (image, draw, was_drawn: bool)
# ---------------------------------------------------------------------------

def draw_point_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
    marker_radius: int,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {x, y}"""
    x, y = data.get("x"), data.get("y")
    if x is None or y is None:
        return image, draw, False

    w, h = image.size
    x, y = validate_coordinates(float(x), float(y), w, h)
    draw.ellipse(
        (x - marker_radius, y - marker_radius, x + marker_radius, y + marker_radius),
        fill=color, outline=(0, 0, 0), width=1,
    )

    font_size = getattr(font, "size", 12)
    lx = x + marker_radius + 4
    ly = y - font_size // 2
    if lx + 100 > w:
        lx = x - marker_radius - 104
    if ly < 0:
        ly = y + marker_radius + 4
    image, draw = _draw_label(image, draw, name, lx, ly, font)
    return image, draw, True


def draw_polygon_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {points: [{x,y},...], closed: bool}"""
    pts_raw = data.get("points", [])
    if len(pts_raw) < 2:
        return image, draw, False

    w, h = image.size
    pts = [
        validate_coordinates(float(p.get("x", 0)), float(p.get("y", 0)), w, h)
        for p in pts_raw if isinstance(p, dict)
    ]
    if len(pts) < 2:
        return image, draw, False

    closed = data.get("closed", True)
    n = len(pts)
    for i in range(n):
        next_i = (i + 1) % n if closed else i + 1
        if next_i >= n:
            break
        draw.line([pts[i], pts[next_i]], fill=color, width=3)

    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    image, draw = _draw_label(image, draw, name, cx, cy, font)
    return image, draw, True


def draw_line_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
    base_size: int,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {start:{x,y}, end:{x,y}}"""
    start = data.get("start") or {}
    end = data.get("end") or {}
    if not start or not end:
        return image, draw, False

    w, h = image.size
    sx, sy = validate_coordinates(float(start.get("x", 0)), float(start.get("y", 0)), w, h)
    ex, ey = validate_coordinates(float(end.get("x", 0)), float(end.get("y", 0)), w, h)

    draw.line([(sx, sy), (ex, ey)], fill=color, width=3)

    ep_r = max(3, int(base_size * POINT_SCALE))
    _endpoint_marker(draw, sx, sy, color, ep_r)
    _endpoint_marker(draw, ex, ey, color, ep_r)

    length_px = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
    label = f"{name} ({length_px:.0f}px)"
    image, draw = _draw_label(image, draw, label, (sx + ex) / 2, (sy + ey) / 2, font)
    return image, draw, True


def draw_circle_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {center:{x,y}, radius:number}"""
    center = data.get("center") or {}
    radius = data.get("radius")
    if not center or radius is None:
        return image, draw, False

    w, h = image.size
    cx, cy = validate_coordinates(float(center.get("x", 0)), float(center.get("y", 0)), w, h)
    r = float(radius)

    if image.mode != "RGBA":
        image = image.convert("RGBA")
        draw = ImageDraw.Draw(image)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=None, outline=color, width=3)

    font_size = getattr(font, "size", 12)
    image, draw = _draw_label(image, draw, name, cx + r + 4, cy - font_size // 2, font)
    return image, draw, True


def draw_rectangle_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {topLeft:{x,y}, bottomRight:{x,y}}"""
    tl = data.get("topLeft") or {}
    br = data.get("bottomRight") or {}
    if not tl or not br:
        return image, draw, False

    w, h = image.size
    x1, y1 = validate_coordinates(float(tl.get("x", 0)), float(tl.get("y", 0)), w, h)
    x2, y2 = validate_coordinates(float(br.get("x", 0)), float(br.get("y", 0)), w, h)

    if image.mode != "RGBA":
        image = image.convert("RGBA")
        draw = ImageDraw.Draw(image)
    draw.rectangle([(x1, y1), (x2, y2)], fill=None, outline=color, width=3)

    font_size = getattr(font, "size", 12)
    label_y = max(0.0, y1 - font_size - 4)
    image, draw = _draw_label(image, draw, name, x1, label_y, font)
    return image, draw, True


def draw_angle_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
    base_size: int,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """data = {point1:{x,y}, vertex:{x,y}, point2:{x,y}}"""
    p1_raw = data.get("point1") or {}
    vx_raw = data.get("vertex") or {}
    p2_raw = data.get("point2") or {}
    if not p1_raw or not vx_raw or not p2_raw:
        return image, draw, False

    w, h = image.size
    p1x, p1y = validate_coordinates(float(p1_raw.get("x", 0)), float(p1_raw.get("y", 0)), w, h)
    vx, vy = validate_coordinates(float(vx_raw.get("x", 0)), float(vx_raw.get("y", 0)), w, h)
    p2x, p2y = validate_coordinates(float(p2_raw.get("x", 0)), float(p2_raw.get("y", 0)), w, h)

    draw.line([(vx, vy), (p1x, p1y)], fill=color, width=2)
    draw.line([(vx, vy), (p2x, p2y)], fill=color, width=2)

    ep_r = max(3, int(base_size * POINT_SCALE))
    _endpoint_marker(draw, p1x, p1y, color, ep_r)
    _endpoint_marker(draw, p2x, p2y, color, ep_r)
    _endpoint_marker(draw, vx, vy, color, ep_r)

    arc_r = max(15, int(base_size * 0.015))
    a1 = math.degrees(math.atan2(p1y - vy, p1x - vx))
    a2 = math.degrees(math.atan2(p2y - vy, p2x - vx))
    arc_start, arc_end = min(a1, a2), max(a1, a2)
    if arc_end - arc_start > 180:
        arc_start, arc_end = arc_end, arc_start + 360
    draw.arc(
        [vx - arc_r, vy - arc_r, vx + arc_r, vy + arc_r],
        start=arc_start, end=arc_end, fill=color, width=2,
    )

    dx1, dy1 = p1x - vx, p1y - vy
    dx2, dy2 = p2x - vx, p2y - vy
    mag1 = math.sqrt(dx1 ** 2 + dy1 ** 2)
    mag2 = math.sqrt(dx2 ** 2 + dy2 ** 2)
    if mag1 > 0 and mag2 > 0:
        cos_a = max(-1.0, min(1.0, (dx1 * dx2 + dy1 * dy2) / (mag1 * mag2)))
        label = f"{name} ({math.degrees(math.acos(cos_a)):.1f}\u00b0)"
    else:
        label = name

    font_size = getattr(font, "size", 12)
    image, draw = _draw_label(image, draw, label, vx + arc_r + 4, vy - font_size // 2, font)
    return image, draw, True


# ---------------------------------------------------------------------------
# Unified dispatcher
# ---------------------------------------------------------------------------

_DISPATCH = {
    "point": lambda img, dr, n, d, c, f, mr, bs: draw_point_annotation(img, dr, n, d, c, f, mr),
    "polygon": lambda img, dr, n, d, c, f, mr, bs: draw_polygon_annotation(img, dr, n, d, c, f),
    "line": lambda img, dr, n, d, c, f, mr, bs: draw_line_annotation(img, dr, n, d, c, f, bs),
    "circle": lambda img, dr, n, d, c, f, mr, bs: draw_circle_annotation(img, dr, n, d, c, f),
    "rectangle": lambda img, dr, n, d, c, f, mr, bs: draw_rectangle_annotation(img, dr, n, d, c, f),
    "angle": lambda img, dr, n, d, c, f, mr, bs: draw_angle_annotation(img, dr, n, d, c, f, bs),
}


def draw_annotation(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    name: str,
    ann_type: str,
    data: Dict[str, Any],
    color: RGBColor,
    font: ImageFont.FreeTypeFont,
    marker_radius: int,
    base_size: int,
) -> Tuple[PILImage, ImageDraw.ImageDraw, bool]:
    """Dispatch a single annotation to its type-specific renderer.

    Returns (image, draw, was_drawn).
    """
    handler = _DISPATCH.get(ann_type)
    if handler is None:
        logger.warning("[Renderer] Unknown type %r for %r — skipping", ann_type, name)
        return image, draw, False
    return handler(image, draw, name, data, color, font, marker_radius, base_size)
