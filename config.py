# config.py
"""Application configuration and annotation type management.

Annotation types (landmark, polygon, figure) are auto-discovered from existing
annotation files - no external configuration required. Results are cached and
invalidated when annotation files change.
"""
from pathlib import Path
import json
import shutil
from typing import Any, Dict, List, Optional, Set, Tuple

BASE_DIR = Path.cwd()
IMAGE_HEIGHT = 600
IMAGE_DIR = str(BASE_DIR / "images")
ANNOTATION_DIR = str(BASE_DIR / "annotations")

_annotation_cache: Optional[Dict[str, Any]] = None
_cache_mtime: float = 0.0


def _iter_annotation_dirs():
    """Yield patient directories in the annotation folder."""
    annotation_dir = Path(ANNOTATION_DIR)
    if not annotation_dir.exists():
        return
    for folder in annotation_dir.iterdir():
        if folder.is_dir() and not folder.name.startswith("__"):
            yield folder


def _get_annotations_dir_mtime() -> float:
    """Get latest modification time of annotation files for cache invalidation."""
    latest_mtime = 0.0
    for folder in _iter_annotation_dirs():
        for file in folder.glob("*.json"):
            try:
                latest_mtime = max(latest_mtime, file.stat().st_mtime)
            except OSError:
                continue
    return latest_mtime


def _invalidate_cache() -> None:
    """Force cache invalidation after modifications."""
    global _annotation_cache, _cache_mtime
    _annotation_cache = None
    _cache_mtime = 0.0


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
    ann_type = info.get("type")
    if ann_type in ("polygon", "figure"):
        return ann_type
    if "coordinates" in info or ann_type is None:
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

    for folder in _iter_annotation_dirs():
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
    _cache_mtime = current_mtime

    return _annotation_cache


class AnnotationTypeManager:
    """Unified manager for annotation types (landmark, polygon, figure)."""

    def __init__(self, type_name: str, storage_key: str):
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
        files_modified = 0
        files_deleted = 0

        for patient_dir in _iter_annotation_dirs():
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

        generated_dir = Path(ANNOTATION_DIR) / "__images_with_landmarks"
        if generated_dir.exists():
            shutil.rmtree(generated_dir, ignore_errors=True)

        return files_modified, files_deleted


# Factory instances for each annotation type
landmarks_manager = AnnotationTypeManager('landmark', 'landmark')
segments_manager = AnnotationTypeManager('segment', 'polygon')
figures_manager = AnnotationTypeManager('figure', 'figure')


get_landmarks = landmarks_manager.get_all
get_landmark_names = landmarks_manager.get_names
remove_landmark_files = landmarks_manager.remove_files

get_segments = segments_manager.get_all
get_segment_names = segments_manager.get_names
remove_segment_files = segments_manager.remove_files

get_figures = figures_manager.get_all
get_figure_names = figures_manager.get_names
remove_figure_files = figures_manager.remove_files
