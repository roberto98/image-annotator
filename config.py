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


def _get_annotations(annotation_type: str) -> List[Dict[str, Any]]:
    """Get all annotations of specified type with metadata."""
    cache = _scan_all_annotations()
    names = sorted(cache['labels'].get(annotation_type, set()))
    total = _get_total_images()
    
    return [{
        'name': name,
        'in_use': True,
        'annotated_count': cache['counts'].get((name, annotation_type), 0),
        'total_count': total,
        'type': annotation_type
    } for name in names]


def _remove_annotation_files(name: str, annotation_type: str) -> Tuple[int, int]:
    """Remove all occurrences of an annotation from files. Returns (modified, deleted) counts."""
    annotation_dir = Path(ANNOTATION_DIR)
    files_modified = 0
    files_deleted = 0
    
    for patient_dir in annotation_dir.iterdir():
        if patient_dir.is_dir() and not patient_dir.name.startswith("__"):
            for json_file in patient_dir.glob("*.json"):
                try:
                    data = json.loads(json_file.read_text())
                    if name in data and _determine_annotation_type(data[name]) == annotation_type:
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


# === Public API: Landmarks ===
def get_landmarks() -> List[Dict[str, Any]]:
    """Get all landmark (point) annotations."""
    return _get_annotations('landmark')

def get_landmark_names() -> List[str]:
    """Get all landmark names currently in use."""
    cache = _scan_all_annotations()
    return sorted(cache['labels'].get('landmark', set()))

def remove_landmark(name: str) -> bool:
    """Remove landmark - always returns False since labels are auto-discovered."""
    return False

def remove_landmark_files(name: str) -> Tuple[int, int]:
    """Remove all landmark occurrences from annotation files."""
    return _remove_annotation_files(name, 'landmark')

def add_new_landmark(name: str) -> bool:
    """Landmarks are created when first annotated - no pre-config needed."""
    return True


# Public API - Segments
def get_segments() -> List[Dict[str, Any]]:
    """Get all segment (polygon) annotations."""
    return _get_annotations('polygon')

def get_segment_names() -> List[str]:
    """Get all segment names currently in use."""
    cache = _scan_all_annotations()
    return sorted(cache['labels'].get('polygon', set()))

def remove_segment_files(name: str) -> Tuple[int, int]:
    """Remove all segment occurrences from annotation files."""
    return _remove_annotation_files(name, 'polygon')

def add_new_segment(name: str) -> bool:
    """Segments are created when first annotated - no pre-config needed."""
    return True


# Public API - Figures
def get_figures() -> List[Dict[str, Any]]:
    """Get all figure annotations."""
    return _get_annotations('figure')

def get_figure_names() -> List[str]:
    """Get all figure names currently in use."""
    cache = _scan_all_annotations()
    return sorted(cache['labels'].get('figure', set()))

def remove_figure_files(name: str) -> Tuple[int, int]:
    """Remove all figure occurrences from annotation files."""
    return _remove_annotation_files(name, 'figure')

def add_new_figure(name: str) -> bool:
    """Figures are created when first annotated - no pre-config needed."""
    return True