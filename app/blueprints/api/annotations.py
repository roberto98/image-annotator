# blueprints/api/annotations.py
"""Annotation API endpoints supporting multiple annotation types.

Supported annotation types:
- Point: Single point with x, y coordinates
- Polygon: Array of points for segmentation
- Line: Two points (start, end) with length
- Circle: Center point and radius
- Rectangle: Two corner points (topLeft, bottomRight)
- Angle: Three points (point1, vertex, point2) with angle in degrees
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import json
import logging
import math
import re

from flask import Blueprint, jsonify, request, Response

logger = logging.getLogger(__name__)

annotations_bp = Blueprint("annotations", __name__, url_prefix="/api/annotations")

DATA_DIR = Path("data")
LABELS_FILE = DATA_DIR / "labels.json"
VALID_ANNOTATION_TYPES = {
    "point",
    "polygon",
    "line",
    "circle",
    "rectangle",
    "angle",
}
DEFAULT_CATEGORIES = ["anatomy", "pathology", "measurement", "other"]


def _validate_hex_color(color: str) -> bool:
    """Validate that a string is a valid hex color code."""
    return bool(re.match(r"^#[0-9a-fA-F]{6}$", color))


def _get_annotation_path(patient_id: str, image_name: str) -> Path:
    """Get path to annotation JSON file for patient/image.

    Sanitizes inputs to prevent path traversal attacks.

    Args:
        patient_id: The patient identifier
        image_name: The image filename

    Returns:
        Path to the annotation JSON file

    Raises:
        ValueError: If inputs are invalid or path traversal is detected
    """
    # Sanitize inputs to prevent path traversal
    safe_patient_id = Path(patient_id).name  # Strip any directory components
    safe_image_name = Path(image_name).stem

    # Additional validation
    if not safe_patient_id or safe_patient_id in (".", ".."):
        raise ValueError("Invalid patient_id")
    if not safe_image_name or safe_image_name in (".", ".."):
        raise ValueError("Invalid image_name")

    result = DATA_DIR / safe_patient_id / f"{safe_image_name}_annotations.json"

    # Verify path is under DATA_DIR
    if not result.resolve().is_relative_to(DATA_DIR.resolve()):
        raise ValueError("Path traversal attempt detected")

    return result


def _load_annotations(patient_id: str, image_name: str) -> Dict[str, Any]:
    """Load annotations from file, returning default structure if not exists."""
    path = _get_annotation_path(patient_id, image_name)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load annotations from {path}: {e}")

    return {
        "version": 2,
        "calibration": {"pixelsPerMm": None},
        "annotations": {},
        "history": [],
    }


def _save_annotations(patient_id: str, image_name: str, data: Dict[str, Any]) -> None:
    """Save annotations to JSON file."""
    path = _get_annotation_path(patient_id, image_name)
    path.parent.mkdir(exist_ok=True, parents=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_labels() -> Dict[str, Any]:
    """Load labels from file, returning default structure if not exists."""
    if LABELS_FILE.exists():
        try:
            return json.loads(LABELS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load labels from {LABELS_FILE}: {e}")

    return {"labels": [], "categories": DEFAULT_CATEGORIES.copy()}


def _save_labels(data: Dict[str, Any]) -> None:
    """Save labels to JSON file."""
    LABELS_FILE.parent.mkdir(exist_ok=True, parents=True)
    LABELS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _get_timestamp() -> str:
    """Get current UTC timestamp in ISO8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _validate_annotation_type(annotation_type: str) -> bool:
    """Validate that the annotation type is supported."""
    return annotation_type in VALID_ANNOTATION_TYPES


