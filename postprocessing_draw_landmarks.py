"""Generate annotated images with landmarks, segments, and figures drawn on them."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Image as PILImage
from typing import List, Dict, Tuple, Optional, Any
import config
import logging
import utils

RGBColor = Tuple[int, int, int]
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
    
    # Color palettes for consistent annotation rendering
    LANDMARK_PALETTE: List[RGBColor] = [
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0),
        (255, 0, 255), (0, 255, 255), (128, 0, 0), (0, 128, 0),
        (0, 0, 128), (128, 128, 0), (128, 0, 128), (0, 128, 128),
        (255, 128, 0), (0, 255, 128), (128, 0, 255), (255, 0, 128),
        (192, 192, 192), (128, 128, 128), (255, 165, 0), (0, 128, 255)
    ]
    SEGMENT_PALETTE: List[RGBColor] = [
        (70, 130, 180), (220, 20, 60), (50, 205, 50), (255, 140, 0),
        (138, 43, 226), (0, 139, 139), (205, 92, 92), (60, 179, 113),
        (147, 112, 219), (178, 34, 34), (85, 107, 47), (25, 25, 112),
        (139, 69, 19), (128, 0, 0), (46, 139, 87), (153, 50, 204),
        (255, 99, 71), (0, 100, 0), (72, 61, 139)
    ]
    FIGURE_PALETTE: List[RGBColor] = [
        (121, 80, 242), (255, 87, 51), (76, 201, 240), (245, 166, 35),
        (156, 39, 176), (0, 150, 136), (233, 30, 99), (103, 58, 183),
        (255, 152, 0), (0, 188, 212), (139, 195, 74), (255, 193, 7),
        (96, 125, 139), (205, 220, 57), (63, 81, 181), (244, 67, 54),
        (33, 150, 243), (76, 175, 80), (255, 235, 59)
    ]

    def __init__(self) -> None:
        """Initialize paths and color mappings from existing annotation labels."""
        self.image_dir: Path = Path(config.IMAGE_DIR)
        self.annotation_dir: Path = Path(config.ANNOTATION_DIR)
        self.output_dir: Path = self.annotation_dir / "__images_with_landmarks"
        self.output_dir.mkdir(exist_ok=True, parents=True)
        
        self.landmark_colors: Dict[str, RGBColor] = self._init_colors(get_all_landmark_names(), self.LANDMARK_PALETTE)
        self.segment_colors: Dict[str, RGBColor] = self._init_colors(get_all_segment_names(), self.SEGMENT_PALETTE)
        self.figure_colors: Dict[str, RGBColor] = self._init_colors(get_all_figure_names(), self.FIGURE_PALETTE)

    def _init_colors(self, names: List[str], palette: List[RGBColor]) -> Dict[str, RGBColor]:
        """Map names to colors, cycling through palette if needed."""
        return {name: palette[i % len(palette)] for i, name in enumerate(names)}

    def load_annotations(self, patient: str, image_stem: str) -> Dict[str, Any]:
        """Load JSON annotations for a specific image."""
        annotation_file = self.annotation_dir / patient / f"{image_stem}.json"
        
        if not annotation_file.exists():
            return {}
        
        try:
            with open(annotation_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in {annotation_file}: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error loading annotation file {annotation_file}: {e}")
            return {}

    def validate_coordinates(self, x: float, y: float, width: int, height: int) -> Tuple[float, float]:
        """Clamp coordinates to image bounds."""
        x_valid = max(0, min(float(x), width - 1))
        y_valid = max(0, min(float(y), height - 1))
        return x_valid, y_valid

    def draw_landmarks(self, original_image: PILImage, annotations: Dict[str, Any]) -> PILImage:
        """Draw all annotations on image and add a legend panel."""
        image: PILImage = original_image.copy()
        width: int
        height: int
        width, height = image.size
        draw = ImageDraw.Draw(image)
        
        # Marker size scales with image dimensions for consistent appearance
        base_size = min(width, height)
        marker_radius = max(2, int(base_size * 0.004))
        outline_width = 1
        
        font_size = max(12, int(base_size * 0.015))
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except Exception:
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()
        
        # Separate annotations by type for layered drawing (polygons first, then points on top)
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
                
        # Draw polygon segments first (so landmarks appear on top)
        visible_segments = {}
        for name, data in segments.items():
            try:
                if data.get("status") == "ok" and "points" in data:
                    points_list = data["points"]
                    
                    if len(points_list) < 3:
                        continue
                    
                    polygon_points = []
                    for point in points_list:
                        x, y = float(point.get("x", 0)), float(point.get("y", 0))
                        x_valid, y_valid = self.validate_coordinates(x, y, width, height)
                        polygon_points.extend([x_valid, y_valid])
                    
                    color = self.segment_colors.get(name, (255, 0, 0))
                    
                    # Draw polygon outline only (no fill) for medical image clarity
                    for i in range(len(points_list)):
                        x1, y1 = float(points_list[i].get("x", 0)), float(points_list[i].get("y", 0))
                        x2, y2 = float(points_list[(i + 1) % len(points_list)].get("x", 0)), float(points_list[(i + 1) % len(points_list)].get("y", 0))
                        x1_valid, y1_valid = self.validate_coordinates(x1, y1, width, height)
                        x2_valid, y2_valid = self.validate_coordinates(x2, y2, width, height)
                        draw.line([(x1_valid, y1_valid), (x2_valid, y2_valid)], fill=color, width=3)
                    
                    visible_segments[name] = color
            except Exception as e:
                logger.error(f"Error drawing segment {name}: {e}")
        
        # Draw figures
        visible_figures = {}
        for name, data in figures.items():
            try:
                if data.get("status") == "ok" and "x" in data and "y" in data:
                    x, y = float(data.get("x", 0)), float(data.get("y", 0))
                    size = int(data.get("size", 50))
                    shape = data.get("shape", "circle")
                    x_valid, y_valid = self.validate_coordinates(x, y, width, height)
                    color = self.figure_colors.get(name, (121, 80, 242))
                    
                    if image.mode != 'RGBA':
                        image = image.convert('RGBA')
                        draw = ImageDraw.Draw(image)
                    
                    half_size = size / 2
                    bbox = [
                        x_valid - half_size,
                        y_valid - half_size,
                        x_valid + half_size,
                        y_valid + half_size
                    ]
                    
                    # Draw shape outline (no fill for medical image clarity)
                    if shape == "circle":
                        draw.ellipse(bbox, fill=None, outline=color, width=3)
                    elif shape == "rectangle":
                        draw.rectangle(bbox, fill=None, outline=color, width=3)
                    elif shape == "line":
                        if "startX" in data and "startY" in data and "endX" in data and "endY" in data:
                            start_x = float(data.get("startX", 0))
                            start_y = float(data.get("startY", 0))
                            end_x = float(data.get("endX", 0))
                            end_y = float(data.get("endY", 0))
                            
                            start_x_valid, start_y_valid = self.validate_coordinates(start_x, start_y, width, height)
                            end_x_valid, end_y_valid = self.validate_coordinates(end_x, end_y, width, height)
                            
                            draw.line([(start_x_valid, start_y_valid), (end_x_valid, end_y_valid)], fill=color, width=3)
                            
                            # Endpoint markers
                            point_radius = max(2, int(base_size * 0.002))
                            draw.ellipse(
                                (start_x_valid - point_radius, start_y_valid - point_radius, 
                                 start_x_valid + point_radius, start_y_valid + point_radius),
                                fill=color, outline=(0, 0, 0), width=1
                            )
                            draw.ellipse(
                                (end_x_valid - point_radius, end_y_valid - point_radius, 
                                 end_x_valid + point_radius, end_y_valid + point_radius),
                                fill=color, outline=(0, 0, 0), width=1
                            )
                            
                            # Label at line center
                            text_x = (start_x_valid + end_x_valid) / 2 + 5
                            text_y = (start_y_valid + end_y_valid) / 2 - font_size // 2
                        else:
                            # Fallback: horizontal line from center point
                            half_size = size / 2
                            start_x_line = x_valid - half_size
                            end_x_line = x_valid + half_size
                            draw.line([(start_x_line, y_valid), (end_x_line, y_valid)], fill=color, width=3)
                            
                            text_x = x_valid + half_size + 5
                            text_y = y_valid - font_size // 2
                    else:
                        draw.rectangle(bbox, fill=None, outline=color, width=3)
                    
                    # Position text label
                    if shape != "line":
                        text_x = x_valid + half_size + 5
                        text_y = y_valid - font_size // 2
                    
                    # Keep text within image bounds
                    if text_x + 100 > width:
                        text_x = x_valid - half_size - 100
                    if text_y < 0:
                        text_y = y_valid + half_size + 5
                    
                    # Semi-transparent text background for readability
                    try:
                        text_width, text_height = draw.textsize(name, font=font) if hasattr(draw, 'textsize') else (len(name) * font_size // 2, font_size)
                    except Exception:
                        text_width, text_height = (len(name) * font_size // 2, font_size)
                    
                    overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
                    overlay_draw = ImageDraw.Draw(overlay)
                    overlay_draw.rectangle(
                        (text_x - 2, text_y - 2, text_x + text_width + 2, text_y + text_height + 2),
                        fill=(0, 0, 0, 128)
                    )
                    
                    image = Image.alpha_composite(image, overlay)
                    draw = ImageDraw.Draw(image)
                    
                    # Draw text
                    draw.text((text_x, text_y), name, fill=(255, 255, 255), font=font)
                    
                    # Add to visible figures
                    visible_figures[name] = (color, shape)
            except Exception as e:
                logger.error(f"Error drawing figure {name}: {e}")
        
        # Draw landmark points
        visible_landmarks = {}
        invalid_landmarks = []
        
        for name, data in landmarks.items():
            try:
                if data.get("status") == "occluded/missing":
                    continue
                
                if "coordinates" not in data:
                    continue
                
                coords = data.get("coordinates", {})
                if not coords or "x" not in coords or "y" not in coords:
                    continue
                
                x_orig, y_orig = float(coords.get("x", 0)), float(coords.get("y", 0))
                
                if not (0 <= x_orig < width and 0 <= y_orig < height):
                    invalid_landmarks.append((name, x_orig, y_orig))
                
                x, y = self.validate_coordinates(x_orig, y_orig, width, height)
                color = self.landmark_colors.get(name, (255, 0, 0))
                
                draw.ellipse(
                    (x - marker_radius, y - marker_radius, x + marker_radius, y + marker_radius),
                    fill=color,
                    outline=(0, 0, 0),
                    width=outline_width
                )
                
                text_x = x + marker_radius + 5
                text_y = y - font_size // 2
                
                # Keep text within image bounds
                if text_x + 100 > width:
                    text_x = x - marker_radius - 100
                if text_y < 0:
                    text_y = y + marker_radius + 5
                
                # Semi-transparent text background for readability
                try:
                    text_width, text_height = draw.textsize(name, font=font) if hasattr(draw, 'textsize') else (len(name) * font_size // 2, font_size)
                except Exception:
                    text_width, text_height = (len(name) * font_size // 2, font_size)
                
                if image.mode != 'RGBA':
                    image = image.convert('RGBA')
                    draw = ImageDraw.Draw(image)
                
                overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
                overlay_draw = ImageDraw.Draw(overlay)
                overlay_draw.rectangle(
                    (text_x - 2, text_y - 2, text_x + text_width + 2, text_y + text_height + 2),
                    fill=(0, 0, 0, 128)
                )
                
                image = Image.alpha_composite(image, overlay)
                draw = ImageDraw.Draw(image)
                draw.text((text_x, text_y), name, fill=(255, 255, 255), font=font)
                visible_landmarks[name] = color
            except Exception as e:
                logger.error(f"Error drawing landmark {name}: {e}")
        
        # Create output image with legend panel
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        
        # Create a new wider image to accommodate the legend
        legend_width = 300
        new_img = Image.new('RGB', (width + legend_width, height), (255, 255, 255))
        new_img.paste(image, (0, 0))
        
        # Draw the legend on the right
        legend_draw = ImageDraw.Draw(new_img)
        
        # Legend title
        legend_x = width + 20
        current_y = 30
        legend_draw.text((legend_x, current_y), "LEGEND", fill=(0, 0, 0), font=font)
        current_y += font_size * 1.5
        
        # Draw segment legends first (if any)
        if visible_segments:
            legend_draw.text((legend_x, current_y), "SEGMENTS", fill=(80, 80, 80), font=font)
            current_y += font_size * 1.2
            
            # Draw a legend item for each visible segment
            square_size = font_size
            for name, color in visible_segments.items():
                # Draw a colored square with alpha for segments
                legend_draw.rectangle(
                    (legend_x, current_y, legend_x + square_size, current_y + square_size),
                    fill=color,
                    outline=(0, 0, 0),
                    width=1
                )
                
                # Write the segment name
                legend_draw.text(
                    (legend_x + square_size + 10, current_y + square_size // 4),
                    name,
                    fill=(0, 0, 0),
                    font=font
                )
                
                # Move down for the next item
                current_y += square_size * 1.5
                
            # Add some spacing between segments and landmarks
            current_y += font_size * 0.5
        
        # Figure legends
        if visible_figures:
            legend_draw.text((legend_x, current_y), "FIGURES", fill=(80, 80, 80), font=font)
            current_y += font_size * 1.2
            
            square_size = font_size
            for name, (color, shape) in visible_figures.items():
                if shape == "circle":
                    legend_draw.ellipse(
                        (legend_x, current_y, legend_x + square_size, current_y + square_size),
                        fill=color, outline=(0, 0, 0), width=1
                    )
                elif shape == "line":
                    legend_draw.line(
                        [(legend_x, current_y + square_size // 2), 
                         (legend_x + square_size, current_y + square_size // 2)],
                        fill=color, width=3
                    )
                    point_radius = 2
                    legend_draw.ellipse(
                        (legend_x - point_radius, current_y + square_size // 2 - point_radius,
                         legend_x + point_radius, current_y + square_size // 2 + point_radius),
                        fill=color, outline=(0, 0, 0), width=1
                    )
                    legend_draw.ellipse(
                        (legend_x + square_size - point_radius, current_y + square_size // 2 - point_radius,
                         legend_x + square_size + point_radius, current_y + square_size // 2 + point_radius),
                        fill=color, outline=(0, 0, 0), width=1
                    )
                else:
                    legend_draw.rectangle(
                        (legend_x, current_y, legend_x + square_size, current_y + square_size),
                        fill=color, outline=(0, 0, 0), width=1
                    )
                
                legend_draw.text(
                    (legend_x + square_size + 10, current_y + square_size // 4),
                    name, fill=(0, 0, 0), font=font
                )
                current_y += square_size * 1.5
            current_y += font_size * 0.5
        
        # Point legends
        if visible_landmarks:
            legend_draw.text((legend_x, current_y), "POINTS", fill=(80, 80, 80), font=font)
            current_y += font_size * 1.2
            
            # Draw an element for each visible landmark
            square_size = font_size
            for name, color in visible_landmarks.items():
                # Draw a colored square
                legend_draw.rectangle(
                    (legend_x, current_y, legend_x + square_size, current_y + square_size),
                    fill=color,
                    outline=(0, 0, 0),
                    width=1
                )
                
                # Write the landmark name
                legend_draw.text(
                    (legend_x + square_size + 10, current_y + square_size // 4),
                    name,
                    fill=(0, 0, 0),
                    font=font
                )
                
                # Move down for the next element
                current_y += square_size * 1.5
        
        # If there are no visible landmarks, segments, or figures, show a message
        if not visible_landmarks and not visible_segments and not visible_figures:
            legend_draw.text((legend_x, current_y), "No annotations visible", fill=(100, 100, 100), font=font)
        
        return new_img

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