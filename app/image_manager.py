# images.py
"""Image indexing and navigation for the annotation tool."""
from pathlib import Path
from typing import NamedTuple, List, Optional, Dict, Tuple
import json
import config

IMAGE_EXTENSIONS = ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom')
IMAGE_EXT_SET = frozenset(e.lstrip('*').lower() for e in IMAGE_EXTENSIONS)


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
    """Indexes images and provides navigation between them.

    Re-indexes automatically when the images directory changes on disk
    (mtime-based invalidation, mirrors config.py annotation cache).
    """

    def __init__(self, image_dir: str):
        """Initialize with image directory."""
        self.image_dir = Path(image_dir)
        self.all_images = self._index_images()
        self.num_images = len(self.all_images)
        self._index_map: Dict[Tuple[str, str], int] = {
            (img.patient, img.filename): i for i, img in enumerate(self.all_images)
        }
        self._indexed_mtime: float = self._get_dir_mtime()

    def _get_dir_mtime(self) -> float:
        """Return the maximum mtime across all patient subdirectories."""
        latest = 0.0
        if not self.image_dir.exists():
            return latest
        try:
            latest = max(latest, self.image_dir.stat().st_mtime)
        except OSError:
            pass
        for p in self.image_dir.iterdir():
            try:
                latest = max(latest, p.stat().st_mtime)
            except OSError:
                pass
        return latest

    def _count_images_on_disk(self) -> int:
        """Count image files on disk without building full index."""
        if not self.image_dir.exists():
            return 0
        return sum(
            1 for f in self.image_dir.rglob('*')
            if f.is_file() and f.suffix.lower() in IMAGE_EXT_SET
        )

    def _ensure_fresh(self) -> None:
        """Re-index if count changed OR mtime advanced."""
        mtime = self._get_dir_mtime()
        count = self._count_images_on_disk()
        if count != len(self.all_images) or mtime > self._indexed_mtime:
            self.all_images = self._index_images()
            self.num_images = len(self.all_images)
            self._index_map = {
                (img.patient, img.filename): i
                for i, img in enumerate(self.all_images)
            }
            self._indexed_mtime = self._get_dir_mtime()

    def _index_images(self) -> List[ImageReference]:
        """Scan and index all images, sorted by patient/filename."""
        images = []
        if not self.image_dir.exists():
            return images

        for entry in self.image_dir.iterdir():
            if entry.is_file() and entry.suffix.lower() in IMAGE_EXT_SET:
                # File directly in images/ root — use "" as patient
                images.append(ImageReference(patient="", filename=entry.name, full_path=entry))
            elif entry.is_dir():
                # Patient subdir — rglob finds images at any depth within it
                for img in entry.rglob('*'):
                    if img.is_file() and img.suffix.lower() in IMAGE_EXT_SET:
                        images.append(ImageReference(
                            patient=entry.name,
                            filename=img.relative_to(entry).as_posix(),
                            full_path=img
                        ))

        return sorted(images, key=lambda x: (x.patient, x.filename))

    def get_first_image(self) -> Optional[Dict[str, str]]:
        """Get first image in dataset."""
        self._ensure_fresh()
        return self.all_images[0].to_dict() if self.all_images else None

    def get_image_index(self, patient: str, image: str) -> Optional[int]:
        """Get index of image (O(1) lookup, re-indexes if stale)."""
        self._ensure_fresh()
        return self._index_map.get((patient, image))

    def get_next_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Get next image in sequence."""
        self._ensure_fresh()
        idx = self._index_map.get((current_patient, current_image))
        if idx is not None and idx + 1 < len(self.all_images):
            return self.all_images[idx + 1].to_dict()
        return None

    def get_previous_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Get previous image in sequence."""
        self._ensure_fresh()
        idx = self._index_map.get((current_patient, current_image))
        if idx is not None and idx > 0:
            return self.all_images[idx - 1].to_dict()
        return None

    def get_next_unannotated_image(self, current_patient: str, current_image: str) -> Optional[Dict[str, str]]:
        """Find next image without annotations (wraps around to beginning)."""
        self._ensure_fresh()
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
