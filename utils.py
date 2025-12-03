"""Image loading utilities with DICOM support and contrast enhancement."""
from pathlib import Path
import pydicom
from PIL import Image, ImageOps, ImageEnhance
import numpy as np
import logging
from typing import Union, Optional

logger = logging.getLogger(__name__)

DICOM_EXTENSIONS = {'.dcm', '.dicom'}


def is_dicom_file(file_path: Union[str, Path]) -> bool:
    """Check if file has a DICOM extension (.dcm or .dicom)."""
    if isinstance(file_path, str):
        file_path = Path(file_path)
    return file_path.suffix.lower() in DICOM_EXTENSIONS

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

def enhance_contrast_adaptive(img: Image.Image) -> Image.Image:
    """Apply percentile-based contrast stretching with sharpness enhancement."""
    img_array = np.array(img)
    
    # Stretch histogram using 2nd-98th percentile to reduce outlier influence
    p2, p98 = np.percentile(img_array, (2, 98))
    if p98 > p2:
        img_rescale = np.clip((img_array - p2) / (p98 - p2) * 255.0, 0, 255).astype(np.uint8)
    else:
        img_rescale = img_array.astype(np.uint8)
    
    enhanced = Image.fromarray(img_rescale)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.5)
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.3)
    
    return enhanced

def load_image(
    image_path: Union[str, Path], 
    force_invert_dicom: bool = True, 
    high_quality: bool = False
) -> Image.Image:
    """Load image file (PNG, JPG, DICOM) and return as RGB PIL Image.
    
    DICOM files undergo: pixel extraction -> windowing -> 8-bit normalization.
    Radiographic images (CR, DX, DR, XA) are inverted for proper bone/tissue display.
    
    Raises:
        ValueError: If DICOM pixel data cannot be extracted.
    """
    if isinstance(image_path, str):
        image_path = Path(image_path)
        
    if is_dicom_file(image_path):
        try:
            dcm = pydicom.dcmread(str(image_path), force=True)
            
            try:
                pixel_array = dcm.pixel_array
            except Exception as e:
                logger.error(f"Error reading DICOM pixel array from {image_path}: {e}")
                # Fallback: try modality LUT for compressed/unusual DICOM formats
                if hasattr(dcm, 'PixelData'):
                    try:
                        from pydicom.pixel_data_handlers.util import apply_modality_lut
                        pixel_array = apply_modality_lut(dcm.PixelData, dcm)
                    except:
                        logger.error(f"Could not extract pixel data from {image_path}, creating blank image")
                        width = int(dcm.get('Columns', 512))
                        height = int(dcm.get('Rows', 512))
                        return Image.new('L', (width, height), 0)
                else:
                    return Image.new('L', (512, 512), 0)
            
            invert_image = force_invert_dicom
            
            # Radiographic modalities display bones as white; inversion needed for natural appearance
            radiographic_modalities = ['CR', 'DX', 'DR', 'XA']
            if hasattr(dcm, 'Modality') and dcm.Modality in radiographic_modalities:
                invert_image = True
            
            if high_quality:
                # Use DICOM-embedded window values if available, else auto-calculate
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
                
                pixel_array = apply_windowing(pixel_array, window_center, window_width)
            else:
                # Simple min-max normalization for non-high-quality mode
                if pixel_array.dtype != np.uint8:
                    if pixel_array.max() > pixel_array.min():
                        pixel_array = ((pixel_array - pixel_array.min()) / 
                                      (pixel_array.max() - pixel_array.min()) * 255).astype(np.uint8)
                    else:
                        pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)
            
            if hasattr(dcm, 'PhotometricInterpretation') and dcm.PhotometricInterpretation == 'RGB':
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
    else:
        return Image.open(image_path)