# annotations.py
"""Annotation storage and retrieval for landmarks, polygons, and figures."""
from pathlib import Path
import json
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class AnnotationManager:
    """Manages JSON-based annotation files per image."""
    
    def __init__(self, annotations_dir: str):
        """Initialize with annotation storage directory."""
        self.annotations_dir = Path(annotations_dir)
        self.annotations_dir.mkdir(exist_ok=True, parents=True)

    def _get_annotation_path(self, patient: str, image: str) -> Path:
        """Get path to annotation JSON file for patient/image."""
        base = Path(image).stem
        return self.annotations_dir / patient / f"{base}.json"

    def _load_annotation_file(self, patient: str, image: str) -> dict:
        """Load annotations from file, returning empty dict on error."""
        path = self._get_annotation_path(patient, image)
        if path.exists():
            try:
                return json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in annotation file {path}: {e}")
                return {}
            except Exception as e:
                logger.error(f"Error loading annotation file {path}: {e}")
                return {}
        return {}

    def _write_annotation_file(self, patient: str, image: str, data: dict, new_annotation: bool = False) -> None:
        """Write annotations to JSON file."""
        path = self._get_annotation_path(patient, image)
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_text(json.dumps(data, indent=4), encoding='utf-8')

    def _update_annotation(self, patient: str, image: str, name: str, value: dict) -> None:
        """Update single annotation (atomic read-modify-write)."""
        data = self._load_annotation_file(patient, image)
        data[name] = value
        self._write_annotation_file(patient, image, data)

    def get_all_landmarks(self, patient: str, image: str) -> dict:
        """Return all annotations for a specific image."""
        return self._load_annotation_file(patient, image)

    def write_coordinates(self, patient: str, image: str, landmark_name: str, x: float, y: float) -> None:
        """Save landmark point coordinates."""
        self._update_annotation(patient, image, landmark_name, 
                               {"coordinates": {"x": x, "y": y}, "status": "ok"})

    def mark_occluded(self, patient: str, image: str, landmark_name: str) -> None:
        """Mark landmark as occluded/not visible."""
        self._update_annotation(patient, image, landmark_name, {"status": "occluded/missing"})
        
    def remove_landmark(self, patient: str, image: str, landmark_name: str) -> bool:
        """Remove annotation from image. Returns True if removed."""
        data = self._load_annotation_file(patient, image)
        if landmark_name in data:
            del data[landmark_name]
            # If no landmarks left, delete the file
            if not data:
                path = self._get_annotation_path(patient, image)
                if path.exists():
                    path.unlink()
            else:
                self._write_annotation_file(patient, image, data)
            return True
        return False
    
    # === Polygon Segmentation Methods ===
    
    def write_polygon(self, patient: str, image: str, segment_name: str, points: list) -> None:
        """Save polygon vertices for a segmentation region."""
        self._update_annotation(patient, image, segment_name, {
            "type": "polygon",
            "points": points,
            "status": "ok"
        })
    
    def remove_segment(self, patient: str, image: str, segment_name: str) -> bool:
        """Remove polygon segment. Returns True if removed."""
        return self.remove_landmark(patient, image, segment_name)
    
    # === Figure Annotation Methods ===
    
    def write_figure(
        self, 
        patient: str, 
        image: str, 
        figure_name: str, 
        x: float, 
        y: float, 
        shape: str, 
        size: int, 
        start_x: Optional[float] = None, 
        start_y: Optional[float] = None, 
        end_x: Optional[float] = None, 
        end_y: Optional[float] = None
    ) -> None:
        """Write figure annotation (circle, rectangle, or line).
        
        Args:
            patient: Patient ID/folder name.
            image: Image filename.
            figure_name: Name of the figure/label.
            x: Center X coordinate.
            y: Center Y coordinate.
            shape: Shape type ('circle', 'rectangle', or 'line').
            size: Size in pixels (diameter for circle/rectangle, length for line).
            start_x: Start X coordinate for line (optional).
            start_y: Start Y coordinate for line (optional).
            end_x: End X coordinate for line (optional).
            end_y: End Y coordinate for line (optional).
        """
        data = self._load_annotation_file(patient, image)
        data[figure_name] = {
            "type": "figure",
            "x": x,
            "y": y,
            "shape": shape,
            "size": size,
            "status": "ok"
        }
        
        # Add line-specific data if provided
        if shape == 'line' and all(v is not None for v in [start_x, start_y, end_x, end_y]):
            data[figure_name]["startX"] = start_x
            data[figure_name]["startY"] = start_y
            data[figure_name]["endX"] = end_x
            data[figure_name]["endY"] = end_y
        
        self._write_annotation_file(patient, image, data)
    
    def remove_figure(self, patient: str, image: str, figure_name: str) -> bool:
        """Remove a figure annotation from an image.
        
        Args:
            patient: Patient ID/folder name.
            image: Image filename.
            figure_name: Name of the figure to remove.
            
        Returns:
            True if figure was removed, False otherwise.
        """
        return self.remove_landmark(patient, image, figure_name)