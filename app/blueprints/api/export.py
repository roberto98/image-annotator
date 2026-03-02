# blueprints/api/export.py
"""Annotation export API endpoints."""

from typing import Dict, Any, Tuple
from flask import request, make_response, Response
from datetime import datetime
import json
import csv
import io
import xml.etree.ElementTree as ET
from xml.dom import minidom
from app.blueprints.api import api_bp, error_response
from app.blueprints.api.annotations import _load_annotations as _load_full


def _load_annotations(patient: str, image: str) -> Dict[str, Any]:
    """Load annotations dict for patient/image using the authoritative loader."""
    return _load_full(patient, image).get('annotations', {})


def _extract_coordinates(ann: Dict[str, Any]) -> Tuple[str, str]:
    """Extract representative x, y coordinates from the new data sub-object."""
    data = ann.get("data", {})
    ann_type = ann.get("type", "point")

    if ann_type == "point":
        return str(data.get("x", "")), str(data.get("y", ""))
    elif ann_type == "circle":
        center = data.get("center", {})
        return str(center.get("x", "")), str(center.get("y", ""))
    elif ann_type == "polygon":
        points = data.get("points", [])
        if points:
            return str(points[0].get("x", "")), str(points[0].get("y", ""))
    elif ann_type == "line":
        start = data.get("start", {})
        return str(start.get("x", "")), str(start.get("y", ""))
    elif ann_type == "rectangle":
        tl = data.get("topLeft", {})
        return str(tl.get("x", "")), str(tl.get("y", ""))
    elif ann_type == "angle":
        vertex = data.get("vertex", {})
        return str(vertex.get("x", "")), str(vertex.get("y", ""))

    return "", ""


def _export_as_json(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as JSON format."""
    output = json.dumps(all_annotations, indent=2)
    return output, "application/json", "annotations_export.json"


def _export_as_csv(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as CSV format."""
    output_io = io.StringIO()
    writer = csv.writer(output_io)
    writer.writerow(
        ["Patient", "Image", "Label", "Type", "Status", "X", "Y", "Data", "Timestamp"]
    )

    for img_key, img_data in all_annotations.items():
        patient = img_data["patient"]
        image = img_data["image"]

        for label, ann in img_data["annotations"].items():
            x, y = _extract_coordinates(ann)
            writer.writerow(
                [
                    patient,
                    image,
                    label,
                    ann.get("type", "point"),
                    ann.get("status", ""),
                    x,
                    y,
                    json.dumps(ann.get("data", {})),
                    ann.get("timestamp", ""),
                ]
            )

    return output_io.getvalue(), "text/csv", "annotations_export.csv"


def _export_as_xml(all_annotations: Dict[str, Any]) -> Tuple[str, str, str]:
    """Export annotations as XML format."""
    root = ET.Element("annotations")
    root.set("exported", datetime.now().isoformat())

    for img_key, img_data in all_annotations.items():
        image_elem = ET.SubElement(root, "image")
        image_elem.set("patient", img_data["patient"])
        image_elem.set("filename", img_data["image"])

        for label, ann in img_data["annotations"].items():
            ann_elem = ET.SubElement(image_elem, "annotation")
            ann_elem.set("label", label)
            ann_elem.set("type", ann.get("type", "point"))
            ann_elem.set("status", ann.get("status", ""))

            x, y = _extract_coordinates(ann)
            if x or y:
                ET.SubElement(ann_elem, "x").text = x
                ET.SubElement(ann_elem, "y").text = y

            ET.SubElement(ann_elem, "data").text = json.dumps(ann.get("data", {}))

            if ann.get("timestamp"):
                ET.SubElement(ann_elem, "timestamp").text = ann["timestamp"]

    xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    return xml_str, "application/xml", "annotations_export.xml"


EXPORT_FORMATS = {"json": _export_as_json, "csv": _export_as_csv, "xml": _export_as_xml}


@api_bp.route("/export", methods=["POST"])
def export_annotations() -> Response:
    """Export selected annotations as JSON, CSV, or XML file."""
    data = request.json
    export_format = data.get("format", "json")
    selected_images = data.get("images", [])

    if not selected_images:
        return error_response("No images selected")

    if export_format not in EXPORT_FORMATS:
        return error_response("Invalid format")

    all_annotations = {}
    for img_key in selected_images:
        patient, filename = img_key.split("/")
        annotations_data = _load_annotations(patient, filename)

        if annotations_data:
            all_annotations[img_key] = {
                "patient": patient,
                "image": filename,
                "annotations": annotations_data,
            }

    output, mimetype, filename = EXPORT_FORMATS[export_format](all_annotations)

    response = make_response(output)
    response.headers["Content-Type"] = mimetype
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response