def _validate_annotation_data(
    annotation_type: str, data: Dict[str, Any]
) -> Tuple[bool, str]:
    """Validate annotation data matches the expected format for the type."""
    if not isinstance(data, dict):
        return False, "data must be an object"

    validators = {
        "point": _validate_point_data,
        "polygon": _validate_polygon_data,
        "line": _validate_line_data,
        "circle": _validate_circle_data,
        "rectangle": _validate_rectangle_data,
        "angle": _validate_angle_data,
    }

    validator = validators.get(annotation_type)
    if validator:
        return validator(data)

    return False, f"Unknown annotation type: {annotation_type}"


def _validate_point(point: Any, name: str = "point") -> Tuple[bool, str]:
    """Validate a single point object has x, y coordinates."""
    if not isinstance(point, dict):
        return False, f"{name} must be an object"
    if "x" not in point or "y" not in point:
        return False, f"{name} must have 'x' and 'y' properties"
    if not isinstance(point["x"], (int, float)) or not isinstance(
        point["y"], (int, float)
    ):
        return False, f"{name} x and y must be numbers"
    return True, ""


def _validate_points_array(
    points: Any, name: str = "points", min_count: int = 1
) -> Tuple[bool, str]:
    """Validate an array of points."""
    if not isinstance(points, list):
        return False, f"{name} must be an array"
    if len(points) < min_count:
        return False, f"{name} must have at least {min_count} point(s)"
    for i, point in enumerate(points):
        is_valid, error = _validate_point(point, f"{name}[{i}]")
        if not is_valid:
            return False, error
    return True, ""


def _validate_point_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Point annotation data: { x, y }"""
    return _validate_point(data, "data")


def _validate_polygon_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Polygon annotation data: { points: [{x, y}, ...], closed: true }"""
    if "points" not in data:
        return False, "polygon data must have 'points' property"
    is_valid, error = _validate_points_array(data["points"], "points", min_count=3)
    if not is_valid:
        return False, error
    return True, ""


def _validate_line_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Line annotation data: { start: {x, y}, end: {x, y} }"""
    if "start" not in data:
        return False, "line data must have 'start' property"
    if "end" not in data:
        return False, "line data must have 'end' property"

    is_valid, error = _validate_point(data["start"], "start")
    if not is_valid:
        return False, error

    is_valid, error = _validate_point(data["end"], "end")
    if not is_valid:
        return False, error

    return True, ""


def _validate_circle_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Circle annotation data: { center: {x, y}, radius: number }"""
    if "center" not in data:
        return False, "circle data must have 'center' property"
    if "radius" not in data:
        return False, "circle data must have 'radius' property"

    is_valid, error = _validate_point(data["center"], "center")
    if not is_valid:
        return False, error

    if not isinstance(data["radius"], (int, float)) or data["radius"] <= 0:
        return False, "radius must be a positive number"

    return True, ""


def _validate_rectangle_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Rectangle annotation data: { topLeft: {x, y}, bottomRight: {x, y} }"""
    if "topLeft" not in data:
        return False, "rectangle data must have 'topLeft' property"
    if "bottomRight" not in data:
        return False, "rectangle data must have 'bottomRight' property"

    is_valid, error = _validate_point(data["topLeft"], "topLeft")
    if not is_valid:
        return False, error

    is_valid, error = _validate_point(data["bottomRight"], "bottomRight")
    if not is_valid:
        return False, error

    return True, ""


def _validate_angle_data(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate Angle annotation data: { point1: {x, y}, vertex: {x, y}, point2: {x, y} }"""
    for field in ["point1", "vertex", "point2"]:
        if field not in data:
            return False, f"angle data must have '{field}' property"
        is_valid, error = _validate_point(data[field], field)
        if not is_valid:
            return False, error

    return True, ""


def _calculate_line_length(
    start: Dict[str, float],
    end: Dict[str, float],
    pixels_per_mm: Optional[float] = None,
) -> Dict[str, Any]:
    """Calculate line length in pixels and optionally in millimeters."""
    dx = end["x"] - start["x"]
    dy = end["y"] - start["y"]
    length_px = math.hypot(dx, dy)

    result = {"pixels": round(length_px, 2)}
    if pixels_per_mm and pixels_per_mm > 0:
        result["mm"] = round(length_px / pixels_per_mm, 2)

    return result


