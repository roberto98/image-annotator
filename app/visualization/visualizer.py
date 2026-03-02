# visualization/visualizer.py
"""Main visualizer class orchestrating annotation rendering."""

from pathlib import Path
import json
from PIL import Image, ImageDraw
from PIL.Image import Image as PILImage
from typing import Dict, Any, Optional, Tuple
import logging

import config
from app.imaging import load_image, is_dicom_file
from app.visualization.palettes import (
    LANDMARK_PALETTE, SEGMENT_PALETTE, FIGURE_PALETTE, init_colors, RGBColor
)
from app.visualization.renderers import get_font, draw_annotation
from app.visualization.legend import create_legend_panel

logger = logging.getLogger(__name__)

# Occluded annotations are intentionally hidden — don't render them
_SKIP_STATUS = "occluded"


class LandmarkVisualizer:
    """Draws annotations on medical images and generates output with legends."""

    def __init__(self) -> None:
        self.image_dir: Path = Path(config.IMAGE_DIR)
        self.annotation_dir: Path = Path(config.ANNOTATION_DIR)
        self.output_dir: Path = self.annotation_dir / "__images_with_landmarks"
        self.output_dir.mkdir(exist_ok=True, parents=True)

        self.landmark_colors: Dict[str, RGBColor] = init_colors(config.get_landmark_names(), LANDMARK_PALETTE)
        self.segment_colors: Dict[str, RGBColor] = init_colors(config.get_segment_names(), SEGMENT_PALETTE)
        self.figure_colors: Dict[str, RGBColor] = init_colors(config.get_figure_names(), FIGURE_PALETTE)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_color(self, name: str, ann: Dict[str, Any]) -> RGBColor:
        """Return RGB color: prefer the annotation's stored hex color, fall back to palette."""
        hex_color = ann.get("color", "")
        if hex_color and len(hex_color) == 7 and hex_color.startswith("#"):
            try:
                return (
                    int(hex_color[1:3], 16),
                    int(hex_color[3:5], 16),
                    int(hex_color[5:7], 16),
                )
            except ValueError:
                pass
        ann_type = ann.get("type", "")
        if ann_type == "point":
            return self.landmark_colors.get(name, (255, 80, 80))
        if ann_type == "polygon":
            return self.segment_colors.get(name, (80, 200, 80))
        return self.figure_colors.get(name, (121, 80, 242))

    def load_annotations(self, patient: str, image_stem: str) -> Dict[str, Any]:
        """Load annotation document for a specific image, or empty dict on failure."""
        annotation_file = self.annotation_dir / patient / f"{image_stem}_annotations.json"
        logger.debug("[Visualizer] Looking for: %s (exists=%s)", annotation_file, annotation_file.exists())
        if not annotation_file.exists():
            return {}
        try:
            return json.loads(annotation_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.error("[Visualizer] Error loading %s: %s", annotation_file, e)
            return {}

    def find_image_file(self, patient: str, image_stem: str) -> Optional[Path]:
        """Find the image file for a given stem across supported formats."""
        for ext in (".png", ".jpg", ".jpeg", ".dcm", ".dicom"):
            img_path = self.image_dir / patient / (image_stem + ext)
            if img_path.exists():
                return img_path
        logger.debug("[Visualizer] No image found for patient=%s stem=%s", patient, image_stem)
        return None

    def _convert_to_rgb(self, img: PILImage) -> PILImage:
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            return bg
        if img.mode != "RGB":
            return img.convert("RGB")
        return img

    # ------------------------------------------------------------------
    # Core rendering
    # ------------------------------------------------------------------

    def render_annotations(
        self, original_image: PILImage, annotations: Dict[str, Any]
    ) -> PILImage:
        """Draw all annotations on a copy of the image and return with a legend panel.

        Args:
            annotations: Inner annotations dict keyed by label name, each value
                having the API format {type, status, data: {...}, color?}.
        """
        image: PILImage = original_image.copy()
        width, height = image.size
        base_size = min(width, height)
        marker_radius = max(2, int(base_size * 0.004))
        font = get_font(base_size)
        draw = ImageDraw.Draw(image)

        # visible_annotations: name → (color, ann_type)  — populated as we draw
        visible: Dict[str, Tuple[RGBColor, str]] = {}

        # Draw polygons first, then other shapes, then points on top
        draw_order = ["polygon", "line", "circle", "rectangle", "angle", "point"]
        by_type: Dict[str, list] = {t: [] for t in draw_order}
        for name, ann in annotations.items():
            if not isinstance(ann, dict):
                continue
            if ann.get("status") == _SKIP_STATUS:
                continue
            by_type.setdefault(ann.get("type", ""), []).append((name, ann))

        for ann_type in draw_order:
            for name, ann in by_type.get(ann_type, []):
                color = self._resolve_color(name, ann)
                data = ann.get("data") or {}
                try:
                    image, draw, was_drawn = draw_annotation(
                        image, draw, name, ann_type, data,
                        color, font, marker_radius, base_size,
                    )
                    if was_drawn:
                        visible[name] = (color, ann_type)
                except Exception as e:
                    logger.error("[Visualizer] Error drawing %r (%s): %s", name, ann_type, e)

        logger.debug("[Visualizer] Drew %d/%d annotations", len(visible), len(annotations))
        return create_legend_panel(image, visible, font)

    # ------------------------------------------------------------------
    # Batch processing
    # ------------------------------------------------------------------

    def process_all_images(self) -> None:
        """Generate annotated images for all annotation files found in annotation_dir."""
        error_count = 0
        processed = 0

        all_json_files = []
        for patient_dir in self.annotation_dir.iterdir():
            if not patient_dir.is_dir() or patient_dir.name.startswith("__"):
                continue
            for json_file in patient_dir.glob("*_annotations.json"):
                all_json_files.append((patient_dir.name, json_file))

        logger.info("[Visualizer] Found %d annotation files to process", len(all_json_files))

        for patient, json_file in all_json_files:
            try:
                image_stem = json_file.stem.removesuffix("_annotations")
                image_path = self.find_image_file(patient, image_stem)

                if not image_path:
                    logger.warning("[Visualizer] No image for %s / %s — skipping", patient, image_stem)
                    continue

                doc = self.load_annotations(patient, image_stem)
                annotations = doc.get("annotations", {}) if doc else {}
                if not annotations:
                    logger.info("[Visualizer] No annotations in %s — skipping", json_file.name)
                    continue

                logger.info("[Visualizer] Processing %s / %s (%d annotations)",
                            patient, image_stem, len(annotations))

                output_patient = self.output_dir / patient
                output_patient.mkdir(exist_ok=True, parents=True)

                try:
                    if is_dicom_file(image_path):
                        img = load_image(image_path, force_invert_dicom=True)
                    else:
                        img = Image.open(image_path)

                    img = self._convert_to_rgb(img)
                    output_img = self.render_annotations(img, annotations)

                    if is_dicom_file(image_path):
                        output_path = output_patient / (image_path.stem + ".png")
                    else:
                        output_path = output_patient / image_path.name

                    output_img.save(output_path)
                    processed += 1
                    logger.info("[Visualizer] Saved %s", output_path)

                except Exception as e:
                    error_count += 1
                    logger.error("[Visualizer] Error processing %s: %s", image_path, e, exc_info=True)

            except Exception as e:
                error_count += 1
                logger.error("[Visualizer] Error processing %s: %s", json_file, e, exc_info=True)

        logger.info("[Visualizer] Done: %d generated, %d errors", processed, error_count)


if __name__ == "__main__":
    LandmarkVisualizer().process_all_images()
