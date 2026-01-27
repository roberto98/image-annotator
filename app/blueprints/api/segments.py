# blueprints/api/segments.py
"""Segment (polygon) annotation API endpoints."""

from flask import jsonify, request
from app.blueprints.api import api_bp
from app.blueprints.api.common import (
    get_annotations_manager,
    success_response,
    error_response,
    filter_annotations_by_type
)


@api_bp.route('/segments/<patient>/<image>')
def get_image_segments(patient: str, image: str) -> tuple:
    """Return polygon segments for an image as JSON."""
    annotations = get_annotations_manager()
    all_annotations = annotations.get_all_landmarks(patient, image)
    segments = filter_annotations_by_type(all_annotations, 'polygon')
    return jsonify(segments)


@api_bp.route('/segments/<patient>/<image>/<segment_name>', methods=['POST'])
def save_segment_annotation(patient: str, image: str, segment_name: str) -> tuple:
    """Save or remove a polygon segment annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action == 'polygon':
        points = request.json.get('points', [])
        annotations.write_polygon(patient, image, segment_name, points)
        return success_response()

    elif action == 'remove':
        annotations.remove_segment(patient, image, segment_name)
        return success_response()

    return error_response('Invalid action')