def _calculate_angle(
    point1: Dict[str, float], vertex: Dict[str, float], point2: Dict[str, float]
) -> float:
    """Calculate angle between three points in degrees using the vertex as origin."""
    v1_x = point1["x"] - vertex["x"]
    v1_y = point1["y"] - vertex["y"]
    v2_x = point2["x"] - vertex["x"]
    v2_y = point2["y"] - vertex["y"]

    dot_product = v1_x * v2_x + v1_y * v2_y
    mag1 = math.hypot(v1_x, v1_y)
    mag2 = math.hypot(v2_x, v2_y)

    if mag1 == 0 or mag2 == 0:
        return 0.0

    cos_angle = max(-1, min(1, dot_product / (mag1 * mag2)))
    return round(math.degrees(math.acos(cos_angle)), 2)


def _success_response(data: Optional[Dict[str, Any]] = None) -> Tuple[Response, int]:
    """Create a standard success response."""
    response = {"status": "success"}
    if data:
        response.update(data)
    return jsonify(response), 200


def _error_response(message: str, status_code: int = 400) -> Tuple[Response, int]:
    """Create a standard error response."""
    return jsonify({"status": "error", "message": message}), status_code


@annotations_bp.route("/<patient_id>/<image_name>", methods=["GET"])
def get_annotations(patient_id: str, image_name: str) -> Tuple[Response, int]:
    """Get all annotations for an image.

    Returns:
        JSON with annotations, labels used in this image, and calibration data.
    """
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in get_annotations: {e}")
        return _error_response(str(e), 400)

    labels_data = _load_labels()

    # Get labels used in this image's annotations
    used_label_names = set(data.get("annotations", {}).keys())
    used_labels = [
        label
        for label in labels_data.get("labels", [])
        if label.get("name") in used_label_names
    ]

    # Enrich annotations with calculated values
    annotations = data.get("annotations", {})
    calibration = data.get("calibration", {})
    pixels_per_mm = calibration.get("pixelsPerMm")

    enriched_annotations = {}
    for label, annotation in annotations.items():
        enriched = annotation.copy()
        ann_type = annotation.get("type")
        ann_data = annotation.get("data", {})

        # Add calculated length for lines
        if ann_type == "line" and "start" in ann_data and "end" in ann_data:
            enriched["calculated"] = {
                "length": _calculate_line_length(
                    ann_data["start"], ann_data["end"], pixels_per_mm
                )
            }

        # Add calculated angle for angle annotations
        elif ann_type == "angle" and all(
            k in ann_data for k in ["point1", "vertex", "point2"]
        ):
            enriched["calculated"] = {
                "degrees": _calculate_angle(
                    ann_data["point1"], ann_data["vertex"], ann_data["point2"]
                )
            }

        # Add calculated area/perimeter for circles
        elif ann_type == "circle" and "radius" in ann_data:
            radius = ann_data["radius"]
            calculated = {
                "area_px": round(math.pi * radius * radius, 2),
                "circumference_px": round(2 * math.pi * radius, 2),
            }
            if pixels_per_mm is not None and pixels_per_mm > 0:
                radius_mm = radius / pixels_per_mm
                calculated["area_mm2"] = round(math.pi * radius_mm * radius_mm, 2)
                calculated["circumference_mm"] = round(2 * math.pi * radius_mm, 2)
            enriched["calculated"] = calculated

        # Add calculated area for rectangles
        elif (
            ann_type == "rectangle"
            and "topLeft" in ann_data
            and "bottomRight" in ann_data
        ):
            width = abs(ann_data["bottomRight"]["x"] - ann_data["topLeft"]["x"])
            height = abs(ann_data["bottomRight"]["y"] - ann_data["topLeft"]["y"])
            calculated = {
                "width_px": round(width, 2),
                "height_px": round(height, 2),
                "area_px": round(width * height, 2),
            }
            if pixels_per_mm is not None and pixels_per_mm > 0:
                width_mm = width / pixels_per_mm
                height_mm = height / pixels_per_mm
                calculated["width_mm"] = round(width_mm, 2)
                calculated["height_mm"] = round(height_mm, 2)
                calculated["area_mm2"] = round(width_mm * height_mm, 2)
            enriched["calculated"] = calculated

        enriched_annotations[label] = enriched

    return jsonify({
        "annotations": enriched_annotations,
        "labels": used_labels,
        "calibration": calibration,
    }), 200


