# images.py
"""Image indexing and navigation for the annotation tool."""
from pathlib import Path
from typing import NamedTuple, List, Optional, Dict, Tuple
import json
import config

IMAGE_EXTENSIONS = ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom')


class ImageReference(NamedTuple):
    """Reference to an image file."""
    patient: str
    filename: str
    full_path: Path

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            'patient': self.patient,
            'filename': self.filename,
            'full_path': str(self.full_path)
        }


class ImageManager:
    """Indexes images and provides navigation between them."""

    def __init__(self, image_dir: str):
        """Initialize with image directory."""
        self.image_dir = Path(image_dir)
        self.all_images = self._index_images()
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
        current_index = self._index_map.get((current_patient, current_image))
        if current_index is None:
            # No current image provided or not found — search from the beginning
            search_order = list(range(len(self.all_images)))
        else:
            search_order = list(range(current_index + 1, len(self.all_images))) + list(range(0, current_index))
        ann_base = Path(config.ANNOTATION_DIR)

        for i in search_order:
            img = self.all_images[i]
            path = ann_base / img.patient / f"{Path(img.filename).stem}_annotations.json"
            if not path.exists():
                return img.to_dict()
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                annotations = data.get('annotations', {})
                has_ok = any(a.get('status') == 'ok' for a in annotations.values() if isinstance(a, dict))
                if not has_ok:
                    return img.to_dict()
            except Exception:
                return img.to_dict()
        return None