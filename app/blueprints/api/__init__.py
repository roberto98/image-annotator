# blueprints/api/__init__.py
"""API blueprint aggregating all REST endpoints."""

from typing import Tuple
from flask import Blueprint, jsonify, Response

api_bp = Blueprint("api", __name__, url_prefix="/api")


def error_response(message: str, status: int = 400) -> Tuple[Response, int]:
    """Return a standard JSON error response."""
    return jsonify({"error": message}), status


from app.blueprints.api import images, export
from app.blueprints.api.annotations import annotations_bp

__all__ = ["api_bp", "annotations_bp", "error_response"]
