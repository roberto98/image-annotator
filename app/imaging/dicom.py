# imaging/dicom.py
"""DICOM-specific image loading and processing."""

from pathlib import Path
import pydicom
from PIL import Image
import numpy as np
import logging
from typing import Union, Optional, Tuple

logger = logging.getLogger(__name__)

DICOM_EXTENSIONS = {'.dcm', '.dicom'}
RADIOGRAPHIC_MODALITIES = ['CR', 'DX', 'DR', 'XA']


def is_dicom_file(file_path: Union[str, Path]) -> bool:
    """Check if file has a DICOM extension (.dcm or .dicom)."""
    if isinstance(file_path, str):
        file_path = Path(file_path)
    return file_path.suffix.lower() in DICOM_EXTENSIONS


def read_dicom(file_path: Union[str, Path]) -> pydicom.Dataset:
    """Read DICOM file and return dataset.

    Args:
        file_path: Path to DICOM file

    Returns:
        pydicom Dataset object
    """
    return pydicom.dcmread(str(file_path), force=True)


def extract_pixel_array(dcm: pydicom.Dataset, file_path: Path) -> np.ndarray:
    """Extract pixel array from DICOM dataset with fallback handling.

    Args:
        dcm: pydicom Dataset object
        file_path: Path to file (for error messages)

    Returns:
        NumPy array of pixel data

    Raises:
        ValueError: If pixel data cannot be extracted
    """
    try:
        return dcm.pixel_array
    except Exception as e:
        logger.error(f"Error reading DICOM pixel array from {file_path}: {e}")

        # Fallback: try modality LUT for compressed/unusual DICOM formats
        if hasattr(dcm, 'PixelData'):
            try:
                from pydicom.pixel_data_handlers.util import apply_modality_lut
                return apply_modality_lut(dcm.PixelData, dcm)
            except Exception:
                pass

        # Return blank image as last resort
        logger.error(f"Could not extract pixel data from {file_path}")
        width = int(dcm.get('Columns', 512))
        height = int(dcm.get('Rows', 512))
        return np.zeros((height, width), dtype=np.uint8)


def get_window_parameters(dcm: pydicom.Dataset) -> Tuple[Optional[float], Optional[float]]:
    """Extract window center and width from DICOM metadata.

    Args:
        dcm: pydicom Dataset object

    Returns:
        Tuple of (window_center, window_width), either may be None
    """
    window_center = None
    window_width = None

    if hasattr(dcm, 'WindowCenter') and hasattr(dcm, 'WindowWidth'):
        try:
            window_center = float(dcm.WindowCenter)
            window_width = float(dcm.WindowWidth)
        except (TypeError, ValueError):
            # Handle multi-value window settings (stored as sequences)
            try:
                window_center = float(dcm.WindowCenter[0])
                window_width = float(dcm.WindowWidth[0])
            except (TypeError, ValueError, IndexError):
                pass

    return window_center, window_width


def should_invert(dcm: pydicom.Dataset, force_invert: bool) -> bool:
    """Determine if image should be inverted based on modality.

    Radiographic modalities (CR, DX, DR, XA) display bones as white;
    inversion is needed for natural appearance.

    Args:
        dcm: pydicom Dataset object
        force_invert: Override flag for forced inversion

    Returns:
        True if image should be inverted
    """
    if force_invert:
        return True

    if hasattr(dcm, 'Modality') and dcm.Modality in RADIOGRAPHIC_MODALITIES:
        return True

    return False


def is_rgb_photometric(dcm: pydicom.Dataset) -> bool:
    """Check if DICOM uses RGB photometric interpretation."""
    return hasattr(dcm, 'PhotometricInterpretation') and dcm.PhotometricInterpretation == 'RGB'
