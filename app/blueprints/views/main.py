# blueprints/views/main.py
"""Main application views (menu, annotation, help)."""

from flask import render_template, redirect, url_for, flash, request, current_app, abort, send_from_directory, send_file, jsonify
from pathlib import Path
import json
import io
import config
import utils
from app.blueprints.views import views_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    return current_app.config['annotations']


def get_images_manager():
    """Get the images manager from the app context."""
    return current_app.config['images']


@views_bp.route('/')
def main_menu():
    """Main dashboard with statistics and annotation management."""
    stats = {
        'total_images': 0,
        'total_patients': 0,
        'annotated_images': 0,
        'total_annotations': 0,
        'annotation_percentage': 0
    }

    image_dir = Path(config.IMAGE_DIR)
    annotation_dir = Path(config.ANNOTATION_DIR)

    if image_dir.exists():
        patients = [p for p in image_dir.iterdir() if p.is_dir()]
        stats['total_patients'] = len(patients)

        for patient in patients:
            for ext in ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom'):
                stats['total_images'] += len(list(patient.glob(ext)))

    # Count annotated images
    if annotation_dir.exists():
        annotated_files = set()
        for patient_dir in annotation_dir.iterdir():
            if patient_dir.is_dir() and not patient_dir.name.startswith("__"):
                for json_file in patient_dir.glob("*.json"):
                    try:
                        data = json.loads(json_file.read_text())
                        if any(ann.get('status') == 'ok' for ann in data.values() if isinstance(ann, dict)):
                            annotated_files.add(f"{patient_dir.name}/{json_file.stem}")
                            stats['total_annotations'] += sum(1 for ann in data.values()
                                                               if isinstance(ann, dict) and ann.get('status') == 'ok')
                    except Exception:
                        continue

        stats['annotated_images'] = len(annotated_files)

    if stats['total_images'] > 0:
        stats['annotation_percentage'] = round((stats['annotated_images'] / stats['total_images']) * 100, 1)

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


@views_bp.route('/start-annotation')
def start_annotation():
    """Begin annotation process with the first image."""
    images = get_images_manager()
    first_img = images.get_first_image()
    if not first_img:
        flash("No images found to annotate")
        return redirect(url_for('views.main_menu'))
    return redirect(url_for("views.annotate_image", patient=first_img['patient'], image=first_img['filename']))


@views_bp.route('/annotate/<patient>/<image>')
def annotate_image(patient, image):
    """Image annotation interface."""
    annotations = get_annotations_manager()
    images = get_images_manager()

    image_path = Path(config.IMAGE_DIR) / patient / image
    if not image_path.exists():
        flash("Image not found")
        return redirect(url_for("views.main_menu"))

    all_landmarks = config.get_landmarks()
    all_segments = config.get_segments()
    all_figures = config.get_figures()

    current_annotations = annotations.get_all_landmarks(patient, image)
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


@views_bp.route('/set-landmark', methods=['POST'])
def set_landmark():
    """Legacy form endpoint for landmark management."""
    action = request.form.get('action', 'add')
    landmark_name = request.form.get('landmark_name')

    if action == 'add' and landmark_name:
        config.add_new_landmark(landmark_name)
        flash(f'Landmark "{landmark_name}" added successfully.')
    elif action == 'remove' and landmark_name:
        if config.remove_landmark(landmark_name):
            flash(f'Landmark "{landmark_name}" removed successfully.')
        else:
            flash(f'Cannot remove landmark "{landmark_name}" as it is being used in annotations.')

    return redirect(url_for('views.main_menu'))


@views_bp.route('/remove-landmark', methods=['POST'])
def remove_landmark():
    """Remove a landmark and all its annotations."""
    landmark_name = request.form.get('landmark_name')
    if landmark_name:
        files_modified, files_deleted = config.remove_landmark_files(landmark_name)
        flash(f'Successfully removed landmark "{landmark_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid landmark name.')
    return redirect(url_for('views.main_menu'))


@views_bp.route('/remove-segment', methods=['POST'])
def remove_segment():
    """Remove a segment label and all its annotations from files."""
    segment_name = request.form.get('segment_name')
    if segment_name:
        files_modified, files_deleted = config.remove_segment_files(segment_name)
        flash(f'Successfully removed segment "{segment_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid segment name.')
    return redirect(url_for('views.main_menu'))


@views_bp.route('/remove-figure', methods=['POST'])
def remove_figure():
    """Remove a figure label and all its annotations from files."""
    figure_name = request.form.get('figure_name')
    if figure_name:
        files_modified, files_deleted = config.remove_figure_files(figure_name)
        flash(f'Successfully removed figure "{figure_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid figure name.')
    return redirect(url_for('views.main_menu'))


@views_bp.route("/images/<patient>/<image>")
def serve_image(patient, image):
    """Serve image file, converting DICOM to JPEG on-the-fly."""
    directory = Path(config.IMAGE_DIR) / patient
    if not directory.exists():
        abort(404)

    image_path = directory / image

    if utils.is_dicom_file(image_path):
        try:
            img = utils.load_image(image_path, force_invert_dicom=True)
            img_io = io.BytesIO()
            img.save(img_io, 'JPEG', quality=95)
            img_io.seek(0)
            return send_file(img_io, mimetype='image/jpeg')
        except Exception as e:
            current_app.logger.error(f"Error serving DICOM file {image_path}: {e}")
            abort(500)
    else:
        return send_from_directory(str(directory), image)


@views_bp.route('/serve_file/<path:filename>')
def serve_file(filename):
    """Serve arbitrary file by path."""
    directory = Path(filename).parent
    file_name = Path(filename).name
    if not directory.exists():
        abort(404)
    return send_from_directory(str(directory), file_name)


@views_bp.route('/help')
def help_page():
    """Help and documentation page."""
    return render_template("help.html")


@views_bp.route('/regenerate-annotations')
def regenerate_annotations():
    """Regenerate all annotated image visualizations."""
    try:
        from postprocessing_draw_landmarks import LandmarkVisualizer
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
        return jsonify({"status": "success", "message": "Annotations regenerated successfully"})
    except Exception as e:
        current_app.logger.error(f"Error regenerating annotations: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500
