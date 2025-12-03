# polygon_utils.py
"""Polygon to binary mask conversion utilities."""
import numpy as np
from PIL import Image, ImageDraw
from typing import List, Dict, Tuple


def generate_mask_from_polygon(
    polygon_points: List[Dict[str, float]], 
    width: int, 
    height: int
) -> np.ndarray:
    """Generate binary mask from polygon vertices.
    
    Args:
        polygon_points: Vertices as [{"x": x1, "y": y1}, ...] (min 3 points).
        width, height: Output mask dimensions.
        
    Returns:
        Binary numpy array (height, width) with 1 inside polygon, 0 outside.
    """
    if len(polygon_points) < 3:
        raise ValueError("Polygon must have at least 3 points")
    
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    
    points: List[Tuple[float, float]] = [
        (float(point['x']), float(point['y'])) 
        for point in polygon_points
    ]
    
    draw.polygon(points, fill=255)
    mask_array = np.array(mask) // 255
    
    return mask_array
