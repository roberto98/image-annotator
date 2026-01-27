# blueprints/api/export.py
"""Annotation export API endpoints."""

from flask import jsonify, request, make_response, current_app
from datetime import datetime
import json
import csv
import io
import xml.etree.ElementTree as ET
from xml.dom import minidom
from app.blueprints.api import api_bp


def get_annotations_manager():
    """Get the annotations manager from the app context."""
    return current_app.config['annotations']


@api_bp.route('/export', methods=['POST'])
def export_annotations():
    """Export selected annotations as JSON, CSV, or XML file."""
    annotations = get_annotations_manager()
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
