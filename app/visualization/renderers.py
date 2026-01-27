# visualization/renderers.py
"""Annotation rendering functions for landmarks, polygons, and figures."""

from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Image as PILImage
from typing import Dict, Any, Tuple, List
import logging

from app.visualization.palettes import RGBColor

logger = logging.getLogger(__name__)


def validate_coordinates(x: float, y: float, width: int, height: int) -> Tuple[float, float]:
    """Clamp coordinates to image bounds."""
    return max(0, min(float(x), width - 1)), max(0, min(float(y), height - 1))


def get_font(base_size: int) -> ImageFont.FreeTypeFont:
    """Get font scaled to image dimensions, falling back to default if unavailable."""
    font_size = max(12, int(base_size * 0.015))
    try:
        return ImageFont.truetype("arial.ttf", font_size)
    except OSError:
        return ImageFont.load_default()


def get_text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    """Get text dimensions (width, height) using Pillow 10+ textbbox API."""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_text_with_background(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    text: str,
    position: Tuple[float, float],
    font: ImageFont.FreeTypeFont
) -> Tuple[PILImage, ImageDraw.ImageDraw]:
    """Draw text with semi-transparent background for readability.

    Args:
        image: Source image
        draw: ImageDraw context
        text: Text to draw
        position: (x, y) position for text
        font: Font to use

    Returns:
        Tuple of (updated image, updated draw context)
    """
    text_x, text_y = position
    text_width, text_height = get_text_size(draw, text, font)

    if image.mode != 'RGBA':
        image = image.convert('RGBA')
        draw = ImageDraw.Draw(image)

    overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle(
        (text_x - 2, text_y - 2, text_x + text_width + 2, text_y + text_height + 2),
        fill=(0, 0, 0, 128)
    )

    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)
    draw.text((text_x, text_y), text, fill=(255, 255, 255), font=font)

    return image, draw


def draw_landmarks(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    landmarks: Dict[str, Any],
    colors: Dict[str, RGBColor],
    font: ImageFont.FreeTypeFont,
    marker_radius: int
) -> Tuple[PILImage, ImageDraw.ImageDraw, Dict[str, RGBColor]]:
    """Draw landmark points on image.

    Args:
        image: Source image
        draw: ImageDraw context
        landmarks: Dict of landmark data by name
        colors: Dict mapping landmark names to RGB colors
        font: Font for labels
        marker_radius: Radius of landmark circles

    Returns:
        Tuple of (updated image, draw context, visible landmarks dict)
    """
    width, height = image.size
    visible_landmarks = {}

    for name, data in landmarks.items():
        try:
            if data.get("status") == "occluded/missing":
                continue

            coords = data.get("coordinates", {})
            if not coords or "x" not in coords or "y" not in coords:
                continue

            x_orig, y_orig = float(coords["x"]), float(coords["y"])
            x, y = validate_coordinates(x_orig, y_orig, width, height)
            color = colors.get(name, (255, 0, 0))

            draw.ellipse(
                (x - marker_radius, y - marker_radius, x + marker_radius, y + marker_radius),
                fill=color,
                outline=(0, 0, 0),
                width=1
            )

            # Position text label
            font_size = getattr(font, 'size', 12)
            text_x = x + marker_radius + 5
            text_y = y - font_size // 2

            if text_x + 100 > width:
                text_x = x - marker_radius - 100
            if text_y < 0:
                text_y = y + marker_radius + 5

            image, draw = draw_text_with_background(image, draw, name, (text_x, text_y), font)
            visible_landmarks[name] = color

        except Exception as e:
            logger.error(f"Error drawing landmark {name}: {e}")

    return image, draw, visible_landmarks


def draw_segments(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    segments: Dict[str, Any],
    colors: Dict[str, RGBColor]
) -> Tuple[PILImage, ImageDraw.ImageDraw, Dict[str, RGBColor]]:
    """Draw polygon segments on image.

    Args:
        image: Source image
        draw: ImageDraw context
        segments: Dict of segment data by name
        colors: Dict mapping segment names to RGB colors

    Returns:
        Tuple of (updated image, draw context, visible segments dict)
    """
    width, height = image.size
    visible_segments = {}

    for name, data in segments.items():
        try:
            if data.get("status") != "ok" or "points" not in data:
                continue

            points_list = data["points"]
            if len(points_list) < 3:
                continue

            color = colors.get(name, (255, 0, 0))

            # Draw polygon outline
            num_points = len(points_list)
            for i in range(num_points):
                p1 = points_list[i]
                p2 = points_list[(i + 1) % num_points]

                x1, y1 = float(p1.get("x", 0)), float(p1.get("y", 0))
                x2, y2 = float(p2.get("x", 0)), float(p2.get("y", 0))

                x1_valid, y1_valid = validate_coordinates(x1, y1, width, height)
                x2_valid, y2_valid = validate_coordinates(x2, y2, width, height)

                draw.line([(x1_valid, y1_valid), (x2_valid, y2_valid)], fill=color, width=3)

            visible_segments[name] = color

        except Exception as e:
            logger.error(f"Error drawing segment {name}: {e}")

    return image, draw, visible_segments


