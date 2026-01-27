# imaging/enhancement.py
"""Image enhancement and contrast adjustment utilities."""

from PIL import Image, ImageEnhance
import numpy as np


def enhance_contrast_adaptive(
    img: Image.Image,
    contrast_factor: float = 1.5,
    sharpness_factor: float = 1.3
) -> Image.Image:
    """Apply percentile-based contrast stretching with sharpness enhancement.

    Uses the 2nd-98th percentile range to stretch the histogram, reducing
    the influence of outliers on the final contrast.

    Args:
        img: Input PIL Image
        contrast_factor: Contrast enhancement multiplier (1.0 = no change)
        sharpness_factor: Sharpness enhancement multiplier (1.0 = no change)

    Returns:
        Enhanced PIL Image
    """
    img_array = np.array(img)

    # Stretch histogram using 2nd-98th percentile to reduce outlier influence
    p2, p98 = np.percentile(img_array, (2, 98))
    if p98 > p2:
        img_rescale = np.clip((img_array - p2) / (p98 - p2) * 255.0, 0, 255).astype(np.uint8)
    else:
        img_rescale = img_array.astype(np.uint8)

    enhanced = Image.fromarray(img_rescale)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(contrast_factor)
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(sharpness_factor)

    return enhanced
