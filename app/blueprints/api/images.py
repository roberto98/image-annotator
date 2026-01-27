# blueprints/api/images.py
"""Image-related API endpoints."""

from typing import Dict, Any
from flask import jsonify, request, send_file, current_app, Response
from pathlib import Path
from PIL import Image
import io
import config
import utils
from polygon_utils import generate_mask_from_polygon
from app.blueprints.api import api_bp
from app.blueprints.api.common import get_annotations_manager, get_images_manager, error_response


SUPPORTED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.dcm', '.dicom'}


def _build_directory_tree(dir_path: Path, dir_obj: Dict[str, Any]) -> None:
    """Recursively build directory tree structure with image files."""
    for item in sorted(dir_path.iterdir()):
        if item.is_dir():
            child_dir = {
                "name": item.name,
                "path": str(item),
                "type": "directory",
                "children": []
            }
            _build_directory_tree(item, child_dir)
            dir_obj["children"].append(child_dir)
        elif item.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS:
            dir_obj["children"].append({
                "name": item.name,
                "path": str(item),
                "type": "image",
                "patient": dir_path.name
            })


@api_bp.route('/image-directory')
def get_image_directory() -> tuple:
    """Get the image directory structure as JSON."""
    base_dir = Path(config.IMAGE_DIR)
    if not base_dir.exists():
        return error_response("Directory not found", 404)

    result = {
        "name": base_dir.name or "images",
        "path": str(base_dir),
        "type": "directory",
        "children": []
    }

    _build_directory_tree(base_dir, result)
    return jsonify(result)


@api_bp.route('/mask/<patient>/<image>/<segment_name>')
def get_segment_mask(patient: str, image: str, segment_name: str) -> Response:
    """Generate binary mask PNG from polygon segment."""
    try:
        annotations = get_annotations_manager()
        data = annotations.get_all_landmarks(patient, image)

        if segment_name not in data or data[segment_name].get("type") != "polygon":
            return error_response("Segment not found or not a polygon", 404)

        image_path = Path(config.IMAGE_DIR) / patient / image
        if not image_path.exists():
            return error_response("Image not found", 404)

        img = utils.load_image(image_path) if utils.is_dicom_file(image_path) else Image.open(image_path)
        width, height = img.size
        points = data[segment_name].get("points", [])
        mask = generate_mask_from_polygon(points, width, height)

        mask_img = Image.fromarray(mask.astype('uint8') * 255)
        img_io = io.BytesIO()
        mask_img.save(img_io, 'PNG')
        img_io.seek(0)

        return send_file(img_io, mimetype='image/png')

    except Exception as e:
        current_app.logger.error(f"Error generating mask: {e}", exc_info=True)
        return error_response(str(e), 500)


@api_bp.route('/next-unannotated')
def next_unannotated() -> tuple:
    """Find next image without annotations."""
    images = get_images_manager()
    current_patient = request.args.get('current_patient')
    current_image = request.args.get('current_image')

    result = images.get_next_unannotated_image(current_patient, current_image)
    if result:
        return jsonify({'patient': result['patient'], 'image': result['filename']})
    return jsonify({'patient': None, 'image': None})


@api_bp.route('/propagate-annotations', methods=['POST'])
def propagate_annotations() -> tuple:
    """Copy annotations from current image to next unannotated image."""
    try:
        annotations = get_annotations_manager()
        images = get_images_manager()
        data = request.json

        current_patient = data.get('current_patient')
        current_image = data.get('current_image')
        annotations_to_propagate = data.get('annotations', {})

        if not current_patient or not current_image:
            return error_response('Missing patient or image information')

        next_image = images.get_next_unannotated_image(current_patient, current_image)
        if not next_image:
            return error_response('No unannotated images found', 404)

        target_patient = next_image['patient']
        target_image = next_image['filename']
        target_annotations = annotations.get_all_landmarks(target_patient, target_image)

        copied_count = 0
        for name, annotation_data in annotations_to_propagate.items():
            if name not in target_annotations:
                target_annotations[name] = annotation_data.copy()
                copied_count += 1

        if copied_count > 0:
            annotations._write_annotation_file(
                target_patient, target_image, target_annotations
            )

        return jsonify({
            'status': 'success',
            'message': f'Propagated {copied_count} annotations',
            'target_patient': target_patient,
            'target_image': target_image,
            'copied_count': copied_count
        })

    except Exception as e:
        current_app.logger.error(f"Error propagating annotations: {e}", exc_info=True)
        return error_response(str(e), 500)
