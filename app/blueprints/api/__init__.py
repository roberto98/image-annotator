# blueprints/api/__init__.py
"""API blueprint aggregating all REST endpoints."""

from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api')

# Import and register route modules
from app.blueprints.api import landmarks, segments, figures, images, export
