# app.py
"""Flask web application for image annotation.

Provides REST API endpoints for managing annotations (landmarks, polygons, figures)
and web interface for browsing and annotating medical images.
"""
import os
from flask import Flask, render_template, request, redirect, url_for, flash, abort, send_from_directory, jsonify, send_file, make_response
from pathlib import Path
import config
import logging
from logging.handlers import RotatingFileHandler
from app.annotations import AnnotationManager
from app.images import ImageManager
from PIL import Image
from datetime import datetime
import json
import utils
import io
from polygon_utils import generate_mask_from_polygon

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

def setup_logging(app):
    """Configure error-only logging to rotating file."""
    log_dir = Path('logs')
    log_dir.mkdir(exist_ok=True)
    
    # Single log file for the entire application
    log_file = log_dir / 'app_errors.log'
    handler = RotatingFileHandler(str(log_file), maxBytes=1024*1024, backupCount=5)
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')
    handler.setFormatter(formatter)
    handler.setLevel(logging.ERROR)  # Only log errors and critical
    
    # Configure Flask app logger
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.ERROR)
    
    # Configure root logger to capture errors from all modules
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.ERROR)
    
    # Remove default Flask handlers that output to console
    app.logger.handlers = [h for h in app.logger.handlers if isinstance(h, RotatingFileHandler)]

setup_logging(app)
    
# Initialize global managers
annotations = AnnotationManager(config.ANNOTATION_DIR)
images = ImageManager(config.IMAGE_DIR, annotations)

@app.before_request
def ensure_directories():
    Path(config.IMAGE_DIR).mkdir(exist_ok=True, parents=True)
    Path(config.ANNOTATION_DIR).mkdir(exist_ok=True, parents=True)

@app.errorhandler(404)
def not_found_error(error):
    app.logger.error(f"404 error: {request.url}")
    return render_template('error.html', error_message="Page not found", details=request.url), 404

@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f"Unhandled exception: {e}", exc_info=True)
    return render_template('error.html', error_message="An unexpected error occurred", details=str(e)), 500

@app.route('/')
def main_menu():
    # Calculate statistics
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
                        # Check if it has any valid annotations
                        if any(ann.get('status') == 'ok' for ann in data.values() if isinstance(ann, dict)):
                            annotated_files.add(f"{patient_dir.name}/{json_file.stem}")
                            # Count individual annotations
                            stats['total_annotations'] += sum(1 for ann in data.values() 
                                                             if isinstance(ann, dict) and ann.get('status') == 'ok')
                    except Exception:
                        continue
        
        stats['annotated_images'] = len(annotated_files)
    
    # Calculate percentage
    if stats['total_images'] > 0:
        stats['annotation_percentage'] = round((stats['annotated_images'] / stats['total_images']) * 100, 1)
    
    try:
        # Single cache-backed call - all three use the same cached scan
        landmarks = config.get_landmarks()
        segments = config.get_segments()
        figures = config.get_figures()
    except Exception as e:
        app.logger.error(f"Error loading annotation data: {e}")
        landmarks, segments, figures = [], [], []
        flash("Warning: Unable to load annotation information", "warning")
    
    return render_template("menu.html", image_dir=config.IMAGE_DIR, 
                           stats=stats, landmarks=landmarks,
                           segments=segments, figures=figures)

@app.route('/start-annotation')
def start_annotation():
    # Begin the annotation process with the first image
    first_img = images.get_first_image()
    if not first_img:
        flash("No images found to annotate")
        return redirect(url_for('main_menu'))
    return redirect(url_for("annotate_image", patient=first_img['patient'], image=first_img['filename']))

@app.route('/annotate/<patient>/<image>')
def annotate_image(patient, image):
    image_path = Path(config.IMAGE_DIR) / patient / image
    if not image_path.exists():
        flash("Image not found")
        return redirect(url_for("main_menu"))
        
    # Get all annotation types (uses shared cache - single file scan)
    all_landmarks = config.get_landmarks()
    all_segments = config.get_segments()
    all_figures = config.get_figures()
    
    # Get current annotations for this image
    current_annotations = annotations.get_all_landmarks(patient, image)
    
    # Get navigation info
    prev_img = images.get_previous_image(patient, image)
    next_img = images.get_next_image(patient, image)
    
    # Get current image index and total image count
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