@annotations_bp.route("/<patient_id>/<image_name>", methods=["POST"])
def create_or_update_annotation(
    patient_id: str, image_name: str
) -> Tuple[Response, int]:
    """Create or update an annotation.

    Request body:
        {
            "label": string,           # Required: annotation label/name
            "type": string,            # Required: annotation type
            "data": object,            # Required: type-specific data
            "color": string,           # Optional: hex color
            "category": string,        # Optional: label category
            "status": string           # Optional: "ok" or "occluded"
        }
    """
    if not request.is_json:
        return _error_response("Content-Type must be application/json")

    body = request.get_json()

    # Validate required fields
    label = body.get("label")
    if not label or not isinstance(label, str):
        return _error_response("label is required and must be a string")

    annotation_type = body.get("type")
    if not annotation_type:
        return _error_response("type is required")

    if not _validate_annotation_type(annotation_type):
        return _error_response(
            f"Invalid annotation type. Must be one of: {', '.join(sorted(VALID_ANNOTATION_TYPES))}"
        )

    annotation_data = body.get("data")
    if annotation_data is None:
        return _error_response("data is required")

    # Validate type-specific data
    is_valid, error_msg = _validate_annotation_data(annotation_type, annotation_data)
    if not is_valid:
        return _error_response(f"Invalid data for type {annotation_type}: {error_msg}")

    # Validate color if provided
    if "color" in body and body["color"] is not None:
        if not isinstance(body["color"], str) or not _validate_hex_color(body["color"]):
            return _error_response("color must be a valid hex color (e.g., #ff0000)")

    # Load existing annotations
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in create_or_update_annotation: {e}")
        return _error_response(str(e), 400)

    # Build annotation object
    annotation = {
        "type": annotation_type,
        "status": body.get("status", "ok"),
        "timestamp": _get_timestamp(),
        "data": annotation_data,
    }

    # Add optional fields
    if "color" in body:
        annotation["color"] = body["color"]
    if "category" in body:
        annotation["category"] = body["category"]

    # Update annotations
    data["annotations"][label] = annotation

    # Save
    try:
        _save_annotations(patient_id, image_name, data)
    except ValueError as e:
        logger.warning(
            f"Invalid path parameters in create_or_update_annotation save: {e}"
        )
        return _error_response(str(e), 400)

    return _success_response({"label": label, "annotation": annotation})


@annotations_bp.route(
    "/<patient_id>/<image_name>/<label>", methods=["DELETE"]
)
def delete_annotation(
    patient_id: str, image_name: str, label: str
) -> Tuple[Response, int]:
    """Delete an annotation by label."""
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in delete_annotation: {e}")
        return _error_response(str(e), 400)

    if label not in data.get("annotations", {}):
        return _error_response(f'Annotation with label "{label}" not found', 404)

    del data["annotations"][label]

    # If no annotations remain and no calibration set, optionally delete the file
    if (
        not data["annotations"]
        and data.get("calibration", {}).get("pixelsPerMm") is None
    ):
        try:
            path = _get_annotation_path(patient_id, image_name)
            if path.exists():
                path.unlink()
                # Clean up empty patient directory
                if path.parent.exists() and not any(path.parent.iterdir()):
                    path.parent.rmdir()
        except ValueError as e:
            logger.warning(f"Invalid path parameters in delete_annotation cleanup: {e}")
            return _error_response(str(e), 400)
    else:
        try:
            _save_annotations(patient_id, image_name, data)
        except ValueError as e:
            logger.warning(f"Invalid path parameters in delete_annotation save: {e}")
            return _error_response(str(e), 400)

    return _success_response({"deleted": label})


