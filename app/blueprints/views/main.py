# blueprints/views/main.py
"""Main application views (menu, annotation, help)."""

from flask import render_template, redirect, url_for, flash, request, current_app, abort, send_from_directory, send_file, jsonify
from pathlib import Path
from typing import Dict, Any, Tuple
import json
import io
import config
import utils
from app.blueprints.views import views_bp
from app.legacy_annotations import AnnotationManager
from app.image_manager import ImageManager

# Annotations data directory
DATA_DIR = Path("data")

# Supported image file extensions
IMAGE_EXTENSIONS = ('*.png', '*.jpg', '*.jpeg')
ALL_IMAGE_EXTENSIONS = IMAGE_EXTENSIONS + ('*.dcm', '*.dicom')

# DICOM-to-JPEG conversion quality
DICOM_JPEG_QUALITY = 95


def _get_annotations_manager() -> AnnotationManager:
    """Get the annotations manager from the app context."""
    return current_app.config['annotations']


def _load_annotations(patient: str, image: str) -> Dict[str, Any]:
    """Load annotations from data directory.

    Returns the annotations dict, or empty dict if not found.
    Format: {"version": 2, "annotations": {...}, ...}
    Returns just the annotations dict for compatibility with legacy format.
    """
    image_stem = Path(image).stem
    annotation_path = DATA_DIR / patient / f"{image_stem}_annotations.json"

    if annotation_path.exists():
        try:
            data = json.loads(annotation_path.read_text(encoding='utf-8'))
            # Format stores annotations in 'annotations' field
            return data.get('annotations', {})
        except (json.JSONDecodeError, IOError) as e:
            current_app.logger.warning(f"Failed to load annotations from {annotation_path}: {e}")

    return {}


def _get_merged_annotations(patient: str, image: str) -> Dict[str, Any]:
    """Get annotations from both current and legacy sources, merged.

    Current annotations take precedence over legacy.
    """
    annotations = _get_annotations_manager()

    # Load legacy annotations
    legacy_annotations = annotations.get_all_landmarks(patient, image)

    # Load current annotations
    current_annotations = _load_annotations(patient, image)

    # Merge: current takes precedence
    merged = {**legacy_annotations, **current_annotations}

    return merged


def _get_images_manager() -> ImageManager:
    """Get the images manager from the app context."""
    return current_app.config['images']


@views_bp.route('/')
def main_menu() -> str:
    """Main dashboard with statistics and annotation management."""
    stats = _calculate_stats()

    try:
        landmarks = config.get_landmarks()
        segments = config.get_segments()
        figures = config.get_figures()
    except Exception as e:
        current_app.logger.error(f"Error loading annotation data: {e}")
        landmarks, segments, figures = [], [], []
        flash("Warning: Unable to load annotation information", "warning")

    return render_template("menu.html", image_dir=config.IMAGE_DIR,
                           stats=stats, landmarks=landmarks,
                           segments=segments, figures=figures)


def _calculate_stats() -> Dict[str, Any]:
    """Calculate dashboard statistics."""
    stats = {
        'total_images': 0,
        'total_patients': 0,
        'annotated_images': 0,
        'total_annotations': 0,
        'annotation_percentage': 0
    }

    image_dir = Path(config.IMAGE_DIR)
    if image_dir.exists():
        patients = [p for p in image_dir.iterdir() if p.is_dir()]
        stats['total_patients'] = len(patients)
        stats['total_images'] = _count_total_images(patients)

    annotation_dir = Path(config.ANNOTATION_DIR)
    if annotation_dir.exists():
        annotated_count, total_count = _count_annotations(annotation_dir)
        stats['annotated_images'] = annotated_count
        stats['total_annotations'] = total_count

    if stats['total_images'] > 0:
        stats['annotation_percentage'] = round((stats['annotated_images'] / stats['total_images']) * 100, 1)

    return stats


def _count_total_images(patients: list) -> int:
    """Count total images across all patients."""
    total = 0
    for patient in patients:
        for ext in ALL_IMAGE_EXTENSIONS:
            total += len(list(patient.glob(ext)))
    return total


def _count_annotations(annotation_dir: Path) -> Tuple[int, int]:
    """Count annotated images and total annotations from both legacy and current formats.

    Returns:
        Tuple of (annotated_images_count, total_annotations_count)
    """
    annotated_files = set()
    total_annotations = 0

    # Count legacy format annotations (annotations/*.json)
    for patient_dir in annotation_dir.iterdir():
        if not patient_dir.is_dir() or patient_dir.name.startswith("__"):
            continue

        for json_file in patient_dir.glob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                valid_annotations = [ann for ann in data.values()
                                   if isinstance(ann, dict) and ann.get('status') == 'ok']

                if valid_annotations:
                    annotated_files.add(f"{patient_dir.name}/{json_file.stem}")
                    total_annotations += len(valid_annotations)
            except Exception:
                continue

    # Count current format annotations (data/*_annotations.json)
    data_dir = Path(config.DATA_DIR)
    if data_dir.exists():
        for patient_dir in data_dir.iterdir():
            if not patient_dir.is_dir() or patient_dir.name.startswith("__"):
                continue

            for json_file in patient_dir.glob("*_annotations.json"):
                try:
                    data = json.loads(json_file.read_text())
                    # Current format has annotations under "annotations" key
                    annotations_dict = data.get("annotations", {})
                    valid_annotations = [ann for ann in annotations_dict.values()
                                       if isinstance(ann, dict) and ann.get('status') == 'ok']

                    if valid_annotations:
                        # Extract image name from filename (remove _annotations suffix)
                        image_stem = json_file.stem.replace("_annotations", "")
                        file_key = f"{patient_dir.name}/{image_stem}"
                        # Only count if not already counted from legacy
                        if file_key not in annotated_files:
                            annotated_files.add(file_key)
                            total_annotations += len(valid_annotations)
                except Exception:
                    continue

    return len(annotated_files), total_annotations


