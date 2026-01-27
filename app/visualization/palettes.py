# visualization/palettes.py
"""Color palettes for annotation rendering."""

from typing import Tuple, List, Dict

RGBColor = Tuple[int, int, int]

# Landmark palette - high contrast colors for point markers
LANDMARK_PALETTE: List[RGBColor] = [
    (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0),
    (255, 0, 255), (0, 255, 255), (128, 0, 0), (0, 128, 0),
    (0, 0, 128), (128, 128, 0), (128, 0, 128), (0, 128, 128),
    (255, 128, 0), (0, 255, 128), (128, 0, 255), (255, 0, 128),
    (192, 192, 192), (128, 128, 128), (255, 165, 0), (0, 128, 255)
]

# Segment palette - distinctive colors for polygon regions
SEGMENT_PALETTE: List[RGBColor] = [
    (70, 130, 180), (220, 20, 60), (50, 205, 50), (255, 140, 0),
    (138, 43, 226), (0, 139, 139), (205, 92, 92), (60, 179, 113),
    (147, 112, 219), (178, 34, 34), (85, 107, 47), (25, 25, 112),
    (139, 69, 19), (128, 0, 0), (46, 139, 87), (153, 50, 204),
    (255, 99, 71), (0, 100, 0), (72, 61, 139)
]

# Figure palette - colors for geometric shapes
FIGURE_PALETTE: List[RGBColor] = [
    (121, 80, 242), (255, 87, 51), (76, 201, 240), (245, 166, 35),
    (156, 39, 176), (0, 150, 136), (233, 30, 99), (103, 58, 183),
    (255, 152, 0), (0, 188, 212), (139, 195, 74), (255, 193, 7),
    (96, 125, 139), (205, 220, 57), (63, 81, 181), (244, 67, 54),
    (33, 150, 243), (76, 175, 80), (255, 235, 59)
]


def init_colors(names: List[str], palette: List[RGBColor]) -> Dict[str, RGBColor]:
    """Map names to colors, cycling through palette if needed.

    Args:
        names: List of annotation names to assign colors to
        palette: Color palette to use

    Returns:
        Dictionary mapping names to RGB colors
    """
    return {name: palette[i % len(palette)] for i, name in enumerate(names)}
