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

    # Draw sections: segments, figures, landmarks
    sections = [
        ("SEGMENTS", visible_segments),
        ("FIGURES", visible_figures),
        ("POINTS", visible_landmarks),
    ]
    for title, items in sections:
        if items:
            current_y = _draw_legend_section(draw, title, items, legend_x, current_y, font, font_size)
            current_y += int(font_size * 0.5)

    # Empty state message
    if not any(items for _, items in sections):
        draw.text((legend_x, current_y), "No annotations visible", fill=(100, 100, 100), font=font)

    return new_img


def _draw_legend_section(
    draw: ImageDraw.ImageDraw,
    title: str,
    items: Dict[str, any],
    legend_x: int,
    current_y: int,
    font: ImageFont.FreeTypeFont,
    font_size: int
) -> int:
    """Draw a legend section with title and items.

    Args:
        draw: ImageDraw context
        title: Section title (e.g., "SEGMENTS", "FIGURES", "POINTS")
        items: Dict of items where values are either colors or (color, shape) tuples
        legend_x: X position for legend
        current_y: Current Y position
        font: Font to use
        font_size: Font size

    Returns:
        Updated Y position after drawing section
    """
    draw.text((legend_x, current_y), title, fill=(80, 80, 80), font=font)
    current_y += int(font_size * 1.2)

    square_size = font_size
    for name, value in items.items():
        # Handle both color tuples and (color, shape) tuples
        if isinstance(value, tuple) and len(value) == 2 and isinstance(value[1], str):
            color, shape = value
        else:
            color, shape = value, "rectangle"

        # Draw shape icon
        if shape == "circle":
            draw.ellipse(
                (legend_x, current_y, legend_x + square_size, current_y + square_size),
                fill=color, outline=(0, 0, 0), width=1
            )
        elif shape == "line":
            mid_y = current_y + square_size // 2
            draw.line(
                [(legend_x, mid_y), (legend_x + square_size, mid_y)],
                fill=color, width=3
            )
            point_radius = 2
            draw.ellipse(
                (legend_x - point_radius, mid_y - point_radius,
                 legend_x + point_radius, mid_y + point_radius),
                fill=color, outline=(0, 0, 0), width=1
            )
            draw.ellipse(
                (legend_x + square_size - point_radius, mid_y - point_radius,
                 legend_x + square_size + point_radius, mid_y + point_radius),
                fill=color, outline=(0, 0, 0), width=1
            )
        else:  # rectangle or default
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
