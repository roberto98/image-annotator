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
    if window_center is None:
        window_center = float((np.percentile(pixel_array, 5) + np.percentile(pixel_array, 95)) / 2)
    if window_width is None:
        window_width = float(np.percentile(pixel_array, 95) - np.percentile(pixel_array, 5))

    window_min: float = window_center - window_width / 2
    window_max: float = window_center + window_width / 2

    windowed = np.clip(pixel_array, window_min, window_max)

    if window_max > window_min:
        windowed = ((windowed - window_min) / (window_max - window_min) * 255.0)
    else:
        windowed = np.zeros_like(windowed)

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

    if pixel_array.max() > pixel_array.min():
        normalized = ((pixel_array - pixel_array.min()) /
                      (pixel_array.max() - pixel_array.min()) * 255)
        return normalized.astype(np.uint8)
    else:
        return np.zeros_like(pixel_array, dtype=np.uint8)