@annotations_bp.route("/labels", methods=["GET"])
def get_labels() -> Tuple[Response, int]:
    """Get all available labels with categories and colors."""
    data = _load_labels()
    return jsonify({
        "labels": data.get("labels", []),
        "categories": data.get("categories", DEFAULT_CATEGORIES),
    }), 200


@annotations_bp.route("/labels", methods=["POST"])
def create_label() -> Tuple[Response, int]:
    """Create a new label.

    Request body:
        {
            "name": string,           # Required: label name (unique)
            "category": string,       # Optional: category name
            "color": string,          # Optional: hex color
            "description": string     # Optional: label description
        }
    """
    if not request.is_json:
        return _error_response("Content-Type must be application/json")

    body = request.get_json()

    # Validate required fields
    name = body.get("name")
    if not name or not isinstance(name, str):
        return _error_response("name is required and must be a string")

    name = name.strip()
    if not name:
        return _error_response("name cannot be empty")

    # Validate color if provided
    if "color" in body and body["color"] is not None:
        if not isinstance(body["color"], str) or not _validate_hex_color(body["color"]):
            return _error_response("color must be a valid hex color (e.g., #ff0000)")

    # Load existing labels
    data = _load_labels()

    # Check for duplicate
    existing_names = {label.get("name", "").lower() for label in data.get("labels", [])}
    if name.lower() in existing_names:
        return _error_response(f'Label with name "{name}" already exists')

    # Build label object
    label = {"name": name}

    if "category" in body:
        category = body["category"]
        if category and category not in data.get("categories", DEFAULT_CATEGORIES):
            # Add new category
            data.setdefault("categories", DEFAULT_CATEGORIES.copy()).append(category)
        label["category"] = category

    if "color" in body:
        label["color"] = body["color"]

    if "description" in body:
        label["description"] = body["description"]

    # Add label
    data.setdefault("labels", []).append(label)

    # Save
    _save_labels(data)

    return _success_response({"label": label}), 201


@annotations_bp.route("/labels/<name>", methods=["PUT"])
def update_label(name: str) -> Tuple[Response, int]:
    """Update an existing label.

    Request body:
        {
            "category": string,       # Optional: category name
            "color": string,          # Optional: hex color
            "description": string     # Optional: label description
        }
    """
    if not request.is_json:
        return _error_response("Content-Type must be application/json")

    body = request.get_json()

    # Validate color if provided
    if "color" in body and body["color"] is not None:
        if not isinstance(body["color"], str) or not _validate_hex_color(body["color"]):
            return _error_response("color must be a valid hex color (e.g., #ff0000)")

    data = _load_labels()

    # Find the label
    label_index = None
    for i, label in enumerate(data.get("labels", [])):
        if label.get("name") == name:
            label_index = i
            break

    if label_index is None:
        return _error_response(f'Label "{name}" not found', 404)

    # Update fields
    label = data["labels"][label_index]

    if "category" in body:
        category = body["category"]
        if category and category not in data.get("categories", DEFAULT_CATEGORIES):
            data.setdefault("categories", DEFAULT_CATEGORIES.copy()).append(category)
        label["category"] = category

    if "color" in body:
        label["color"] = body["color"]

    if "description" in body:
        label["description"] = body["description"]

    # Save
    _save_labels(data)

    return _success_response({"label": label})


