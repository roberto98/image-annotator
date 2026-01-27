# blueprints/__init__.py
"""Flask blueprints for modular route organization."""

from app.blueprints.api import api_bp
from app.blueprints.views import views_bp

__all__ = ['api_bp', 'views_bp']
