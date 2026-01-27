# blueprints/api/images.py
"""Image-related API endpoints."""

from flask import jsonify, request, send_file, current_app
from pathlib import Path
from PIL import Image
import io
import config
import utils
from polygon_utils import generate_mask_from_polygon
from app.blueprints.api import api_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    return current_app.config['annotations']


def get_images_manager():
    """Get the images manager from the app context."""
    return current_app.config['images']


@api_bp.route('/image-directory')
def get_image_directory():
    """API endpoint to get the image directory structure."""
    base_dir = Path(config.IMAGE_DIR)
    if not base_dir.exists():
        return jsonify({"status": "error", "message": "Directory not found"})

    result = {
        "name": base_dir.name or "images",
        "path": str(base_dir),
        "type": "directory",
        "children": []
    }

    def explore_directory(dir_path, dir_obj):
        for item in sorted(dir_path.iterdir()):
            if item.is_dir():
                child_dir = {
                    "name": item.name,
                    "path": str(item),
                    "type": "directory",
                    "children": []
                }
                explore_directory(item, child_dir)
                dir_obj["children"].append(child_dir)
            elif item.suffix.lower() in ['.png', '.jpg', '.jpeg', '.dcm', '.dicom']:
                dir_obj["children"].append({
                    "name": item.name,
                    "path": str(item),
                    "type": "image",
                    "patient": dir_path.name
                })

    explore_directory(base_dir, result)
    return jsonify(result)


@api_bp.route('/mask/<patient>/<image>/<segment_name>')
def get_segment_mask(patient, image, segment_name):
    """Generate binary mask PNG from polygon segment."""
    try:
        annotations = get_annotations_manager()
        data = annotations.get_all_landmarks(patient, image)

        if segment_name not in data or data[segment_name].get("type") != "polygon":
            return jsonify({"status": "error", "message": "Segment not found or not a polygon"}), 404

        image_path = Path(config.IMAGE_DIR) / patient / image
        if not image_path.exists():
            return jsonify({"status": "error", "message": "Image not found"}), 404

        if utils.is_dicom_file(image_path):
            img = utils.load_image(image_path)
        else:
            img = Image.open(image_path)

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
        return jsonify({"status": "error", "message": str(e)}), 500


@api_bp.route('/next-unannotated')
def next_unannotated():
    """Find next image without annotations."""
    images = get_images_manager()
    current_patient = request.args.get('current_patient')
    current_image = request.args.get('current_image')

    result = images.get_next_unannotated_image(current_patient, current_image)
    if result:
        return jsonify({'patient': result['patient'], 'image': result['filename']})
    return jsonify({'patient': None, 'image': None})


@api_bp.route('/propagate-annotations', methods=['POST'])
def propagate_annotations():
    """Copy annotations from current image to next unannotated image."""
    try:
        annotations = get_annotations_manager()
        images = get_images_manager()
        data = request.json
        current_patient = data.get('current_patient')
        current_image = data.get('current_image')
        annotations_to_propagate = data.get('annotations', {})

        if not current_patient or not current_image:
            return jsonify({'status': 'error', 'message': 'Missing patient or image information'}), 400

        next_image = images.get_next_unannotated_image(current_patient, current_image)

        if not next_image:
            return jsonify({'status': 'error', 'message': 'No unannotated images found'}), 404

        target_patient = next_image['patient']
        target_image = next_image['filename']
        target_annotations = annotations.get_all_landmarks(target_patient, target_image)

        # Copy non-existing annotations to target
        copied_count = 0
        for name, annotation_data in annotations_to_propagate.items():
            if name in target_annotations:
                continue
            target_annotations[name] = annotation_data.copy()
            copied_count += 1

        if copied_count > 0:
            annotations._write_annotation_file(target_patient, target_image, target_annotations, new_annotation=False)

        return jsonify({
            'status': 'success',
            'message': f'Propagated {copied_count} annotations',
            'target_patient': target_patient,
            'target_image': target_image,
            'copied_count': copied_count
        })

    except Exception as e:
        current_app.logger.error(f"Error propagating annotations: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
