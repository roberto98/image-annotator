# blueprints/views/browse.py
"""Image browsing and export views."""

from flask import render_template, abort, send_from_directory, current_app
from pathlib import Path
import json
import config
from app.blueprints.views import views_bp

# Supported image file extensions
IMAGE_EXTENSIONS = ('*.png', '*.jpg', '*.jpeg')
ALL_IMAGE_EXTENSIONS = IMAGE_EXTENSIONS + ('*.dcm', '*.dicom')


@views_bp.route('/browse-images')
def browse_images() -> str:
    """Image browser page."""
    return render_template("browse_images.html")


@views_bp.route('/view-annotations')
def view_annotations() -> str:
    """View all annotated images with visualizations."""
    annotated_dir = Path(config.ANNOTATION_DIR) / "__images_with_landmarks"
    annotated_dir.mkdir(exist_ok=True, parents=True)

    try:
        from postprocessing_draw_landmarks import LandmarkVisualizer
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
    except Exception as e:
        current_app.logger.error(f"Error generating annotated images: {e}", exc_info=True)

    patients = []
    for patient_dir in annotated_dir.iterdir():
        if not patient_dir.is_dir():
            continue

        imgs = []
        for ext in IMAGE_EXTENSIONS:
            imgs.extend(p.name for p in patient_dir.glob(ext))

        if imgs:
            patients.append({'patient': patient_dir.name, 'images': sorted(imgs)})

    patients.sort(key=lambda x: x['patient'])
    return render_template("view_annotations.html", patients=patients, has_images=bool(patients))


@views_bp.route('/annotated/<patient>/<image>')
def serve_annotated_image(patient: str, image: str) -> str:
    """Serve annotated image with overlays."""
    directory = Path(config.ANNOTATION_DIR) / "__images_with_landmarks" / patient
    if not directory.exists():
        abort(404)
    return send_from_directory(directory, image)


@views_bp.route('/export')
def export_page() -> str:
    """Export page with image selection and format options."""
    image_dir = Path(config.IMAGE_DIR)
    annotation_dir = Path(config.ANNOTATION_DIR)

    images_list = []
    for patient_dir in sorted(image_dir.iterdir()):
        if not patient_dir.is_dir():
            continue

        for ext in ALL_IMAGE_EXTENSIONS:
            for img_path in sorted(patient_dir.glob(ext)):
                annotation_count = _count_annotations(annotation_dir, patient_dir.name, img_path.stem)
                images_list.append({
                    'patient': patient_dir.name,
                    'filename': img_path.name,
                    'annotation_count': annotation_count
                })

    return render_template('export.html', images=images_list)


def _count_annotations(annotation_dir: Path, patient: str, image_stem: str) -> int:
    """Count valid annotations for an image."""
    json_file = annotation_dir / patient / f"{image_stem}.json"
    if not json_file.exists():
        return 0

    try:
        data = json.loads(json_file.read_text())
        return sum(1 for ann in data.values()
                  if isinstance(ann, dict) and ann.get('status') == 'ok')
    except Exception:
        return 0
