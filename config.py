# config.py
"""Application configuration and annotation type management.

Annotation types (landmark, polygon, figure) are auto-discovered from existing
annotation files - no external configuration required. Results are cached and
invalidated when annotation files change.
"""
from pathlib import Path
import json
import shutil
from typing import List, Dict, Any, Tuple, Optional, Set

BASE_DIR = Path.cwd()
IMAGE_HEIGHT = 600
IMAGE_DIR = str(BASE_DIR / "images")
ANNOTATION_DIR = str(BASE_DIR / "annotations")

_annotation_cache: Optional[Dict[str, Any]] = None
_cache_mtime: float = 0


def _get_annotations_dir_mtime() -> float:
    """Get latest modification time of annotation files for cache invalidation."""
    annotation_dir = Path(ANNOTATION_DIR)
    if not annotation_dir.exists():
        return 0

    latest_mtime = 0
    for folder in annotation_dir.iterdir():
        if folder.is_dir() and not folder.name.startswith("__"):
            for file in folder.glob("*.json"):
                try:
                    mtime = file.stat().st_mtime
                    if mtime > latest_mtime:
                        latest_mtime = mtime
                except OSError:
                    continue
    return latest_mtime


def _invalidate_cache() -> None:
    """Force cache invalidation after modifications."""
    global _annotation_cache, _cache_mtime
    _annotation_cache = None
    _cache_mtime = 0


def _get_total_images() -> int:
    """Count total images across all patient directories."""
    total = 0
    image_path = Path(IMAGE_DIR)
    if not image_path.exists():
        return 1

    for patient_dir in image_path.iterdir():
        if patient_dir.is_dir():
            for ext in ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom'):
                total += len(list(patient_dir.glob(ext)))
    return max(total, 1)


def _determine_annotation_type(info: Dict[str, Any]) -> Optional[str]:
    """Infer annotation type from data structure: 'polygon', 'figure', or 'landmark'."""
    if not isinstance(info, dict):
        return None

    ann_type = info.get("type")
    if ann_type == "polygon":
        return "polygon"
    elif ann_type == "figure":
        return "figure"
    elif "coordinates" in info or ann_type is None:
        return "landmark"
    return None


def _scan_all_annotations() -> Dict[str, Any]:
    """Scan all annotation files and cache label names with usage counts."""
    global _annotation_cache, _cache_mtime

    current_mtime = _get_annotations_dir_mtime()

    if _annotation_cache is not None and current_mtime <= _cache_mtime:
        return _annotation_cache

    # Scan and build cache
    labels: Dict[str, Set[str]] = {
        'landmark': set(),
        'polygon': set(),
        'figure': set()
    }
    counts: Dict[Tuple[str, str], int] = {}

    annotation_dir = Path(ANNOTATION_DIR)
    if annotation_dir.exists():
        for folder in annotation_dir.iterdir():
            if folder.is_dir() and not folder.name.startswith("__"):
                for file in folder.glob("*.json"):
                    try:
                        data = json.loads(file.read_text())
                        for name, info in data.items():
                            ann_type = _determine_annotation_type(info)
                            if ann_type:
                                labels[ann_type].add(name)
                                key = (name, ann_type)
                                counts[key] = counts.get(key, 0) + 1
                    except Exception:
                        continue

    _annotation_cache = {'labels': labels, 'counts': counts}
    _cache_mtime = current_mtime if current_mtime > 0 else float('inf')

    return _annotation_cache


