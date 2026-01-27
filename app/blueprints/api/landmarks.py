# blueprints/api/landmarks.py
"""Landmark annotation API endpoints."""

from flask import jsonify, request
from app.blueprints.api import api_bp
from app.blueprints.api.common import get_annotations_manager, success_response, error_response


@api_bp.route('/landmarks/<patient>/<image>')
def get_image_landmarks(patient: str, image: str) -> tuple:
    """Return all annotations for an image as JSON."""
    annotations = get_annotations_manager()
    raw_annotations = annotations.get_all_landmarks(patient, image)
    return jsonify(raw_annotations)


@api_bp.route('/landmarks/<patient>/<image>/<landmark_name>', methods=['POST'])
def save_landmark_annotation(patient: str, image: str, landmark_name: str) -> tuple:
    """Save, update, or remove a landmark annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action == 'coordinates':
        x = request.json.get('x')
        y = request.json.get('y')
        annotations.write_coordinates(patient, image, landmark_name, x, y)
        return success_response()

    elif action == 'occluded':
        annotations.mark_occluded(patient, image, landmark_name)
        return success_response()

    elif action == 'remove':
        annotations.remove_landmark(patient, image, landmark_name)
        return success_response()

    return error_response('Invalid action')