@annotations_bp.route("/labels/<name>", methods=["DELETE"])
def delete_label(name: str) -> Tuple[Response, int]:
    """Delete a label by name."""
    data = _load_labels()

    # Find and remove the label
    labels = data.get("labels", [])
    original_count = len(labels)
    data["labels"] = [label for label in labels if label.get("name") != name]

    if len(data["labels"]) == original_count:
        return _error_response(f'Label "{name}" not found', 404)

    # Save
    _save_labels(data)

    return _success_response({"deleted": name})


@annotations_bp.route("/calibration/<patient_id>/<image_name>", methods=["PUT"])
def set_calibration(patient_id: str, image_name: str) -> Tuple[Response, int]:
    """Set image calibration (pixels per mm).

    Request body:
        {
            "pixelsPerMm": number     # Required: pixels per millimeter (or null to clear)
        }
    """
    if not request.is_json:
        return _error_response("Content-Type must be application/json")

    body = request.get_json()

    if "pixelsPerMm" not in body:
        return _error_response("pixelsPerMm is required")

    pixels_per_mm = body["pixelsPerMm"]

    # Validate: must be a positive number or null
    if pixels_per_mm is not None:
        if not isinstance(pixels_per_mm, (int, float)):
            return _error_response("pixelsPerMm must be a number or null")
        if pixels_per_mm <= 0:
            return _error_response("pixelsPerMm must be a positive number")

    # Load existing annotations
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in set_calibration: {e}")
        return _error_response(str(e), 400)

    # Update calibration
    data["calibration"] = {"pixelsPerMm": pixels_per_mm}

    # Save
    try:
        _save_annotations(patient_id, image_name, data)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in set_calibration save: {e}")
        return _error_response(str(e), 400)

    return _success_response({"calibration": data["calibration"]})


@annotations_bp.route("/calibration/<patient_id>/<image_name>", methods=["GET"])
def get_calibration(patient_id: str, image_name: str) -> Tuple[Response, int]:
    """Get image calibration data."""
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in get_calibration: {e}")
        return _error_response(str(e), 400)
    return jsonify({"calibration": data.get("calibration", {"pixelsPerMm": None})}), 200


@annotations_bp.route("/images/<patient_id>/<image_name>/metadata", methods=["GET"])
def get_image_metadata(patient_id: str, image_name: str) -> Tuple[Response, int]:
    """Get image metadata including dimensions and DICOM calibration."""
    import config
    from PIL import Image as PILImage
    from app.imaging.dicom import (
        is_dicom_file,
        read_dicom,
        extract_pixel_array,
        extract_pixel_spacing,
        extract_modality,
    )

    # Sanitize inputs
    safe_patient_id = Path(patient_id).name
    safe_image_name = Path(image_name).name

    # Construct image path
    image_dir = Path(config.IMAGE_DIR)
    image_path = image_dir / safe_patient_id / safe_image_name

    # Verify path is under IMAGE_DIR
    if not image_path.resolve().is_relative_to(image_dir.resolve()):
        return _error_response("Path traversal attempt detected", 400)

    if not image_path.exists():
        return _error_response(f"Image not found: {safe_image_name}", 404)

    try:
        metadata = {
            "width": 0,
            "height": 0,
            "format": "Unknown",
            "pixelSpacing": None,
            "modality": None,
        }

        if is_dicom_file(image_path):
            try:
                dcm = read_dicom(image_path)
                pixel_array = extract_pixel_array(dcm, image_path)

                # Get dimensions
                if len(pixel_array.shape) == 2:
                    metadata["height"], metadata["width"] = pixel_array.shape
                elif len(pixel_array.shape) == 3:
                    metadata["height"], metadata["width"] = pixel_array.shape[:2]

                metadata["format"] = "DICOM"

                # Extract pixel spacing
                pixel_spacing = extract_pixel_spacing(dcm)
                if pixel_spacing:
                    metadata["pixelSpacing"] = list(pixel_spacing)

                # Extract modality
                modality = extract_modality(dcm)
                if modality:
                    metadata["modality"] = modality

            except Exception as e:
                logger.error(f"Error reading DICOM metadata from {image_path}: {e}")
                return _error_response(f"Failed to read DICOM metadata: {e}", 500)
        else:
            try:
                img = PILImage.open(image_path)
                metadata["width"], metadata["height"] = img.size
                metadata["format"] = img.format or "Unknown"
                img.close()
            except Exception as e:
                logger.error(f"Error reading image metadata from {image_path}: {e}")
                return _error_response(f"Failed to read image metadata: {e}", 500)

        return jsonify(metadata), 200

    except Exception as e:
        logger.error(f"Unexpected error in get_image_metadata: {e}", exc_info=True)
        return _error_response(f"Internal server error: {e}", 500)


