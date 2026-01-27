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
    return Path(file_path).suffix.lower() in DICOM_EXTENSIONS


def read_dicom(file_path: Union[str, Path]) -> pydicom.Dataset:
    """Read DICOM file and return dataset."""
    return pydicom.dcmread(str(file_path), force=True)


def extract_pixel_array(dcm: pydicom.Dataset, file_path: Path) -> np.ndarray:
    """Extract pixel array from DICOM dataset. Raises ValueError on failure."""
    try:
        return dcm.pixel_array
    except Exception as e:
        logger.error(f"Failed to extract pixel array from {file_path}: {e}")
        raise ValueError(f"Cannot extract pixel data from DICOM file: {e}")


def get_window_parameters(dcm: pydicom.Dataset) -> Tuple[Optional[float], Optional[float]]:
    """Extract window center and width from DICOM metadata. Either may be None."""
    if not (hasattr(dcm, 'WindowCenter') and hasattr(dcm, 'WindowWidth')):
        return None, None

    try:
        # Handle both scalar and sequence values
        center = dcm.WindowCenter
        width = dcm.WindowWidth

        # Extract first value if sequence
        center_val = center[0] if hasattr(center, '__getitem__') else center
        width_val = width[0] if hasattr(width, '__getitem__') else width

        return float(center_val), float(width_val)
    except (TypeError, ValueError, IndexError):
        return None, None


def should_invert(dcm: pydicom.Dataset, force_invert: bool) -> bool:
    """Determine if image should be inverted based on modality.

    Radiographic modalities (CR, DX, DR, XA) display bones as white;
    inversion is needed for natural appearance.
    """
    return force_invert or (hasattr(dcm, 'Modality') and dcm.Modality in RADIOGRAPHIC_MODALITIES)


def is_rgb_photometric(dcm: pydicom.Dataset) -> bool:
    """Check if DICOM uses RGB photometric interpretation."""
    return hasattr(dcm, 'PhotometricInterpretation') and dcm.PhotometricInterpretation == 'RGB'
