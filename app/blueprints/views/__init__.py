# blueprints/views/__init__.py
"""Views blueprint aggregating all web page routes."""

from flask import Blueprint

views_bp = Blueprint('views', __name__)

# Import and register route modules
from app.blueprints.views import main, browse