@annotations_bp.route(
    "/<patient_id>/<image_name>/bulk", methods=["POST"]
)
def bulk_update_annotations(patient_id: str, image_name: str) -> Tuple[Response, int]:
    """Bulk create/update/delete annotations.

    Request body:
        {
            "operations": [
                {
                    "action": "create" | "update" | "delete",
                    "label": string,
                    "type": string,        # Required for create/update
                    "data": object,        # Required for create/update
                    "color": string,       # Optional
                    "category": string     # Optional
                },
                ...
            ]
        }
    """
    if not request.is_json:
        return _error_response("Content-Type must be application/json")

    body = request.get_json()
    operations = body.get("operations", [])

    if not isinstance(operations, list):
        return _error_response("operations must be an array")

    # Load existing annotations
    try:
        data = _load_annotations(patient_id, image_name)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in bulk_update_annotations: {e}")
        return _error_response(str(e), 400)

    results = []
    errors = []

    for i, op in enumerate(operations):
        action = op.get("action")
        label = op.get("label")

        if not label:
            errors.append({"index": i, "error": "label is required"})
            continue

        if action == "delete":
            if label in data["annotations"]:
                del data["annotations"][label]
                results.append({"index": i, "action": "deleted", "label": label})
            else:
                errors.append({"index": i, "error": f'Label "{label}" not found'})

        elif action in ("create", "update"):
            annotation_type = op.get("type")
            annotation_data = op.get("data")

            if not annotation_type:
                errors.append({"index": i, "error": "type is required"})
                continue

            if not _validate_annotation_type(annotation_type):
                errors.append(
                    {"index": i, "error": f"Invalid annotation type: {annotation_type}"}
                )
                continue

            if annotation_data is None:
                errors.append({"index": i, "error": "data is required"})
                continue

            is_valid, error_msg = _validate_annotation_data(
                annotation_type, annotation_data
            )
            if not is_valid:
                errors.append({"index": i, "error": error_msg})
                continue

            # Validate color if provided
            if "color" in op and op["color"] is not None:
                if not isinstance(op["color"], str) or not _validate_hex_color(
                    op["color"]
                ):
                    errors.append(
                        {
                            "index": i,
                            "error": "color must be a valid hex color (e.g., #ff0000)",
                        }
                    )
                    continue

            annotation = {
                "type": annotation_type,
                "status": op.get("status", "ok"),
                "timestamp": _get_timestamp(),
                "data": annotation_data,
            }

            if "color" in op:
                annotation["color"] = op["color"]
            if "category" in op:
                annotation["category"] = op["category"]

            data["annotations"][label] = annotation
            results.append({"index": i, "action": action, "label": label})

        else:
            errors.append(
                {
                    "index": i,
                    "error": f"Invalid action: {action}. Must be create, update, or delete",
                }
            )

    try:
        _save_annotations(patient_id, image_name, data)
    except ValueError as e:
        logger.warning(f"Invalid path parameters in bulk_update_annotations save: {e}")
        return _error_response(str(e), 400)

    status_code = 200 if not errors else 207  # 207 Multi-Status for partial success
    return jsonify({
        "status": "success" if not errors else "partial",
        "results": results,
        "errors": errors,
    }), status_code
