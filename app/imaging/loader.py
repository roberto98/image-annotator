# imaging/loader.py
"""Unified image loading facade supporting multiple formats."""

from pathlib import Path
from PIL import Image, ImageOps
import logging
from typing import Union

from app.imaging.dicom import (
    is_dicom_file,
    read_dicom,
    extract_pixel_array,
    get_window_parameters,
    should_invert,
    is_rgb_photometric
)
from app.imaging.windowing import apply_windowing, normalize_to_8bit
from app.imaging.enhancement import enhance_contrast_adaptive

logger = logging.getLogger(__name__)

# Re-export for convenience
__all__ = ['load_image', 'is_dicom_file']


def load_image(
    image_path: Union[str, Path],
    force_invert_dicom: bool = True,
    high_quality: bool = False
) -> Image.Image:
    """Load image file (PNG, JPG, DICOM) and return as RGB PIL Image.

    DICOM files undergo: pixel extraction -> windowing -> 8-bit normalization.
    Radiographic images (CR, DX, DR, XA) are inverted for proper bone/tissue display.

    Args:
        image_path: Path to image file
        force_invert_dicom: Whether to force inversion for DICOM images
        high_quality: Use DICOM window values and contrast enhancement

    Returns:
        RGB PIL Image

    Raises:
        ValueError: If DICOM pixel data cannot be extracted.
    """
    if isinstance(image_path, str):
        image_path = Path(image_path)

    if not is_dicom_file(image_path):
        return Image.open(image_path)

    return _load_dicom_image(image_path, force_invert_dicom, high_quality)


def _load_dicom_image(
    image_path: Path,
    force_invert_dicom: bool,
    high_quality: bool
) -> Image.Image:
    """Internal: Load and process DICOM image."""
    try:
        dcm = read_dicom(image_path)
        pixel_array = extract_pixel_array(dcm, image_path)

        # Handle case where extraction failed and returned zeros
        if pixel_array.size == 0:
            return Image.new('RGB', (512, 512), 0)

        invert_image = should_invert(dcm, force_invert_dicom)

        if high_quality:
            window_center, window_width = get_window_parameters(dcm)
            pixel_array = apply_windowing(pixel_array, window_center, window_width)
        else:
            pixel_array = normalize_to_8bit(pixel_array)

        # Create PIL Image
        if is_rgb_photometric(dcm):
            img = Image.fromarray(pixel_array, 'RGB')
        else:
            img = Image.fromarray(pixel_array, 'L')
            if invert_image:
                img = ImageOps.invert(img)
            if high_quality:
                img = enhance_contrast_adaptive(img)
            img = img.convert('RGB')

        return img

    except Exception as e:
        logger.error(f"Error loading DICOM file {image_path}: {e}")
        raise ValueError(f"Error loading DICOM file: {e}")
