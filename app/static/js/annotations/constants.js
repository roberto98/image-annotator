/**
 * Shared Constants for Annotation System
 * @module annotations/constants
 * 
 * Centralizes magic numbers and configuration values used across
 * drawing, editing, and rendering modules.
 */

// ============================================================================
// Debug Utility
// ============================================================================

/**
 * Debug utility for conditional logging
 * Enable via: localStorage.setItem('debug', 'true') or window.__DEBUG__ = true
 */
const Debug = {
    /** Whether debug mode is enabled */
    get enabled() {
        return window.__DEBUG__ || localStorage.getItem('debug') === 'true';
    },
    
    /**
     * Log a debug message
     * @param {string} module - Module name
     * @param {...any} args - Arguments to log
     */
    log(module, ...args) {
        if (this.enabled) {
            console.log(`[${module}]`, ...args);
        }
    },
    
    /**
     * Log a warning message
     * @param {string} module - Module name
     * @param {...any} args - Arguments to log
     */
    warn(module, ...args) {
        if (this.enabled) {
            console.warn(`[${module}]`, ...args);
        }
    },
    
    /**
     * Log an error (always shown, not conditional)
     * @param {string} module - Module name
     * @param {...any} args - Arguments to log
     */
    error(module, ...args) {
        console.error(`[${module}]`, ...args);
    },
    
    /**
     * Enable debug mode
     */
    enable() {
        localStorage.setItem('debug', 'true');
        console.log('[Debug] Debug mode enabled');
    },
    
    /**
     * Disable debug mode
     */
    disable() {
        localStorage.removeItem('debug');
        console.log('[Debug] Debug mode disabled');
    }
};

// ============================================================================
// Drawing Constants
// ============================================================================

/**
 * Constants for drawing operations
 */
const DrawingConstants = {
    /** Double-click time threshold in milliseconds */
    DOUBLE_CLICK_THRESHOLD: 300,

    /** Double-click distance threshold in pixels */
    DOUBLE_CLICK_DISTANCE: 10
};

// ============================================================================
// Editing Constants
// ============================================================================

/**
 * Constants for editing operations
 */
const EditingConstants = {
    /** Minimum radius for circles in pixels */
    MIN_CIRCLE_RADIUS: 5,
    
    /** Minimum dimension for rectangles in pixels */
    MIN_RECTANGLE_SIZE: 10,
    
    /** Arrow key step size (normal) */
    ARROW_STEP_NORMAL: 1,
    
    /** Arrow key step size (with Shift) */
    ARROW_STEP_SHIFT: 10,
    
    /** Arrow key step size (with Ctrl) */
    ARROW_STEP_CTRL: 0.5,
    
    /** Touch drag threshold in pixels */
    TOUCH_DRAG_THRESHOLD: 5,
    
    /** Debounce time for arrow key saves in milliseconds */
    ARROW_SAVE_DEBOUNCE: 300
};

// ============================================================================
// Renderer Constants
// ============================================================================

/**
 * Constants for rendering
 */
const RendererConstants = {
    /** Default stroke width for annotations */
    STROKE_WIDTH: 2,
    
    /** Stroke width for selected annotations */
    SELECTED_STROKE_WIDTH: 3,
    
    /** Point marker radius */
    POINT_RADIUS: 6,
    
    /** Interactive handle radius */
    HANDLE_RADIUS: 5,
    
    /** Fill opacity for shapes */
    FILL_OPACITY: 0.2,
    
    /** Fill opacity for selected shapes */
    SELECTED_FILL_OPACITY: 0.3,
    
    /** Offset for measurement text placement */
    MEASUREMENT_OFFSET: 15,
    
    /** Radius for angle arc display */
    ARC_RADIUS: 30,
    
    /** Endpoint marker radius for lines */
    LINE_ENDPOINT_RADIUS: 4,
    
    /** Center marker radius for circles */
    CIRCLE_CENTER_RADIUS: 3,
    
    /** Corner marker radius for rectangles */
    RECTANGLE_CORNER_RADIUS: 3,
    
    /** Vertex marker radius for angles */
    ANGLE_VERTEX_RADIUS: 4,
    
    /** Endpoint marker radius for angles */
    ANGLE_ENDPOINT_RADIUS: 3,
    
    /** Vertex marker radius for polygons */
    POLYGON_VERTEX_RADIUS: 3
};

// ============================================================================
// Default Colors
// ============================================================================

/**
 * Default colors for annotation types
 */
const DefaultColors = {
    point: '#ff0000',
    line: '#0066ff',
    circle: '#ffaa00',
    rectangle: '#9933ff',
    angle: '#00cccc',
    polygon: '#00cc66',
    preview: '#666666',
    fallback: '#ff0000'
};

// ============================================================================
// Measurement Units
// ============================================================================

/**
 * Measurement formatting options
 */
const MeasurementDefaults = {
    /** Decimal places for pixel values */
    PIXEL_DECIMALS: 1,
    
    /** Decimal places for millimeter values */
    MM_DECIMALS: 2,
    
    /** Decimal places for angle values */
    ANGLE_DECIMALS: 1,
    
    /** Decimal places for coordinate display */
    COORDINATE_DECIMALS: 0
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.Debug = Debug;
    window.DrawingConstants = DrawingConstants;
    window.EditingConstants = EditingConstants;
    window.RendererConstants = RendererConstants;
    window.DefaultColors = DefaultColors;
    window.MeasurementDefaults = MeasurementDefaults;
    
    // Convenience: also expose constants under a unified namespace
    window.AnnotationConstants = {
        Debug,
        Drawing: DrawingConstants,
        Editing: EditingConstants,
        Renderer: RendererConstants,
        Colors: DefaultColors,
        Measurement: MeasurementDefaults
    };
}