@views_bp.route('/start-annotation')
def start_annotation() -> str:
    """Begin annotation process with the first image."""
    images = _get_images_manager()
    first_img = images.get_first_image()
    if not first_img:
        flash("No images found to annotate")
        return redirect(url_for('views.main_menu'))
    return redirect(url_for("views.annotate_image", patient=first_img['patient'], image=first_img['filename']))


@views_bp.route('/annotate/<patient>/<image>')
def annotate_image(patient: str, image: str) -> str:
    """Image annotation interface."""
    images = _get_images_manager()

    image_path = Path(config.IMAGE_DIR) / patient / image
    if not image_path.exists():
        flash("Image not found")
        return redirect(url_for("views.main_menu"))

    all_landmarks = config.get_landmarks()
    all_segments = config.get_segments()
    all_figures = config.get_figures()

    # Load annotations from both current and legacy sources
    current_annotations = _get_merged_annotations(patient, image)
    prev_img = images.get_previous_image(patient, image)
    next_img = images.get_next_image(patient, image)
    current_index = images.get_image_index(patient, image)
    total_images = images.num_images

    return render_template("multi_landmark.html",
                           patient_id=patient,
                           image_name=image,
                           image_height=config.IMAGE_HEIGHT,
                           landmarks=all_landmarks,
                           segments=all_segments,
                           figures=all_figures,
                           current_annotations=current_annotations,
                           prev_img=prev_img,
                           next_img=next_img,
                           current_index=(current_index + 1),
                           total_images=total_images)


def _remove_annotation_type(form_field: str, type_label: str, remove_fn) -> str:
    """Remove an annotation type and redirect to main menu."""
    name = request.form.get(form_field)
    if not name:
        flash(f'Invalid {type_label} name.')
        return redirect(url_for('views.main_menu'))

    files_modified, files_deleted = remove_fn(name)
    flash(f'Successfully removed {type_label} "{name}" and its annotations. '
          f'Modified: {files_modified}, Deleted: {files_deleted}')
    return redirect(url_for('views.main_menu'))


@views_bp.route('/remove-landmark', methods=['POST'])
def remove_landmark() -> str:
    """Remove a landmark and all its annotations."""
    return _remove_annotation_type('landmark_name', 'landmark', config.remove_landmark_files)


@views_bp.route('/remove-segment', methods=['POST'])
def remove_segment() -> str:
    """Remove a segment label and all its annotations."""
    return _remove_annotation_type('segment_name', 'segment', config.remove_segment_files)


@views_bp.route('/remove-figure', methods=['POST'])
def remove_figure() -> str:
    """Remove a figure label and all its annotations."""
    return _remove_annotation_type('figure_name', 'figure', config.remove_figure_files)


@views_bp.route("/images/<patient>/<image>")
def serve_image(patient: str, image: str) -> str:
    """Serve image file, converting DICOM to JPEG on-the-fly."""
    directory = Path(config.IMAGE_DIR) / patient
    if not directory.exists():
        abort(404)

    image_path = directory / image

    if utils.is_dicom_file(image_path):
        try:
            img = utils.load_image(image_path, force_invert_dicom=True)
            img_io = io.BytesIO()
            img.save(img_io, 'JPEG', quality=DICOM_JPEG_QUALITY)
            img_io.seek(0)
            return send_file(img_io, mimetype='image/jpeg')
        except Exception as e:
            current_app.logger.error(f"Error serving DICOM file {image_path}: {e}")
            abort(500)

    return send_from_directory(directory, image)


@views_bp.route('/serve_file/<path:filename>')
def serve_file(filename: str) -> str:
    """Serve arbitrary file by path."""
    file_path = Path(filename)
    if not file_path.parent.exists():
        abort(404)
    return send_from_directory(file_path.parent, file_path.name)


@views_bp.route('/help')
def help_page() -> str:
    """Help and documentation page."""
    return render_template("help.html")


@views_bp.route('/regenerate-annotations')
def regenerate_annotations() -> tuple:
    """Regenerate all annotated image visualizations."""
    try:
        from postprocessing_draw_landmarks import LandmarkVisualizer
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
        return jsonify({"status": "success", "message": "Annotations regenerated successfully"})
    except Exception as e:
        current_app.logger.error(f"Error regenerating annotations: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500
