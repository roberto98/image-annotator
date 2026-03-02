# blueprints/api/__init__.py
"""API blueprint aggregating all REST endpoints."""

from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api")

from app.blueprints.api import images, export
from app.blueprints.api.annotations import annotations_bp

__all__ = ["api_bp", "annotations_bp"]
