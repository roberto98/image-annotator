# postprocessing_draw_landmarks.py
"""Generate annotated images with landmarks, segments, and figures drawn on them.

This module provides backward compatibility. The implementation has been
refactored into app/visualization/ for better maintainability.
"""

# Re-export from the refactored module
from app.visualization import LandmarkVisualizer
from app.visualization.palettes import LANDMARK_PALETTE, SEGMENT_PALETTE, FIGURE_PALETTE
import config


def get_all_landmark_names():
    """Get all unique landmark names from annotations."""
    return config.get_landmark_names()


def get_all_segment_names():
    """Get all unique segment names from annotations."""
    return config.get_segment_names()


def get_all_figure_names():
    """Get all unique figure names from annotations."""
    return config.get_figure_names()


if __name__ == "__main__":
    LandmarkVisualizer().process_all_images()
