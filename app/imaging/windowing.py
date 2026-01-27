# imaging/windowing.py
"""DICOM windowing (level/width) adjustments."""

import numpy as np
from typing import Optional


def apply_windowing(
    pixel_array: np.ndarray,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None
) -> np.ndarray:
    """Apply DICOM windowing (level/width) to map pixel values to display range.

    Windowing controls which range of Hounsfield units (CT) or intensity values
    are mapped to the visible 0-255 grayscale range. Values outside the window
    are clipped to black or white. Auto-calculates from 5th-95th percentiles if
    no window parameters are provided.

    Args:
        pixel_array: Input pixel array
        window_center: Center value of the window (level)
        window_width: Width of the window

    Returns:
        8-bit normalized pixel array
    """
    if window_center is None or window_width is None:
        p5, p95 = np.percentile(pixel_array, (5, 95))
        window_center = (p5 + p95) / 2
        window_width = p95 - p5

    window_min = window_center - window_width / 2
    window_max = window_center + window_width / 2

    if window_max <= window_min:
        return np.zeros_like(pixel_array, dtype=np.uint8)

    windowed = np.clip(pixel_array, window_min, window_max)
    windowed = (windowed - window_min) / (window_max - window_min) * 255.0

    return windowed.astype(np.uint8)


def normalize_to_8bit(pixel_array: np.ndarray) -> np.ndarray:
    """Simple min-max normalization to 8-bit range.

    Args:
        pixel_array: Input pixel array

    Returns:
        8-bit normalized pixel array
    """
    if pixel_array.dtype == np.uint8:
        return pixel_array

    min_val = pixel_array.min()
    max_val = pixel_array.max()

    if max_val <= min_val:
        return np.zeros_like(pixel_array, dtype=np.uint8)

    normalized = (pixel_array - min_val) / (max_val - min_val) * 255
    return normalized.astype(np.uint8)
