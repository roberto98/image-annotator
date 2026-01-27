# blueprints/api/segments.py
"""Segment (polygon) annotation API endpoints."""

from flask import jsonify, request
import config
from app.blueprints.api import api_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    from flask import current_app
    return current_app.config['annotations']


@api_bp.route('/segments/<patient>/<image>')
def get_image_segments(patient, image):
    """Return polygon segments for an image as JSON."""
    annotations = get_annotations_manager()
    all_annotations = annotations.get_all_landmarks(patient, image)

    # Filter to only include polygon segments
    segments = {}
    for name, data in all_annotations.items():
        if data.get("type") == "polygon":
            segments[name] = data

    return jsonify(segments)


@api_bp.route('/segments/<patient>/<image>/<segment_name>', methods=['POST'])
def save_segment_annotation(patient, image, segment_name):
    """Save or remove a polygon segment annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action == 'polygon':
        points = request.json.get('points', [])
        annotations.write_polygon(patient, image, segment_name, points)
        return jsonify({'status': 'success'})

    elif action == 'remove':
        annotations.remove_segment(patient, image, segment_name)
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400


@api_bp.route('/segments', methods=['POST'])
def add_new_segment():
    """Register a new segment label (no-op since labels are auto-discovered)."""
    segment_name = request.json.get('segment_name')
    if segment_name:
        config.add_new_segment(segment_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid segment name'}), 400
