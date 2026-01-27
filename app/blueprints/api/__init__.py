# blueprints/api/__init__.py
"""API blueprint aggregating all REST endpoints."""

from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api')

# Import route modules to register endpoints
from app.blueprints.api import common, landmarks, segments, figures, images, export

__all__ = ['api_bp']
