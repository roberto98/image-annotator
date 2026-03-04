# blueprints/views/main.py
"""Main application views (menu, annotation, help)."""

from flask import render_template, redirect, url_for, flash, request, current_app, abort, send_from_directory, send_file, jsonify
from pathlib import Path
from typing import Dict, Any, Tuple
import json
import io
import config
from app.imaging import load_image, is_dicom_file
from app.visualization import LandmarkVisualizer
from app.image_manager import IMAGE_EXTENSIONS as ALL_IMAGE_EXTENSIONS
from app.blueprints.views import views_bp

# DICOM-to-JPEG conversion quality
DICOM_JPEG_QUALITY = 95


def _get_images_manager():
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
    """Count annotated images and total annotations.

    Returns:
        Tuple of (annotated_images_count, total_annotations_count)
    """
    annotated_files = set()
    total_annotations = 0

    for patient_dir in annotation_dir.iterdir():
        if not patient_dir.is_dir() or patient_dir.name.startswith("__"):
            continue

        for json_file in patient_dir.glob("*_annotations.json"):
            try:
                data = json.loads(json_file.read_text())
                annotations_dict = data.get("annotations", {})
                valid_annotations = [ann for ann in annotations_dict.values()
                                     if isinstance(ann, dict) and ann.get('status') == 'ok']
                if valid_annotations:
                    image_stem = json_file.stem.replace("_annotations", "")
                    annotated_files.add(f"{patient_dir.name}/{image_stem}")
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

    ann_path = Path(config.ANNOTATION_DIR) / patient / f"{Path(image).stem}_annotations.json"
    current_annotations = {}
    if ann_path.exists():
        try:
            current_annotations = json.loads(ann_path.read_text(encoding='utf-8')).get('annotations', {})
        except Exception:
            pass
    prev_img = images.get_previous_image(patient, image)
    next_img = images.get_next_image(patient, image)
    idx = images.get_image_index(patient, image)
    display_index = (idx + 1) if idx is not None else 0
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
                           current_index=display_index,
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
    directory = Path(config.IMAGE_DIR) / Path(patient).name
    if not directory.resolve().is_relative_to(Path(config.IMAGE_DIR).resolve()):
        abort(404)
    if not directory.exists():
        abort(404)

    image_path = directory / image

    if not image_path.exists():
        abort(404)

    if is_dicom_file(image_path):
        try:
            img = load_image(image_path, force_invert_dicom=True)
            img_io = io.BytesIO()
            img.save(img_io, 'JPEG', quality=DICOM_JPEG_QUALITY)
            img_io.seek(0)
            return send_file(img_io, mimetype='image/jpeg')
        except Exception as e:
            current_app.logger.error(f"Error serving DICOM file {image_path}: {e}", exc_info=True)
            abort(500)

    return send_from_directory(str(directory), image)


@views_bp.route('/help')
def help_page() -> str:
    """Help and documentation page."""
    return render_template("help.html")


@views_bp.route('/regenerate-annotations')
def regenerate_annotations() -> tuple:
    """Regenerate all annotated image visualizations."""
    try:
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
        return jsonify({"status": "success", "message": "Annotations regenerated successfully"})
    except Exception as e:
        current_app.logger.error(f"Error regenerating annotations: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500
