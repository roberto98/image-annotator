# blueprints/api/common.py
"""Shared utilities for API endpoints."""

from typing import Dict, Any, Tuple
from flask import jsonify, current_app, Response
from app.annotations import AnnotationManager
from app.images import ImageManager


def get_annotations_manager() -> AnnotationManager:
    """Get the annotations manager from the app context."""
    return current_app.config['annotations']


def get_images_manager() -> ImageManager:
    """Get the images manager from the app context."""
    return current_app.config['images']


def success_response(data: Dict[str, Any] = None) -> Tuple[Response, int]:
    """Create a standard success response."""
    response = {'status': 'success'}
    if data:
        response.update(data)
    return jsonify(response), 200


def error_response(message: str, status_code: int = 400) -> Tuple[Response, int]:
    """Create a standard error response."""
    return jsonify({'status': 'error', 'message': message}), status_code


def filter_annotations_by_type(annotations: Dict[str, Any], annotation_type: str) -> Dict[str, Any]:
    """Filter annotations dictionary by type field."""
    return {
        name: data
        for name, data in annotations.items()
        if data.get('type') == annotation_type
    }
