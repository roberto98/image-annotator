# blueprints/api/landmarks.py
"""Landmark annotation API endpoints."""

from flask import jsonify, request
import config
from app.blueprints.api import api_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    from flask import current_app
    return current_app.config['annotations']


@api_bp.route('/landmarks/<patient>/<image>')
def get_image_landmarks(patient, image):
    """Return all annotations for an image as JSON."""
    annotations = get_annotations_manager()
    raw_annotations = annotations.get_all_landmarks(patient, image)
    return jsonify(raw_annotations)


@api_bp.route('/landmarks/<patient>/<image>/<landmark_name>', methods=['POST'])
def save_landmark_annotation(patient, image, landmark_name):
    """Save, update, or remove a landmark annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action == 'coordinates':
        x = request.json.get('x')
        y = request.json.get('y')
        annotations.write_coordinates(patient, image, landmark_name, x, y)
        return jsonify({'status': 'success'})

    elif action == 'occluded':
        annotations.mark_occluded(patient, image, landmark_name)
        return jsonify({'status': 'success'})

    elif action == 'remove':
        annotations.remove_landmark(patient, image, landmark_name)
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400


@api_bp.route('/landmarks', methods=['POST'])
def add_new_landmark():
    """Register a new landmark label (no-op since labels are auto-discovered)."""
    landmark_name = request.json.get('landmark_name')
    if landmark_name:
        config.add_new_landmark(landmark_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid landmark name'}), 400