@app.route('/api/landmarks/<patient>/<image>')
def get_image_landmarks(patient, image):
    """Return all annotations for an image as JSON."""
    raw_annotations = annotations.get_all_landmarks(patient, image)
    return jsonify(raw_annotations)

@app.route('/api/landmarks/<patient>/<image>/<landmark_name>', methods=['POST'])
def save_landmark_annotation(patient, image, landmark_name):
    """Save, update, or remove a landmark annotation."""
    action = request.json.get('action')
    
    if action == 'coordinates':
        x = request.json.get('x')
        y = request.json.get('y')
        
        # Coordinates arrive pre-scaled to original image pixel space from frontend
        annotations.write_coordinates(patient, image, landmark_name, x, y)
        return jsonify({'status': 'success'})
        
    elif action == 'occluded':
        annotations.mark_occluded(patient, image, landmark_name)
        return jsonify({'status': 'success'})
        
    elif action == 'remove':
        annotations.remove_landmark(patient, image, landmark_name)
        return jsonify({'status': 'success'})
        
    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400

@app.route('/api/landmarks', methods=['POST'])
def add_new_landmark():
    """Register a new landmark label (no-op since labels are auto-discovered)."""
    landmark_name = request.json.get('landmark_name')
    if landmark_name:
        config.add_new_landmark(landmark_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid landmark name'}), 400

@app.route('/api/segments/<patient>/<image>')
def get_image_segments(patient, image):
    """Return polygon segments for an image as JSON."""
    all_annotations = annotations.get_all_landmarks(patient, image)
    
    # Filter to only include polygon segments
    segments = {}
    for name, data in all_annotations.items():
        if data.get("type") == "polygon":
            segments[name] = data
    
    return jsonify(segments)

@app.route('/api/segments/<patient>/<image>/<segment_name>', methods=['POST'])
def save_segment_annotation(patient, image, segment_name):
    """Save or remove a polygon segment annotation."""
    action = request.json.get('action')
    
    if action == 'polygon':
        points = request.json.get('points', [])
        annotations.write_polygon(patient, image, segment_name, points)
        return jsonify({'status': 'success'})
        
    elif action == 'remove':
        annotations.remove_segment(patient, image, segment_name)
        return jsonify({'status': 'success'})
        
    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400

@app.route('/api/segments', methods=['POST'])
def add_new_segment():
    """Register a new segment label (no-op since labels are auto-discovered)."""
    segment_name = request.json.get('segment_name')
    if segment_name:
        config.add_new_segment(segment_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid segment name'}), 400

@app.route('/api/figures/<patient>/<image>')
def get_image_figures(patient, image):
    """Return figure annotations for an image as JSON."""
    all_annotations = annotations.get_all_landmarks(patient, image)
    
    # Filter to only include figures
    figures = {}
    for name, data in all_annotations.items():
        if data.get("type") == "figure":
            figures[name] = data
    
    return jsonify(figures)

@app.route('/api/figures/<patient>/<image>/<figure_name>', methods=['POST'])
def save_figure_annotation(patient, image, figure_name):
    """Save, update, or remove a figure annotation."""
    action = request.json.get('action')
    
    if action in ('figure', 'update'):
        x = request.json.get('x')
        y = request.json.get('y')
        shape = request.json.get('shape', 'circle')
        size = request.json.get('size', 50)
        
        if shape == 'line':
            annotations.write_figure(patient, image, figure_name, x, y, shape, size,
                                   start_x=request.json.get('startX'),
                                   start_y=request.json.get('startY'),
                                   end_x=request.json.get('endX'),
                                   end_y=request.json.get('endY'))
        else:
            annotations.write_figure(patient, image, figure_name, x, y, shape, size)
        return jsonify({'status': 'success'})
        
    elif action == 'remove':
        annotations.remove_figure(patient, image, figure_name)
        return jsonify({'status': 'success'})
        
    return jsonify({'status': 'error', 'message': 'Invalid action'}), 400

@app.route('/api/figures', methods=['POST'])
def add_new_figure():
    """Register a new figure label (no-op since labels are auto-discovered)."""
    figure_name = request.json.get('figure_name')
    if figure_name:
        config.add_new_figure(figure_name)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid figure name'}), 400

@app.route('/set-landmark', methods=['POST'])
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
    
    return redirect(url_for('main_menu'))

@app.route("/images/<patient>/<image>")
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
            app.logger.error(f"Error serving DICOM file {image_path}: {e}")
            abort(500)
    else:
        return send_from_directory(str(directory), image)

@app.route('/view-annotations')
def view_annotations():
    annotated_dir = Path(config.ANNOTATION_DIR) / "__images_with_landmarks"
    annotated_dir.mkdir(exist_ok=True, parents=True)
    try:
        from postprocessing_draw_landmarks import LandmarkVisualizer
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
    except Exception as e:
        app.logger.error(f"Error generating annotated images: {e}", exc_info=True)
    patients = []
    for patient_dir in annotated_dir.iterdir():
        if patient_dir.is_dir():
            imgs = []
            for ext in ('*.png', '*.jpg', '*.jpeg'):
                imgs.extend([p.name for p in patient_dir.glob(ext)])
            if imgs:
                patients.append({'patient': patient_dir.name, 'images': sorted(imgs)})
    patients.sort(key=lambda x: x['patient'])
    return render_template("view_annotations.html", patients=patients, has_images=bool(patients))

@app.route('/annotated/<patient>/<image>')
def serve_annotated_image(patient, image):
    directory = Path(config.ANNOTATION_DIR) / "__images_with_landmarks" / patient
    if not directory.exists():
        abort(404)
    return send_from_directory(str(directory), image)

@app.route('/remove-landmark', methods=['POST'])
def remove_landmark():
    landmark_name = request.form.get('landmark_name')
    if landmark_name:
        files_modified, files_deleted = config.remove_landmark_files(landmark_name)
        flash(f'Successfully removed landmark "{landmark_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid landmark name.')
    return redirect(url_for('main_menu'))

@app.route('/remove-segment', methods=['POST'])
def remove_segment():
    """Remove a segment label and all its annotations from files."""
    segment_name = request.form.get('segment_name')
    if segment_name:
        files_modified, files_deleted = config.remove_segment_files(segment_name)
        flash(f'Successfully removed segment "{segment_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid segment name.')
    return redirect(url_for('main_menu'))

@app.route('/remove-figure', methods=['POST'])
def remove_figure():
    """Remove a figure label and all its annotations from files."""
    figure_name = request.form.get('figure_name')
    if figure_name:
        files_modified, files_deleted = config.remove_figure_files(figure_name)
        flash(f'Successfully removed figure "{figure_name}" and its annotations. '
              f'Modified: {files_modified}, Deleted: {files_deleted}')
    else:
        flash('Invalid figure name.')
    return redirect(url_for('main_menu'))

@app.route('/serve_file/<path:filename>')
def serve_file(filename):
    directory = Path(filename).parent
    file_name = Path(filename).name
    if not directory.exists():
        abort(404)
    return send_from_directory(str(directory), file_name)

@app.route('/api/image-directory')
def get_image_directory():
    """API endpoint to get the image directory structure."""
    base_dir = Path(config.IMAGE_DIR)
    if not base_dir.exists():
        return jsonify({"status": "error", "message": "Directory not found"})
    
    result = {
        "name": base_dir.name or "images",
        "path": str(base_dir),
        "type": "directory",
        "children": []
    }
    
    def explore_directory(dir_path, dir_obj):
        for item in sorted(dir_path.iterdir()):
            if item.is_dir():
                child_dir = {
                    "name": item.name,
                    "path": str(item),
                    "type": "directory",
                    "children": []
                }
                explore_directory(item, child_dir)
                dir_obj["children"].append(child_dir)
            elif item.suffix.lower() in ['.png', '.jpg', '.jpeg', '.dcm', '.dicom']:
                dir_obj["children"].append({
                    "name": item.name,
                    "path": str(item),
                    "type": "image",
                    "patient": dir_path.name
                })
    
    explore_directory(base_dir, result)
    return jsonify(result)

@app.route('/browse-images')
def browse_images():
    """Image browser page."""
    return render_template("browse_images.html")

@app.route('/help')
def help_page():
    """Help and documentation page."""
    return render_template("help.html")

@app.route('/regenerate-annotations')
def regenerate_annotations():
    """Regenerate all annotated image visualizations."""
    try:
        # Import the visualizer and regenerate all images
        from postprocessing_draw_landmarks import LandmarkVisualizer
        visualizer = LandmarkVisualizer()
        visualizer.process_all_images()
        return jsonify({"status": "success", "message": "Annotations regenerated successfully"})
    except Exception as e:
        app.logger.error(f"Error regenerating annotations: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/propagate-annotations', methods=['POST'])
def propagate_annotations():
    """Copy annotations from current image to next unannotated image."""
    try:
        data = request.json
        current_patient = data.get('current_patient')
        current_image = data.get('current_image')
        annotations_to_propagate = data.get('annotations', {})
        
        if not current_patient or not current_image:
            return jsonify({'status': 'error', 'message': 'Missing patient or image information'}), 400
        
        next_image = images.get_next_unannotated_image(current_patient, current_image)
        
        if not next_image:
            return jsonify({'status': 'error', 'message': 'No unannotated images found'}), 404
        
        target_patient = next_image['patient']
        target_image = next_image['filename']
        target_annotations = annotations.get_all_landmarks(target_patient, target_image)
        
        # Copy non-existing annotations to target
        copied_count = 0
        for name, annotation_data in annotations_to_propagate.items():
            if name in target_annotations:
                continue
            target_annotations[name] = annotation_data.copy()
            copied_count += 1
        
        if copied_count > 0:
            annotations._write_annotation_file(target_patient, target_image, target_annotations, new_annotation=False)
        
        return jsonify({
            'status': 'success',
            'message': f'Propagated {copied_count} annotations',
            'target_patient': target_patient,
            'target_image': target_image,
            'copied_count': copied_count
        })
        
    except Exception as e:
        app.logger.error(f"Error propagating annotations: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/mask/<patient>/<image>/<segment_name>')
def get_segment_mask(patient, image, segment_name):
    """Generate binary mask PNG from polygon segment."""
    try:
        data = annotations.get_all_landmarks(patient, image)
        
        if segment_name not in data or data[segment_name].get("type") != "polygon":
            return jsonify({"status": "error", "message": "Segment not found or not a polygon"}), 404
        
        image_path = Path(config.IMAGE_DIR) / patient / image
        if not image_path.exists():
            return jsonify({"status": "error", "message": "Image not found"}), 404
        
        if utils.is_dicom_file(image_path):
            img = utils.load_image(image_path)
        else:
            img = Image.open(image_path)
        
        width, height = img.size
        points = data[segment_name].get("points", [])
        mask = generate_mask_from_polygon(points, width, height)
        
        mask_img = Image.fromarray(mask.astype('uint8') * 255)
        img_io = io.BytesIO()
        mask_img.save(img_io, 'PNG')
        img_io.seek(0)
        
        return send_file(img_io, mimetype='image/png')
    
    except Exception as e:
        app.logger.error(f"Error generating mask: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500
    
@app.route('/export')
def export_page():
    """Export page with image selection and format options."""
    image_dir = Path(config.IMAGE_DIR)
    annotation_dir = Path(config.ANNOTATION_DIR)
    
    images_list = []
    for patient_dir in sorted(image_dir.iterdir()):
        if patient_dir.is_dir():
            for ext in ('*.png', '*.jpg', '*.jpeg', '*.dcm', '*.dicom'):
                for img_path in sorted(patient_dir.glob(ext)):
                    annotation_count = 0
                    json_file = annotation_dir / patient_dir.name / f"{img_path.stem}.json"
                    if json_file.exists():
                        try:
                            data = json.loads(json_file.read_text())
                            annotation_count = sum(1 for ann in data.values() 
                                                 if isinstance(ann, dict) and ann.get('status') == 'ok')
                        except Exception:
                            pass
                    
                    images_list.append({
                        'patient': patient_dir.name,
                        'filename': img_path.name,
                        'annotation_count': annotation_count
                    })
    
    return render_template('export.html', images=images_list)

@app.route('/api/export', methods=['POST'])
def export_annotations():
    """Export selected annotations as JSON, CSV, or XML file."""
    import csv
    import xml.etree.ElementTree as ET
    from xml.dom import minidom
    
    data = request.json
    export_format = data.get('format', 'json')
    selected_images = data.get('images', [])
    
    if not selected_images:
        return jsonify({'error': 'No images selected'}), 400
    
    all_annotations = {}
    for img_key in selected_images:
        patient, filename = img_key.split('/')
        annotations_data = annotations.get_all_landmarks(patient, filename)
        
        if annotations_data:
            all_annotations[img_key] = {
                'patient': patient,
                'image': filename,
                'annotations': annotations_data
            }
    
    if export_format == 'json':
        output = json.dumps(all_annotations, indent=2)
        mimetype = 'application/json'
        filename = 'annotations_export.json'
        
    elif export_format == 'csv':
        output_io = io.StringIO()
        writer = csv.writer(output_io)
        writer.writerow(['Patient', 'Image', 'Label', 'Type', 'Status', 'X', 'Y', 'Shape', 'Size', 'Points', 'Timestamp'])
        
        for img_key, img_data in all_annotations.items():
            patient = img_data['patient']
            image = img_data['image']
            
            for label, ann in img_data['annotations'].items():
                ann_type = ann.get('type', 'landmark')
                status = ann.get('status', '')
                x = y = shape = size = points = ''
                
                if ann.get('coordinates'):
                    x = ann['coordinates'].get('x', '')
                    y = ann['coordinates'].get('y', '')
                elif 'x' in ann:
                    x = ann['x']
                    y = ann['y']
                
                if ann.get('shape'):
                    shape = ann['shape']
                if ann.get('size'):
                    size = ann['size']
                if ann.get('points'):
                    points = json.dumps(ann['points'])
                
                timestamp = ann.get('timestamp', '')
                
                writer.writerow([patient, image, label, ann_type, status, x, y, shape, size, points, timestamp])
        
        output = output_io.getvalue()
        mimetype = 'text/csv'
        filename = 'annotations_export.csv'
        
    elif export_format == 'xml':
        root = ET.Element('annotations')
        root.set('exported', datetime.now().isoformat())
        
        for img_key, img_data in all_annotations.items():
            image_elem = ET.SubElement(root, 'image')
            image_elem.set('patient', img_data['patient'])
            image_elem.set('filename', img_data['image'])
            
            for label, ann in img_data['annotations'].items():
                ann_elem = ET.SubElement(image_elem, 'annotation')
                ann_elem.set('label', label)
                ann_elem.set('type', ann.get('type', 'landmark'))
                ann_elem.set('status', ann.get('status', ''))
                
                if ann.get('coordinates'):
                    ET.SubElement(ann_elem, 'x').text = str(ann['coordinates'].get('x', ''))
                    ET.SubElement(ann_elem, 'y').text = str(ann['coordinates'].get('y', ''))
                elif 'x' in ann:
                    ET.SubElement(ann_elem, 'x').text = str(ann['x'])
                    ET.SubElement(ann_elem, 'y').text = str(ann['y'])
                
                if ann.get('shape'):
                    ET.SubElement(ann_elem, 'shape').text = ann['shape']
                if ann.get('size'):
                    ET.SubElement(ann_elem, 'size').text = str(ann['size'])
                if ann.get('points'):
                    points_elem = ET.SubElement(ann_elem, 'points')
                    for point in ann['points']:
                        point_elem = ET.SubElement(points_elem, 'point')
                        point_elem.set('x', str(point.get('x', '')))
                        point_elem.set('y', str(point.get('y', '')))
                if ann.get('timestamp'):
                    ET.SubElement(ann_elem, 'timestamp').text = ann['timestamp']
        
        xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent='  ')
        output = xml_str
        mimetype = 'application/xml'
        filename = 'annotations_export.xml'
    
    else:
        return jsonify({'error': 'Invalid format'}), 400
    
    response = make_response(output)
    response.headers['Content-Type'] = mimetype
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    return response

@app.route('/api/next-unannotated')
def next_unannotated():
    """Find next image without annotations."""
    current_patient = request.args.get('current_patient')
    current_image = request.args.get('current_image')
    
    result = images.get_next_unannotated_image(current_patient, current_image)
    if result:
        return jsonify({'patient': result['patient'], 'image': result['filename']})
    return jsonify({'patient': None, 'image': None})

if __name__ == '__main__':
    app.run()