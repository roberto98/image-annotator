# visualization/visualizer.py
"""Main visualizer class orchestrating annotation rendering."""

from pathlib import Path
import json
from PIL import Image, ImageDraw
from PIL.Image import Image as PILImage
from typing import Dict, Any, Optional, List
import logging

import config
import utils
from app.visualization.palettes import (
    LANDMARK_PALETTE, SEGMENT_PALETTE, FIGURE_PALETTE, init_colors, RGBColor
)
from app.visualization.renderers import (
    get_font, draw_landmarks, draw_segments, draw_figures
)
from app.visualization.legend import create_legend_panel

logger = logging.getLogger(__name__)


def get_all_landmark_names() -> List[str]:
    """Get all unique landmark names from annotations."""
    return config.get_landmark_names()


def get_all_segment_names() -> List[str]:
    """Get all unique segment names from annotations."""
    return config.get_segment_names()


def get_all_figure_names() -> List[str]:
    """Get all unique figure names from annotations."""
    return config.get_figure_names()


class LandmarkVisualizer:
    """Draws annotations on medical images and generates output with legends."""

    # Expose palettes for backward compatibility
    LANDMARK_PALETTE = LANDMARK_PALETTE
    SEGMENT_PALETTE = SEGMENT_PALETTE
    FIGURE_PALETTE = FIGURE_PALETTE

    def __init__(self) -> None:
        """Initialize paths and color mappings from existing annotation labels."""
        self.image_dir: Path = Path(config.IMAGE_DIR)
        self.annotation_dir: Path = Path(config.ANNOTATION_DIR)
        self.output_dir: Path = self.annotation_dir / "__images_with_landmarks"
        self.output_dir.mkdir(exist_ok=True, parents=True)

        self.landmark_colors: Dict[str, RGBColor] = init_colors(get_all_landmark_names(), LANDMARK_PALETTE)
        self.segment_colors: Dict[str, RGBColor] = init_colors(get_all_segment_names(), SEGMENT_PALETTE)
        self.figure_colors: Dict[str, RGBColor] = init_colors(get_all_figure_names(), FIGURE_PALETTE)

    def load_annotations(self, patient: str, image_stem: str) -> Dict[str, Any]:
        """Load JSON annotations for a specific image."""
        annotation_file = self.annotation_dir / patient / f"{image_stem}.json"

        if not annotation_file.exists():
            return {}

        try:
            with open(annotation_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in {annotation_file}: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error loading annotation file {annotation_file}: {e}")
            return {}

    def draw_landmarks(self, original_image: PILImage, annotations: Dict[str, Any]) -> PILImage:
        """Draw all annotations on image and add a legend panel."""
        image: PILImage = original_image.copy()
        width, height = image.size
        draw = ImageDraw.Draw(image)

        # Calculate sizes based on image dimensions
        base_size = min(width, height)
        marker_radius = max(2, int(base_size * 0.004))
        font = get_font(base_size)

        # Separate annotations by type
        landmarks = {}
        segments = {}
        figures = {}

        for name, data in annotations.items():
            if data.get("type") == "polygon":
                segments[name] = data
            elif data.get("type") == "figure":
                figures[name] = data
            else:
                landmarks[name] = data

        # Draw in order: polygons first, then figures, then landmarks (on top)
        image, draw, visible_segments = draw_segments(
            image, draw, segments, self.segment_colors
        )

        image, draw, visible_figures = draw_figures(
            image, draw, figures, self.figure_colors, font, base_size
        )

        image, draw, visible_landmarks = draw_landmarks(
            image, draw, landmarks, self.landmark_colors, font, marker_radius
        )

        # Create output image with legend
        return create_legend_panel(
            image, visible_landmarks, visible_segments, visible_figures, font
        )

    def find_image_file(self, patient: str, image_stem: str) -> Optional[Path]:
        """Find the image file corresponding to a given stem in various formats."""
        for ext in [".png", ".jpg", ".jpeg", ".dcm", ".dicom"]:
            img_path = self.image_dir / patient / (image_stem + ext)
            if img_path.exists():
                return img_path
        return None

    def process_all_images(self) -> None:
        """Generate annotated images for all annotation files."""
        processed_count: int = 0
        error_count: int = 0

        all_json_files = []
        for patient_dir in self.annotation_dir.iterdir():
            if not patient_dir.is_dir() or patient_dir.name.startswith("__"):
                continue

            patient_jsons = list(patient_dir.glob("*.json"))
            all_json_files.extend([(patient_dir.name, json_file) for json_file in patient_jsons])

        for patient, json_file in all_json_files:
            try:
                image_stem = json_file.stem
                image_path = self.find_image_file(patient, image_stem)

                if not image_path:
                    continue

                annotations = self.load_annotations(patient, image_stem)
                if not annotations:
                    continue

                output_patient = self.output_dir / patient
                output_patient.mkdir(exist_ok=True, parents=True)

                try:
                    if utils.is_dicom_file(image_path):
                        img = utils.load_image(image_path, force_invert_dicom=True)
                    else:
                        img = Image.open(image_path)

                    if img.mode == 'RGBA':
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        background.paste(img, mask=img.split()[3])
                        img = background
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')

                    output_img = self.draw_landmarks(img, annotations)

                    # DICOM -> PNG since DICOM is read-only medical format
                    if utils.is_dicom_file(image_path):
                        output_path = output_patient / (image_path.stem + '.png')
                    else:
                        output_path = output_patient / image_path.name

                    output_img.save(output_path)
                    processed_count += 1

                except Exception as e:
                    error_count += 1
                    logger.error(f"Error processing image {image_path}: {e}")

            except Exception as e:
                error_count += 1
                logger.error(f"Error processing annotation {json_file}: {e}")

        if error_count > 0:
            logger.error(f"Finished processing with {error_count} errors")


if __name__ == "__main__":
    LandmarkVisualizer().process_all_images()
