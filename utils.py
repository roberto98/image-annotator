# utils.py
"""Image loading utilities with DICOM support and contrast enhancement.

This module provides backward compatibility. The implementation has been
refactored into app/imaging/ for better maintainability.
"""

# Re-export from the refactored module for backward compatibility
from app.imaging import (
    load_image,
    is_dicom_file,
    apply_windowing,
    enhance_contrast_adaptive
)

__all__ = ['load_image', 'is_dicom_file', 'apply_windowing', 'enhance_contrast_adaptive']
