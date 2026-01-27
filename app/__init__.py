# app/__init__.py
"""Flask application package.

Exports the application factory for creating Flask app instances.
"""
from app.app import create_app

__all__ = ['create_app']
