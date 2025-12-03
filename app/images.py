# images.py
"""Image indexing and navigation for the annotation tool."""
from pathlib import Path
from typing import NamedTuple, List, Optional, Dict, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from app.annotations import AnnotationManager

IMAGE_EXTENSIONS = ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom')


class ImageReference(NamedTuple):
    """Reference to an image file."""
    patient: str
    filename: str
    full_path: Path

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary."""
        return {'patient': self.patient, 'filename': self.filename, 'full_path': str(self.full_path)}


class ImageManager:
    """Indexes images and provides navigation between them."""
    
    def __init__(self, image_dir: str, annotation_manager: Optional['AnnotationManager'] = None):
        """Initialize with image directory and optional annotation manager."""
        self.image_dir = Path(image_dir)
        self.all_images = self._index_images()
        self.annotation_manager = annotation_manager
        self.num_images = len(self.all_images)
        # O(1) lookup index
        self._index_map: Dict[Tuple[str, str], int] = {
            (img.patient, img.filename): i for i, img in enumerate(self.all_images)
        }

    def _index_images(self) -> List[ImageReference]:
        """Scan and index all images, sorted by patient/filename."""
        images = []
        if not self.image_dir.exists():
            return images
            
        for patient_dir in self.image_dir.iterdir():
            if patient_dir.is_dir():
                for ext in IMAGE_EXTENSIONS:
                    for img in patient_dir.glob(ext):
                        images.append(ImageReference(
                            patient=patient_dir.name, 
                            filename=img.name, 
                            full_path=img
                        ))
        return sorted(images, key=lambda x: (x.patient, x.filename))
        
    def get_first_image(self) -> Optional[Dict[str, str]]:
        """Get first image in dataset."""
        return self.all_images[0].to_dict() if self.all_images else None

    def get_image_index(self, patient: str, image: str) -> Optional[int]:
        """Get index of image (O(1) lookup)."""
        return self._index_map.get((patient, image))

    def get_next_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Get next image in sequence."""
        idx = self._index_map.get((current_patient, current_image))
        if idx is not None and idx + 1 < len(self.all_images):
            return self.all_images[idx + 1].to_dict()
        return None

    def get_previous_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Get previous image in sequence."""
        idx = self._index_map.get((current_patient, current_image))
        if idx is not None and idx > 0:
            return self.all_images[idx - 1].to_dict()
        return None
    
    def get_next_unannotated_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Find next image without annotations (wraps around to beginning)."""
        if not self.annotation_manager:
            return None
            
        current_index = self._index_map.get((current_patient, current_image))
        if current_index is None:
            return None
        
        # Search forward from current, then wrap to beginning
        search_order = list(range(current_index + 1, len(self.all_images))) + list(range(0, current_index))
        
        for i in search_order:
            img = self.all_images[i]
            annotations = self.annotation_manager.get_all_landmarks(img.patient, img.filename)
            # Check if image has no annotations with 'ok' status
            has_annotations = any(
                data.get('status') == 'ok' 
                for data in annotations.values() 
                if isinstance(data, dict)
            )
            if not has_annotations:
                return img.to_dict()
        return None