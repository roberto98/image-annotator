# Image Annotator

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/flask-2.3+-green.svg)](https://flask.palletsprojects.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A web-based annotation tool for medical images supporting **landmark points**, **polygon segmentations**, and **geometric figures**. Designed for research workflows requiring precise anatomical annotations on DICOM and standard image formats.

<img width="1105" height="896" alt="image" src="https://github.com/user-attachments/assets/a671a9b5-2694-479d-bde8-4363540ab622" />

## Features

### Annotation Types
- **Landmark Points** - Single-click coordinate annotations for anatomical landmarks
- **Polygon Segmentation** - Multi-point closed regions for tissue/organ boundaries
- **Geometric Figures** - Circles, rectangles, lines, and angle measurements with adjustable size

### Image Support
- **DICOM** (.dcm, .dicom) with automatic windowing and contrast enhancement
- **Standard formats** (PNG, JPEG)
- Automatic grayscale inversion for radiographic modalities (CR, DX, DR, XA)

### User Interface
- Real-time zoom and pan with mouse wheel
- Brightness/contrast adjustment sliders
- Undo/Redo support (Ctrl+Z / Ctrl+Y)
- Color picker for annotation labels
- Keyboard shortcuts for efficient workflow
- Cross-platform support (Windows, macOS, Linux)

<img width="1215" height="905" alt="image" src="https://github.com/user-attachments/assets/2b0ee7e3-ba46-449f-836e-966dbe3006e9" />


### Data Management
- JSON-based annotation storage with auto-discovery of existing labels
- Export to JSON, CSV, or XML formats
- Binary mask generation for polygon segmentations

## Installation

### Prerequisites
- Python 3.8 or higher
- pip package manager

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/roberto98/image-annotator.git
   cd image-annotator
   ```

2. **Create a virtual environment** (recommended)
   ```bash
   python -m venv venv

   # Windows
   venv\Scripts\activate

   # macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Prepare your images**

   Place your images in the `images/` directory, organized by patient/subject:
   ```
   images/
   ├── Patient001/
   │   ├── image001.dcm
   │   ├── image002.dcm
   │   └── ...
   ├── Patient002/
   │   └── ...
   ```

5. **Run the application**
   ```bash
   python start.py --port 8000
   ```

6. **Open in browser**

   Navigate to `http://localhost:8000`

## Usage

### Quick Start

1. Click **"Start Annotating"** on the homepage
2. Select an annotation tool (Point, Polygon, or Figure)
3. Create or select a label from the sidebar
4. Click on the image to place annotations
5. Navigate between images using the toolbar buttons

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Toggle annotation/pan mode |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `+` / `-` | Zoom in/out |
| `R` | Reset view |
| `C` | Toggle center indicators |
| `Enter` | Complete polygon |
| `Escape` | Cancel current operation |
| `Arrow keys` | Fine-tune figure position |

### Annotation Workflow

#### Landmark Points
1. Select **Point Mode** from the toolbar
2. Create or select a label
3. Click on the image to place the point
4. Use "Occluded" button if landmark is not visible

#### Polygon Segmentation
1. Select **Polygon Mode** from the toolbar
2. Create or select a label
3. Click to add vertices around the region
4. Press `Enter` or click "Complete" to close the polygon
5. Drag vertices to adjust the shape

#### Geometric Figures
1. Select **Figure Mode** from the toolbar
2. Choose shape (circle, rectangle, line, or angle)
3. Set the size using the slider
4. Click and drag to place the figure
5. Use resize handles to adjust

## Project Structure

```
image-annotator/
├── app/
│   ├── app.py                    # Flask application factory
│   ├── file_utils.py             # File/folder name sanitization
│   ├── image_manager.py          # Image indexing and navigation
│   ├── blueprints/
│   │   ├── api/
│   │   │   ├── annotations.py    # Annotation CRUD API
│   │   │   ├── export.py         # Export endpoints (JSON/CSV/XML)
│   │   │   └── images.py         # Image serving API
│   │   └── views/
│   │       ├── browse.py         # Image browsing views
│   │       └── main.py           # Main page views
│   ├── imaging/
│   │   ├── dicom.py              # DICOM file loading
│   │   ├── enhancement.py        # Image enhancement filters
│   │   ├── loader.py             # General image loader
│   │   └── windowing.py          # DICOM windowing presets
│   ├── visualization/
│   │   ├── legend.py             # Legend overlay rendering
│   │   ├── palettes.py           # Color palette definitions
│   │   ├── renderers.py          # Per-type annotation renderers
│   │   └── visualizer.py         # Main visualization pipeline
│   ├── static/
│   │   ├── css/                  # Stylesheets (13 files)
│   │   └── js/                   # JavaScript modules (24 files)
│   └── templates/                # HTML templates (7 pages)
├── config.py                     # Configuration and annotation type management
├── polygon_utils.py              # Polygon/mask generation utilities
├── start.py                      # CLI entry point
├── requirements.txt              # Python dependencies
└── LICENSE                       # MIT License
```

## Configuration

Edit `config.py` to customize:

```python
IMAGE_HEIGHT = 600          # Display height for images
IMAGE_DIR = "images"        # Input image directory
ANNOTATION_DIR = "annotations"  # Output annotation directory
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FLASK_SECRET_KEY` | Secret key for Flask sessions | Random (generated each run) |

### CLI Options

All options for `start.py`:

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `localhost` | Host address to bind the server |
| `--port` | `8000` | Port number |
| `--debug` | off | Enable Flask debug mode with auto-reload |
| `--skip-check` | off | Skip filename sanitization on startup |

## Export Formats

### JSON
```json
{
  "Patient001/image001.dcm": {
    "patient": "Patient001",
    "image": "image001.dcm",
    "annotations": {
      "Landmark1": {
        "status": "ok",
        "coordinates": {"x": 256.5, "y": 189.3}
      },
      "Region1": {
        "type": "polygon",
        "status": "ok",
        "points": [{"x": 100, "y": 100}, {"x": 200, "y": 100}]
      }
    }
  }
}
```

### CSV
| Patient | Image | Label | Type | Status | X | Y | Shape | Size | Points |
|---------|-------|-------|------|--------|---|---|-------|------|--------|
| Patient001 | image001.dcm | Landmark1 | landmark | ok | 256.5 | 189.3 | | | |

### XML
```xml
<annotations exported="2025-12-03T10:30:00">
  <image patient="Patient001" filename="image001.dcm">
    <annotation label="Landmark1" type="landmark" status="ok">
      <x>256.5</x>
      <y>189.3</y>
    </annotation>
  </image>
</annotations>
```

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/landmarks/<patient>/<image>` | Get all annotations for an image |
| POST | `/api/landmarks/<patient>/<image>/<name>` | Save/update annotation |
| POST | `/api/landmarks` | Register new landmark label |
| GET | `/api/segments/<patient>/<image>` | Get polygon segments |
| POST | `/api/segments/<patient>/<image>/<name>` | Save polygon |
| POST | `/api/segments` | Register new segment label |
| GET | `/api/figures/<patient>/<image>` | Get figure annotations |
| POST | `/api/figures/<patient>/<image>/<name>` | Save figure |
| POST | `/api/figures` | Register new figure label |
| GET | `/api/mask/<patient>/<image>/<segment>` | Get binary mask PNG |
| POST | `/api/export` | Export annotations |
| GET | `/api/next-unannotated` | Find next image without annotations |
| GET | `/api/image-directory` | Get image directory structure |

## Development

### Running in Debug Mode
```bash
python start.py --debug --port 8000
```

### Code Style
- Python: Type hints and docstrings for all functions
- JavaScript: JSDoc comments for documentation
- CSS: BEM-inspired naming with CSS custom properties (design tokens)

---

## Citation

If you use this tool in your research, please cite it as follows:

```bibtex
@software{image_annotation_tool,
  author    = {Roberto Di Via},
  title     = {Image Annotator: A Web-Based Medical Image Annotation Platform},
  year      = {2026},
  url       = {https://github.com/roberto98/image-annotator},
  version   = {1.0.0}
}
```

### APA (7th edition)

Di Via, R. (2026). *Image Annotator: A web-based medical image annotation platform* (Version 1.0.0) [Computer software]. GitHub. https://github.com/roberto98/image-annotator

---

## Contributing

Contributions are welcome and greatly appreciated! Here are some areas where help is especially valuable:

- **New export formats** — e.g., COCO JSON, Pascal VOC, YOLO
- **Additional annotation tools** — e.g., freehand drawing, ellipse, bounding boxes
- **DICOM improvements** — multi-frame support, metadata display
- **Performance** — large image sets, faster indexing
- **Tests** — expanding the existing JS test suite to Python backend

### How to contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Browse [open issues](https://github.com/roberto98/image-annotator/issues) for ideas or to report bugs.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Flask](https://flask.palletsprojects.com/)
- Image processing with [Pillow](https://pillow.readthedocs.io/) and [NumPy](https://numpy.org/)
- DICOM support via [pydicom](https://pydicom.github.io/)

---

**Made with care for the medical imaging research community**
