# visualization/legend.py
"""Legend panel rendering for annotated images."""

from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Image as PILImage
from typing import Dict, Tuple

from app.visualization.palettes import RGBColor


def create_legend_panel(
    image: PILImage,
    visible_landmarks: Dict[str, RGBColor],
    visible_segments: Dict[str, RGBColor],
    visible_figures: Dict[str, Tuple[RGBColor, str]],
    font: ImageFont.FreeTypeFont,
    legend_width: int = 300
) -> PILImage:
    """Create output image with legend panel on the right side.

    Args:
        image: The annotated image
        visible_landmarks: Dict mapping landmark names to colors
        visible_segments: Dict mapping segment names to colors
        visible_figures: Dict mapping figure names to (color, shape) tuples
        font: Font to use for legend text
        legend_width: Width of the legend panel in pixels

    Returns:
        New image with legend panel attached
    """
    if image.mode == 'RGBA':
        image = image.convert('RGB')

    width, height = image.size
    font_size = getattr(font, 'size', 12)

    # Create wider image to accommodate legend
    new_img = Image.new('RGB', (width + legend_width, height), (255, 255, 255))
    new_img.paste(image, (0, 0))

    draw = ImageDraw.Draw(new_img)

    # Legend title
    legend_x = width + 20
    current_y = 30
    draw.text((legend_x, current_y), "LEGEND", fill=(0, 0, 0), font=font)
    current_y += int(font_size * 1.5)

    # Draw segments section
    if visible_segments:
        current_y = _draw_segment_legend(draw, visible_segments, legend_x, current_y, font, font_size)
        current_y += int(font_size * 0.5)

    # Draw figures section
    if visible_figures:
        current_y = _draw_figure_legend(draw, visible_figures, legend_x, current_y, font, font_size)
        current_y += int(font_size * 0.5)

    # Draw landmarks section
    if visible_landmarks:
        current_y = _draw_landmark_legend(draw, visible_landmarks, legend_x, current_y, font, font_size)

    # Empty state message
    if not visible_landmarks and not visible_segments and not visible_figures:
        draw.text((legend_x, current_y), "No annotations visible", fill=(100, 100, 100), font=font)

    return new_img


def _draw_segment_legend(
    draw: ImageDraw.ImageDraw,
    visible_segments: Dict[str, RGBColor],
    legend_x: int,
    current_y: int,
    font: ImageFont.FreeTypeFont,
    font_size: int
) -> int:
    """Draw segment items in legend."""
    draw.text((legend_x, current_y), "SEGMENTS", fill=(80, 80, 80), font=font)
    current_y += int(font_size * 1.2)

    square_size = font_size
    for name, color in visible_segments.items():
        draw.rectangle(
            (legend_x, current_y, legend_x + square_size, current_y + square_size),
            fill=color,
            outline=(0, 0, 0),
            width=1
        )
        draw.text(
            (legend_x + square_size + 10, current_y + square_size // 4),
            name,
            fill=(0, 0, 0),
            font=font
        )
        current_y += int(square_size * 1.5)

    return current_y


def _draw_figure_legend(
    draw: ImageDraw.ImageDraw,
    visible_figures: Dict[str, Tuple[RGBColor, str]],
    legend_x: int,
    current_y: int,
    font: ImageFont.FreeTypeFont,
    font_size: int
) -> int:
    """Draw figure items in legend."""
    draw.text((legend_x, current_y), "FIGURES", fill=(80, 80, 80), font=font)
    current_y += int(font_size * 1.2)

    square_size = font_size
    for name, (color, shape) in visible_figures.items():
        if shape == "circle":
            draw.ellipse(
                (legend_x, current_y, legend_x + square_size, current_y + square_size),
                fill=color, outline=(0, 0, 0), width=1
            )
        elif shape == "line":
            draw.line(
                [(legend_x, current_y + square_size // 2),
                 (legend_x + square_size, current_y + square_size // 2)],
                fill=color, width=3
            )
            point_radius = 2
            draw.ellipse(
                (legend_x - point_radius, current_y + square_size // 2 - point_radius,
                 legend_x + point_radius, current_y + square_size // 2 + point_radius),
                fill=color, outline=(0, 0, 0), width=1
            )
            draw.ellipse(
                (legend_x + square_size - point_radius, current_y + square_size // 2 - point_radius,
                 legend_x + square_size + point_radius, current_y + square_size // 2 + point_radius),
                fill=color, outline=(0, 0, 0), width=1
            )
        else:
            draw.rectangle(
                (legend_x, current_y, legend_x + square_size, current_y + square_size),
                fill=color, outline=(0, 0, 0), width=1
            )

        draw.text(
            (legend_x + square_size + 10, current_y + square_size // 4),
            name, fill=(0, 0, 0), font=font
        )
        current_y += int(square_size * 1.5)

    return current_y


def _draw_landmark_legend(
    draw: ImageDraw.ImageDraw,
    visible_landmarks: Dict[str, RGBColor],
    legend_x: int,
    current_y: int,
    font: ImageFont.FreeTypeFont,
    font_size: int
) -> int:
    """Draw landmark items in legend."""
    draw.text((legend_x, current_y), "POINTS", fill=(80, 80, 80), font=font)
    current_y += int(font_size * 1.2)

    square_size = font_size
    for name, color in visible_landmarks.items():
        draw.rectangle(
            (legend_x, current_y, legend_x + square_size, current_y + square_size),
            fill=color,
            outline=(0, 0, 0),
            width=1
        )
        draw.text(
            (legend_x + square_size + 10, current_y + square_size // 4),
            name,
            fill=(0, 0, 0),
            font=font
        )
        current_y += int(square_size * 1.5)

    return current_y