class AnnotationTypeManager:
    """Unified manager for annotation types (landmark, polygon, figure).

    Provides a common interface for retrieving, listing, and removing
    annotations of a specific type.
    """

    def __init__(self, type_name: str, storage_key: str):
        """Initialize manager for a specific annotation type.

        Args:
            type_name: Display name for the annotation type
            storage_key: Key used in cache storage ('landmark', 'polygon', 'figure')
        """
        self.type_name = type_name
        self.storage_key = storage_key

    def get_all(self) -> List[Dict[str, Any]]:
        """Get all annotations of this type with metadata."""
        cache = _scan_all_annotations()
        names = sorted(cache['labels'].get(self.storage_key, set()))
        total = _get_total_images()

        return [{
            'name': name,
            'in_use': True,
            'annotated_count': cache['counts'].get((name, self.storage_key), 0),
            'total_count': total,
            'type': self.storage_key
        } for name in names]

    def get_names(self) -> List[str]:
        """Get all annotation names of this type currently in use."""
        cache = _scan_all_annotations()
        return sorted(cache['labels'].get(self.storage_key, set()))

    def remove_files(self, name: str) -> Tuple[int, int]:
        """Remove all occurrences of an annotation from files.

        Returns:
            Tuple of (files_modified, files_deleted) counts
        """
        annotation_dir = Path(ANNOTATION_DIR)
        files_modified = 0
        files_deleted = 0

        for patient_dir in annotation_dir.iterdir():
            if patient_dir.is_dir() and not patient_dir.name.startswith("__"):
                for json_file in patient_dir.glob("*.json"):
                    try:
                        data = json.loads(json_file.read_text())
                        if name in data and _determine_annotation_type(data[name]) == self.storage_key:
                            del data[name]
                            files_modified += 1
                            if not data:
                                json_file.unlink()
                                files_deleted += 1
                            else:
                                json_file.write_text(json.dumps(data, indent=4))
                    except Exception:
                        continue
                if patient_dir.exists() and not any(patient_dir.iterdir()):
                    patient_dir.rmdir()

        _invalidate_cache()

        # Clear generated visualization images
        generated_dir = annotation_dir / "__images_with_landmarks"
        if generated_dir.exists():
            shutil.rmtree(generated_dir, ignore_errors=True)

        return files_modified, files_deleted

    def add(self, name: str) -> bool:
        """Add a new annotation label (no-op since labels are auto-discovered)."""
        return True

    def remove(self, name: str) -> bool:
        """Remove annotation label (always False since labels are auto-discovered)."""
        return False


# Factory instances for each annotation type
landmarks_manager = AnnotationTypeManager('landmark', 'landmark')
segments_manager = AnnotationTypeManager('segment', 'polygon')
figures_manager = AnnotationTypeManager('figure', 'figure')


# === Backward-compatible Public API: Landmarks ===
def get_landmarks() -> List[Dict[str, Any]]:
    """Get all landmark (point) annotations."""
    return landmarks_manager.get_all()

def get_landmark_names() -> List[str]:
    """Get all landmark names currently in use."""
    return landmarks_manager.get_names()

def remove_landmark(name: str) -> bool:
    """Remove landmark - always returns False since labels are auto-discovered."""
    return landmarks_manager.remove(name)

def remove_landmark_files(name: str) -> Tuple[int, int]:
    """Remove all landmark occurrences from annotation files."""
    return landmarks_manager.remove_files(name)

def add_new_landmark(name: str) -> bool:
    """Landmarks are created when first annotated - no pre-config needed."""
    return landmarks_manager.add(name)


# === Backward-compatible Public API: Segments ===
def get_segments() -> List[Dict[str, Any]]:
    """Get all segment (polygon) annotations."""
    return segments_manager.get_all()

def get_segment_names() -> List[str]:
    """Get all segment names currently in use."""
    return segments_manager.get_names()

def remove_segment_files(name: str) -> Tuple[int, int]:
    """Remove all segment occurrences from annotation files."""
    return segments_manager.remove_files(name)

def add_new_segment(name: str) -> bool:
    """Segments are created when first annotated - no pre-config needed."""
    return segments_manager.add(name)


# === Backward-compatible Public API: Figures ===
def get_figures() -> List[Dict[str, Any]]:
    """Get all figure annotations."""
    return figures_manager.get_all()

def get_figure_names() -> List[str]:
    """Get all figure names currently in use."""
    return figures_manager.get_names()

def remove_figure_files(name: str) -> Tuple[int, int]:
    """Remove all figure occurrences from annotation files."""
    return figures_manager.remove_files(name)

def add_new_figure(name: str) -> bool:
    """Figures are created when first annotated - no pre-config needed."""
    return figures_manager.add(name)