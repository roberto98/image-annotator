# app.py
"""Flask web application for image annotation.

Uses the application factory pattern with blueprints for modular organization.
Provides REST API endpoints for managing annotations (landmarks, polygons, figures)
and web interface for browsing and annotating medical images.
"""
import os
from flask import Flask, render_template, request
from pathlib import Path
import logging
from logging.handlers import RotatingFileHandler
import config
from app.annotations import AnnotationManager
from app.images import ImageManager


def setup_logging(app: Flask) -> None:
    """Configure error-only logging to rotating file."""
    log_dir = Path('logs')
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / 'app_errors.log'
    handler = RotatingFileHandler(str(log_file), maxBytes=1024*1024, backupCount=5)
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')
    handler.setFormatter(formatter)
    handler.setLevel(logging.ERROR)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.ERROR)

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.ERROR)


def create_app() -> Flask:
    """Application factory for creating Flask app instances."""
    app = Flask(__name__)
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

    setup_logging(app)

    # Ensure required directories exist
    Path(config.IMAGE_DIR).mkdir(exist_ok=True, parents=True)
    Path(config.ANNOTATION_DIR).mkdir(exist_ok=True, parents=True)

    # Initialize global managers and store in app config
    annotations = AnnotationManager(config.ANNOTATION_DIR)
    images = ImageManager(config.IMAGE_DIR, annotations)
    app.config['annotations'] = annotations
    app.config['images'] = images

    # Register blueprints
    from app.blueprints import api_bp, views_bp
    app.register_blueprint(api_bp)
    app.register_blueprint(views_bp)

    # Setup error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        app.logger.error(f"404 error: {request.url}")
        return render_template('error.html', error_message="Page not found", details=request.url), 404

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.error(f"Unhandled exception: {e}", exc_info=True)
        return render_template('error.html', error_message="An unexpected error occurred", details=str(e)), 500

    return app
