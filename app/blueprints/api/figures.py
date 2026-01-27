# blueprints/api/figures.py
"""Figure annotation API endpoints."""

from flask import jsonify, request
import config
from app.blueprints.api import api_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    from flask import current_app
    return current_app.config['annotations']


@api_bp.route('/figures/<patient>/<image>')
def get_image_figures(patient, image):
    """Return figure annotations for an image as JSON."""
    annotations = get_annotations_manager()
    all_annotations = annotations.get_all_landmarks(patient, image)

    # Filter to only include figures
    figures = {}
    for name, data in all_annotations.items():
        if data.get("type") == "figure":
            figures[name] = data

    return jsonify(figures)


@api_bp.route('/figures/<patient>/<image>/<figure_name>', methods=['POST'])
def save_figure_annotation(patient, image, figure_name):
    """Save, update, or remove a figure annotation."""
    annotations = get_annotations_manager()
    action = request.json.get('action')

    if action in ('figure', 'update'):
        x = request.json.get('x')
        y = request.json.get('y')
        shape = request.json.get('shape', 'circle')
        size = request.json.get('size', 50)

        if shape == 'line':
            annotations.write_figure(patient, image, figure_name, x, y, shape, size,
                                     start_x=request.json.get('startX'),
                                     start_y=request.json.get('startY'),
                                     end_x=request.json.get('endX'),
                                     end_y=request.json.get('endY'))
        else:
            annotations.write_figure(patient, image, figure_name, x, y, shape, size)
        return jsonify({'status': 'success'})

    elif action == 'remove':
        annotations.remove_figure(patient, image, figure_name)
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400


@api_bp.route('/figures', methods=['POST'])
def add_new_figure():
    """Register a new figure label (no-op since labels are auto-discovered)."""
    figure_name = request.json.get('figure_name')
    if figure_name:
        config.add_new_figure(figure_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid figure name'}), 400
