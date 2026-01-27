# blueprints/api/export.py
"""Annotation export API endpoints."""

from typing import Dict, Any, Tuple
from flask import jsonify, request, make_response, current_app, Response
from datetime import datetime
import json
import csv
import io
import xml.etree.ElementTree as ET
from xml.dom import minidom
from app.blueprints.api import api_bp
from app.blueprints.api.common import get_annotations_manager, error_response


def _extract_coordinates(ann: Dict[str, Any]) -> Tuple[str, str]:
    """Extract x, y coordinates from annotation data."""
    if ann.get('coordinates'):
        return str(ann['coordinates'].get('x', '')), str(ann['coordinates'].get('y', ''))
    return str(ann.get('x', '')), str(ann.get('y', ''))


def _export_as_json(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as JSON format."""
    output = json.dumps(all_annotations, indent=2)
    return output, 'application/json', 'annotations_export.json'


def _export_as_csv(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as CSV format."""
    output_io = io.StringIO()
    writer = csv.writer(output_io)
    writer.writerow(['Patient', 'Image', 'Label', 'Type', 'Status', 'X', 'Y', 'Shape', 'Size', 'Points', 'Timestamp'])

    for img_key, img_data in all_annotations.items():
        patient = img_data['patient']
        image = img_data['image']

        for label, ann in img_data['annotations'].items():
            x, y = _extract_coordinates(ann)
            writer.writerow([
                patient,
                image,
                label,
                ann.get('type', 'landmark'),
                ann.get('status', ''),
                x,
                y,
                ann.get('shape', ''),
                ann.get('size', ''),
                json.dumps(ann['points']) if ann.get('points') else '',
                ann.get('timestamp', '')
            ])

    return output_io.getvalue(), 'text/csv', 'annotations_export.csv'


def _export_as_xml(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as XML format."""
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

            x, y = _extract_coordinates(ann)
            if x or y:
                ET.SubElement(ann_elem, 'x').text = x
                ET.SubElement(ann_elem, 'y').text = y

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
    return xml_str, 'application/xml', 'annotations_export.xml'


EXPORT_FORMATS = {
    'json': _export_as_json,
    'csv': _export_as_csv,
    'xml': _export_as_xml
}


@api_bp.route('/export', methods=['POST'])
def export_annotations() -> Response:
    """Export selected annotations as JSON, CSV, or XML file."""
    annotations = get_annotations_manager()
    data = request.json
    export_format = data.get('format', 'json')
    selected_images = data.get('images', [])

    if not selected_images:
        return error_response('No images selected')

    if export_format not in EXPORT_FORMATS:
        return error_response('Invalid format')

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

    output, mimetype, filename = EXPORT_FORMATS[export_format](all_annotations)

    response = make_response(output)
    response.headers['Content-Type'] = mimetype
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    return response
