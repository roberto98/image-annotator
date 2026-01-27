# blueprints/api/figures.py
"""Figure annotation API endpoints."""

from flask import jsonify, request
from app.blueprints.api import api_bp
from app.blueprints.api.common import (
    get_annotations_manager,
    success_response,
    error_response,
    filter_annotations_by_type
)


@api_bp.route('/figures/<patient>/<image>')
def get_image_figures(patient: str, image: str) -> tuple:
    """Return figure annotations for an image as JSON."""
    annotations = get_annotations_manager()
    all_annotations = annotations.get_all_landmarks(patient, image)
    figures = filter_annotations_by_type(all_annotations, 'figure')
    return jsonify(figures)


@api_bp.route('/figures/<patient>/<image>/<figure_name>', methods=['POST'])
def save_figure_annotation(patient: str, image: str, figure_name: str) -> tuple:
    """Save, update, or remove a figure annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action in ('figure', 'update'):
        x = request.json.get('x')
        y = request.json.get('y')
        shape = request.json.get('shape', 'circle')
        size = request.json.get('size', 50)

        if shape == 'line':
            annotations.write_figure(
                patient, image, figure_name, x, y, shape, size,
                start_x=request.json.get('startX'),
                start_y=request.json.get('startY'),
                end_x=request.json.get('endX'),
                end_y=request.json.get('endY')
            )
        else:
            annotations.write_figure(patient, image, figure_name, x, y, shape, size)
        return success_response()

    elif action == 'remove':
        annotations.remove_figure(patient, image, figure_name)
        return success_response()

    return error_response('Invalid action')