def draw_figures(
    image: PILImage,
    draw: ImageDraw.ImageDraw,
    figures: Dict[str, Any],
    colors: Dict[str, RGBColor],
    font: ImageFont.FreeTypeFont,
    base_size: int
) -> Tuple[PILImage, ImageDraw.ImageDraw, Dict[str, Tuple[RGBColor, str]]]:
    """Draw geometric figures on image.

    Args:
        image: Source image
        draw: ImageDraw context
        figures: Dict of figure data by name
        colors: Dict mapping figure names to RGB colors
        font: Font for labels
        base_size: Base size for scaling calculations

    Returns:
        Tuple of (updated image, draw context, visible figures dict with color and shape)
    """
    width, height = image.size
    visible_figures = {}
    font_size = getattr(font, 'size', 12)

    for name, data in figures.items():
        try:
            if data.get("status") != "ok" or "x" not in data or "y" not in data:
                continue

            x, y = float(data["x"]), float(data["y"])
            size = int(data.get("size", 50))
            shape = data.get("shape", "circle")
            x_valid, y_valid = validate_coordinates(x, y, width, height)
            color = colors.get(name, (121, 80, 242))

            if image.mode != 'RGBA':
                image = image.convert('RGBA')
                draw = ImageDraw.Draw(image)

            half_size = size / 2

            if shape == "line":
                text_x, text_y = _draw_line_figure(
                    draw, data, x_valid, y_valid, size, color, base_size, font_size, width, height
                )
            else:
                bbox = [x_valid - half_size, y_valid - half_size, x_valid + half_size, y_valid + half_size]

                if shape == "circle":
                    draw.ellipse(bbox, fill=None, outline=color, width=3)
                else:  # rectangle or default
                    draw.rectangle(bbox, fill=None, outline=color, width=3)

                text_x = x_valid + half_size + 5
                text_y = y_valid - font_size // 2

            # Adjust text position to stay within bounds
            if text_x + 100 > width:
                text_x = x_valid - half_size - 100
            if text_y < 0:
                text_y = y_valid + half_size + 5

            image, draw = draw_text_with_background(image, draw, name, (text_x, text_y), font)
            visible_figures[name] = (color, shape)

        except Exception as e:
            logger.error(f"Error drawing figure {name}: {e}")

    return image, draw, visible_figures


def _draw_line_figure(
    draw: ImageDraw.ImageDraw,
    data: Dict[str, Any],
    x_valid: float,
    y_valid: float,
    size: int,
    color: RGBColor,
    base_size: int,
    font_size: int,
    width: int,
    height: int
) -> Tuple[float, float]:
    """Draw a line figure and return text position.

    Args:
        draw: ImageDraw context
        data: Figure data dict
        x_valid: Valid center x coordinate
        y_valid: Valid center y coordinate
        size: Figure size
        color: RGB color
        base_size: Base size for scaling
        font_size: Font size for text positioning
        width: Image width
        height: Image height

    Returns:
        Tuple of (text_x, text_y) for label positioning
    """
    if "startX" in data and "startY" in data and "endX" in data and "endY" in data:
        start_x = float(data["startX"])
        start_y = float(data["startY"])
        end_x = float(data["endX"])
        end_y = float(data["endY"])

        start_x_valid, start_y_valid = validate_coordinates(start_x, start_y, width, height)
        end_x_valid, end_y_valid = validate_coordinates(end_x, end_y, width, height)

        draw.line([(start_x_valid, start_y_valid), (end_x_valid, end_y_valid)], fill=color, width=3)

        # Endpoint markers
        point_radius = max(2, int(base_size * 0.002))
        draw.ellipse(
            (start_x_valid - point_radius, start_y_valid - point_radius,
             start_x_valid + point_radius, start_y_valid + point_radius),
            fill=color, outline=(0, 0, 0), width=1
        )
        draw.ellipse(
            (end_x_valid - point_radius, end_y_valid - point_radius,
             end_x_valid + point_radius, end_y_valid + point_radius),
            fill=color, outline=(0, 0, 0), width=1
        )

        text_x = (start_x_valid + end_x_valid) / 2 + 5
        text_y = (start_y_valid + end_y_valid) / 2 - font_size // 2
    else:
        # Fallback: horizontal line from center point
        half_size = size / 2
        draw.line([(x_valid - half_size, y_valid), (x_valid + half_size, y_valid)], fill=color, width=3)
        text_x = x_valid + half_size + 5
        text_y = y_valid - font_size // 2

    return text_x, text_y
