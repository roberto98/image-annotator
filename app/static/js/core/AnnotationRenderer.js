/**
 * AnnotationRenderer - SVG-based annotation rendering with viewport synchronization
 * 
 * This module manages an SVG overlay that renders annotations in image coordinates.
 * The SVG transform is automatically synced with the viewport (pan/zoom) state,
 * so annotations maintain their positions in image space during navigation.
 * 
 * Key features:
 * - SVG overlay positioned over the image container
 * - Viewport transform synchronization via matrix transform
 * - Annotations drawn in image coordinates (not screen coordinates)
 * - Support for all annotation types: point, line, circle, rectangle, polygon, freehand, angle
 * - Selection and hover state management
 * - Measurement label rendering
 * 
 * @module core/AnnotationRenderer
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate in image space
 * @property {number} y - Y coordinate in image space
 */

/**
 * @typedef {Object} AnnotationData
 * @property {string} type - Annotation type (point, line, circle, rectangle, polygon, freehand, angle)
 * @property {Object} data - Type-specific annotation data
 * @property {string} [color] - Optional color override
 * @property {string} [status] - Annotation status
 */

/**
 * @typedef {Object} RendererConfig
 * @property {number} strokeWidth - Default stroke width
 * @property {number} selectedStrokeWidth - Stroke width for selected annotations
 * @property {number} pointRadius - Radius for point markers
 * @property {number} handleRadius - Radius for edit handles
 * @property {number} fillOpacity - Fill opacity for shapes
 * @property {number} selectedFillOpacity - Fill opacity for selected shapes
 * @property {number} measurementOffset - Offset for measurement labels
 * @property {number} arcRadius - Radius for angle arcs
 * @property {boolean} showMeasurements - Whether to show measurements
 * @property {boolean} showHandles - Whether to show edit handles
 * @property {boolean} showLabels - Whether to show annotation labels
 */

// ============================================================================
// SVG Namespace
// ============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================================================
// AnnotationRenderer Class
// ============================================================================

class AnnotationRenderer {
    /**
     * Create an annotation renderer
     */
    constructor() {
        /** @type {HTMLElement|null} Container element */
        this._container = null;
        
        /** @type {SVGSVGElement|null} Main SVG element */
        this._svg = null;
        
        /** @type {SVGGElement|null} Transform group (applies viewport transform) */
        this._transformGroup = null;
        
        /** @type {SVGDefsElement|null} SVG defs for markers and patterns */
        this._defs = null;
        
        /** @type {HTMLElement|null} HTML layer for measurement labels */
        this._labelLayer = null;
        
        /** @type {Viewport|null} Reference to viewport */
        this._viewport = null;
        
        /** @type {number|null} Viewport subscription ID */
        this._viewportSubscription = null;
        
        /** @type {string|null} Currently selected annotation ID */
        this._selectedId = null;
        
        /** @type {string|null} Currently hovered annotation ID */
        this._hoveredId = null;
        
        /** @type {RendererConfig} Renderer configuration */
        this._config = this._getDefaultConfig();
        
        /** @type {number} Image width for coordinate calculations */
        this._imageWidth = 0;
        
        /** @type {number} Image height for coordinate calculations */
        this._imageHeight = 0;
    }
    
    // ========================================================================
    // Configuration
    // ========================================================================
    
    /**
     * Get default configuration from constants or fallbacks
     * @returns {RendererConfig}
     * @private
     */
    _getDefaultConfig() {
        const RC = window.RendererConstants || {};
        return {
            strokeWidth: RC.STROKE_WIDTH ?? 2,
            selectedStrokeWidth: RC.SELECTED_STROKE_WIDTH ?? 3,
            pointRadius: RC.POINT_RADIUS ?? 6,
            handleRadius: RC.HANDLE_RADIUS ?? 5,
            fillOpacity: RC.FILL_OPACITY ?? 0.2,
            selectedFillOpacity: RC.SELECTED_FILL_OPACITY ?? 0.3,
            measurementOffset: RC.MEASUREMENT_OFFSET ?? 15,
            arcRadius: RC.ARC_RADIUS ?? 30,
            showMeasurements: true,
            showHandles: true,
            showLabels: true
        };
    }
    
    /**
     * Update configuration
     * @param {Partial<RendererConfig>} options - Configuration options to update
     */
    configure(options) {
        this._config = { ...this._config, ...options };
    }
    
    /**
     * Get the current viewport scale (with fallback)
     * @returns {number} Current scale factor
     * @private
     */
    get _currentScale() {
        return this._viewport?.scale || 1;
    }
    
    // ========================================================================
    // Initialization
    // ========================================================================
    
    /**
     * Initialize the renderer
     * @param {HTMLElement} container - Container element to render into
     * @param {Viewport} [viewport] - Viewport instance (uses global if not provided)
     * @param {Object} [options] - Configuration options
     */
    init(container, viewport = null, options = {}) {
        if (!container) {
            console.error('[AnnotationRenderer] Container element required');
            return;
        }
        
        this._container = container;
        this._viewport = viewport || window.viewport;
        this._config = { ...this._config, ...options };
        
        // Create SVG structure
        this._createSVG();
        this._createDefs();
        this._createLabelLayer();
        
        // Subscribe to viewport changes
        this._subscribeToViewport();
        
        // Initial transform sync
        this._syncTransform();
        
        window.Debug?.log('AnnotationRenderer', 'Initialized');
    }
    
    /**
     * Set image dimensions (needed for proper coordinate transformations)
     * @param {number} width - Image width in pixels
     * @param {number} height - Image height in pixels
     */
    setImageSize(width, height) {
        this._imageWidth = width;
        this._imageHeight = height;
        this._syncTransform();
    }
    
    /**
     * Create the main SVG element
     * @private
     */
    _createSVG() {
        // Remove existing SVG if present
        if (this._svg) {
            this._svg.remove();
        }
        
        // Create SVG element
        this._svg = document.createElementNS(SVG_NS, 'svg');
        this._svg.classList.add('annotation-svg-layer', 'annotation-renderer');
        this._svg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: visible;
            z-index: 10;
        `;
        
        // Create transform group - this is where the viewport transform is applied
        this._transformGroup = document.createElementNS(SVG_NS, 'g');
        this._transformGroup.classList.add('annotation-transform-group');
        this._svg.appendChild(this._transformGroup);
        
        this._container.appendChild(this._svg);
    }
    
    /**
     * Create SVG defs for markers and patterns
     * @private
     */
    _createDefs() {
        this._defs = document.createElementNS(SVG_NS, 'defs');
        
        // Arrow marker for angle arcs
        const arrowMarker = document.createElementNS(SVG_NS, 'marker');
        arrowMarker.setAttribute('id', 'annotation-arrow-marker');
        arrowMarker.setAttribute('markerWidth', '10');
        arrowMarker.setAttribute('markerHeight', '10');
        arrowMarker.setAttribute('refX', '5');
        arrowMarker.setAttribute('refY', '5');
        arrowMarker.setAttribute('orient', 'auto');
        
        const arrowPath = document.createElementNS(SVG_NS, 'path');
        arrowPath.setAttribute('d', 'M0,0 L10,5 L0,10 z');
        arrowPath.setAttribute('fill', 'currentColor');
        arrowMarker.appendChild(arrowPath);
        this._defs.appendChild(arrowMarker);
        
        this._svg.insertBefore(this._defs, this._transformGroup);
    }
    
    /**
     * Create HTML layer for measurement labels
     * @private
     */
    _createLabelLayer() {
        // Remove existing layer if present
        if (this._labelLayer) {
            this._labelLayer.remove();
        }
        
        this._labelLayer = document.createElement('div');
        this._labelLayer.className = 'annotation-measurements-layer annotation-label-layer';
        this._labelLayer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 11;
        `;
        
        this._container.appendChild(this._labelLayer);
    }
    
    /**
     * Subscribe to viewport changes
     * @private
     */
    _subscribeToViewport() {
        if (!this._viewport) return;
        
        // Unsubscribe from previous subscription
        if (this._viewportSubscription !== null) {
            this._viewport.unsubscribe(this._viewportSubscription);
        }
        
        // Subscribe to viewport changes
        this._viewportSubscription = this._viewport.subscribe((property, newState, oldState) => {
            this._syncTransform();
        });
    }
    
    /**
     * Sync SVG transform with viewport state
     * @private
     */
    _syncTransform() {
        if (!this._transformGroup || !this._viewport) return;
        
        const scale = this._viewport.scale;
        const offsetX = this._viewport.offsetX;
        const offsetY = this._viewport.offsetY;
        
        // Apply transform matrix: matrix(a, b, c, d, e, f)
        // where a=scale, d=scale, e=translateX, f=translateY
        // This transforms image coordinates to screen coordinates
        const transform = `matrix(${scale}, 0, 0, ${scale}, ${offsetX}, ${offsetY})`;
        this._transformGroup.setAttribute('transform', transform);
    }
    
    // ========================================================================
    // Cleanup
    // ========================================================================
    
    /**
     * Destroy the renderer and clean up resources
     */
    destroy() {
        // Unsubscribe from viewport
        if (this._viewport && this._viewportSubscription !== null) {
            this._viewport.unsubscribe(this._viewportSubscription);
            this._viewportSubscription = null;
        }
        
        // Remove DOM elements
        if (this._svg) {
            this._svg.remove();
            this._svg = null;
        }
        
        if (this._labelLayer) {
            this._labelLayer.remove();
            this._labelLayer = null;
        }
        
        this._container = null;
        this._transformGroup = null;
        this._defs = null;
        
        window.Debug?.log('AnnotationRenderer', 'Destroyed');
    }
    
    // ========================================================================
    // Main Render Methods
    // ========================================================================
    
    /**
     * Render all annotations
     * @param {Object<string, AnnotationData>} annotations - Map of annotation ID to data
     * @param {number|null} [calibration] - Pixels per mm calibration factor
     */
    render(annotations, calibration = null) {
        this.clear();
        
        if (!annotations) return;
        
        Object.entries(annotations).forEach(([id, annotation]) => {
            this._renderAnnotation(id, annotation, calibration);
        });
    }
    
    /**
     * Clear all rendered annotations
     */
    clear() {
        // Clear transform group (keeps defs)
        this._transformGroup?.replaceChildren();
        
        // Clear label layer
        if (this._labelLayer) {
            this._labelLayer.innerHTML = '';
        }
    }
    
    /**
     * Render a single annotation
     * @param {string} id - Annotation ID
     * @param {AnnotationData} annotation - Annotation data
     * @param {number|null} calibration - Pixels per mm
     * @private
     */
    _renderAnnotation(id, annotation, calibration) {
        const type = annotation.type;
        const data = annotation.data || annotation;
        const color = annotation.color || this._getDefaultColor(type);
        const isSelected = id === this._selectedId;
        const isHovered = id === this._hoveredId;
        
        // Dispatch to type-specific renderer
        const renderers = {
            'point': () => this.renderPoint(id, data, color, isSelected, isHovered),
            'line': () => this.renderLine(id, data, color, isSelected, isHovered, calibration),
            'circle': () => this.renderCircle(id, data, color, isSelected, isHovered, calibration),
            'rectangle': () => this.renderRectangle(id, data, color, isSelected, isHovered, calibration),
            'polygon': () => this.renderPolygon(id, data, color, isSelected, isHovered, calibration),
            'angle': () => this.renderAngle(id, data, color, isSelected, isHovered)
        };
        
        const renderer = renderers[type];
        if (renderer) {
            renderer();
        } else if (annotation.coordinates) {
            // Legacy point format
            this.renderPoint(id, annotation.coordinates, color, isSelected, isHovered);
        } else {
            window.Debug?.warn('AnnotationRenderer', `Unknown annotation type: ${type} for id: ${id}`);
        }
    }
    
    /**
     * Get default color for annotation type
     * @param {string} type - Annotation type
     * @returns {string} Hex color
     * @private
     */
    _getDefaultColor(type) {
        const colors = window.DefaultColors || {
            'point': '#ff0000',
            'line': '#0066ff',
            'circle': '#ffaa00',
            'rectangle': '#9933ff',
            'angle': '#00cccc',
            'polygon': '#00cc66',
            'fallback': '#ff0000'
        };
        return colors[type] || colors.fallback || '#ff0000';
    }
    
    // ========================================================================
    // Selection & Hover State
    // ========================================================================
    
    /**
     * Set the selected annotation
     * @param {string|null} annotationId - Annotation ID or null to deselect
     */
    setSelected(annotationId) {
        const previousId = this._selectedId;
        this._selectedId = annotationId;
        
        // Update visual state
        if (previousId) {
            this._updateAnnotationState(previousId);
        }
        if (annotationId) {
            this._updateAnnotationState(annotationId);
        }
    }
    
    /**
     * Set the hovered annotation
     * @param {string|null} annotationId - Annotation ID or null
     */
    setHovered(annotationId) {
        const previousId = this._hoveredId;
        this._hoveredId = annotationId;
        
        // Update visual state
        if (previousId) {
            this._updateAnnotationState(previousId);
        }
        if (annotationId) {
            this._updateAnnotationState(annotationId);
        }
    }
    
    /**
     * Update visual state of an annotation
     * @param {string} annotationId - Annotation ID
     * @private
     */
    _updateAnnotationState(annotationId) {
        const escapedId = CSS.escape(annotationId);
        const group = this._transformGroup?.querySelector(`[data-annotation-id="${escapedId}"]`);
        if (!group) return;
        
        const isSelected = annotationId === this._selectedId;
        const isHovered = annotationId === this._hoveredId;
        
        group.classList.toggle('annotation--selected', isSelected);
        group.classList.toggle('annotation--hovered', isHovered);
        group.classList.toggle('selected', isSelected); // Legacy class
    }
    
    // ========================================================================
    // SVG Element Helpers
    // ========================================================================
    
    /**
     * Get common render properties (scale, strokeWidth, fillOpacity)
     * @param {boolean} isSelected - Whether annotation is selected
     * @returns {{scale: number, strokeWidth: number, fillOpacity: number}}
     * @private
     */
    _getRenderProps(isSelected) {
        const scale = this._currentScale;
        const strokeWidth = (isSelected ? this._config.selectedStrokeWidth : this._config.strokeWidth) / scale;
        const fillOpacity = isSelected ? this._config.selectedFillOpacity : this._config.fillOpacity;
        return { scale, strokeWidth, fillOpacity };
    }
    
    /**
     * Get stroke attributes for shapes
     * @param {string} color - Stroke color
     * @param {number} strokeWidth - Stroke width
     * @param {Object} [extras] - Additional attributes
     * @returns {Object} SVG attributes object
     * @private
     */
    _strokeAttrs(color, strokeWidth, extras = {}) {
        return {
            'stroke': color,
            'stroke-width': strokeWidth,
            ...extras
        };
    }
    
    /**
     * Get fill+stroke attributes for shapes
     * @param {string} color - Color for both fill and stroke
     * @param {number} strokeWidth - Stroke width
     * @param {number} fillOpacity - Fill opacity
     * @param {Object} [extras] - Additional attributes
     * @returns {Object} SVG attributes object
     * @private
     */
    _fillStrokeAttrs(color, strokeWidth, fillOpacity, extras = {}) {
        return {
            'fill': color,
            'fill-opacity': fillOpacity,
            'stroke': color,
            'stroke-width': strokeWidth,
            ...extras
        };
    }
    
    /**
     * Create a small marker circle (used for endpoints, vertices, centers)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} color - Fill color
     * @param {string} className - CSS class name
     * @param {number} scale - Current viewport scale
     * @param {number} [baseRadius=3] - Base radius before scaling
     * @returns {SVGCircleElement}
     * @private
     */
    _createMarker(x, y, color, className, scale, baseRadius = 3) {
        return this._createCircle(x, y, baseRadius / scale, {
            'class': className,
            'fill': color
        });
    }
    
    /**
     * Create an SVG group element for an annotation
     * @param {string} id - Annotation ID
     * @param {string} type - Annotation type
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     * @returns {SVGGElement}
     * @private
     */
    _createGroup(id, type, isSelected, isHovered) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('annotation', `annotation-${type}-group`);
        
        // Enable pointer events for hover/click detection
        group.style.pointerEvents = 'all';
        group.style.cursor = 'pointer';
        
        if (isSelected) {
            group.classList.add('annotation--selected', 'selected');
        }
        if (isHovered) {
            group.classList.add('annotation--hovered');
        }
        
        group.dataset.annotationId = id;
        group.dataset.annotation = id; // Legacy compatibility
        group.dataset.label = id; // Legacy compatibility
        
        group.setAttribute('role', 'img');
        group.setAttribute('aria-label', `${type} annotation: ${id}`);
        
        return group;
    }
    
    /**
     * Create an SVG circle element
     * @param {number} cx - Center X (image coords)
     * @param {number} cy - Center Y (image coords)
     * @param {number} r - Radius (image coords)
     * @param {Object} attrs - Additional attributes
     * @returns {SVGCircleElement}
     * @private
     */
    _createCircle(cx, cy, r, attrs = {}) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        Object.entries(attrs).forEach(([key, value]) => {
            circle.setAttribute(key, value);
        });
        return circle;
    }
    
    /**
     * Create an SVG line element
     * @param {number} x1 - Start X (image coords)
     * @param {number} y1 - Start Y (image coords)
     * @param {number} x2 - End X (image coords)
     * @param {number} y2 - End Y (image coords)
     * @param {Object} attrs - Additional attributes
     * @returns {SVGLineElement}
     * @private
     */
    _createLine(x1, y1, x2, y2, attrs = {}) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        Object.entries(attrs).forEach(([key, value]) => {
            line.setAttribute(key, value);
        });
        return line;
    }
    
    /**
     * Create an SVG rectangle element
     * @param {number} x - Top-left X (image coords)
     * @param {number} y - Top-left Y (image coords)
     * @param {number} width - Width (image coords)
     * @param {number} height - Height (image coords)
     * @param {Object} attrs - Additional attributes
     * @returns {SVGRectElement}
     * @private
     */
    _createRect(x, y, width, height, attrs = {}) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        Object.entries(attrs).forEach(([key, value]) => {
            rect.setAttribute(key, value);
        });
        return rect;
    }
    
    /**
     * Create an SVG path element
     * @param {string} d - Path data
     * @param {Object} attrs - Additional attributes
     * @returns {SVGPathElement}
     * @private
     */
    _createPath(d, attrs = {}) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        Object.entries(attrs).forEach(([key, value]) => {
            path.setAttribute(key, value);
        });
        return path;
    }
    
    /**
     * Create an edit handle
     * @param {number} x - X position (image coords)
     * @param {number} y - Y position (image coords)
     * @param {string} handleType - Handle type (e.g., 'start', 'end', 'center')
     * @param {string} color - Handle color
     * @param {string} annotationId - Parent annotation ID
     * @returns {SVGCircleElement}
     * @private
     */
    _createHandle(x, y, handleType, color, annotationId) {
        // Handle radius needs to be scaled inversely with viewport
        // so it appears the same size regardless of zoom
        const scale = this._currentScale;
        const radius = this._config.handleRadius / scale;
        const strokeWidth = 2 / scale;
        
        const handle = this._createCircle(x, y, radius, {
            'class': `annotation-handle handle-${handleType}`,
            'fill': '#ffffff',
            'stroke': color,
            'stroke-width': strokeWidth,
            'style': 'pointer-events: all; cursor: move;'
        });
        handle.dataset.handleType = handleType;
        handle.dataset.handle = handleType;
        handle.dataset.annotation = annotationId;
        
        return handle;
    }
    
    /**
     * Convert image coordinates to screen coordinates for label placement
     * @param {number} imageX - X in image space
     * @param {number} imageY - Y in image space
     * @returns {{x: number, y: number}} Screen coordinates
     * @private
     */
    _imageToScreen(imageX, imageY) {
        if (this._viewport) {
            return this._viewport.imageToScreen(imageX, imageY);
        }
        return { x: imageX, y: imageY };
    }
    
    /**
     * Create a measurement label in the HTML layer
     * @param {number} imageX - X position in image coords
     * @param {number} imageY - Y position in image coords
     * @param {string} text - Label text
     * @param {string} color - Label color
     * @param {string} [className] - Additional CSS class
     * @returns {HTMLElement}
     * @private
     */
    _createMeasurementLabel(imageX, imageY, text, color, className = '') {
        const screen = this._imageToScreen(imageX, imageY);
        
        const label = document.createElement('div');
        label.className = `annotation-measurement ${className}`.trim();
        label.style.cssText = `
            position: absolute;
            left: ${screen.x}px;
            top: ${screen.y}px;
            color: ${color};
            transform: translate(-50%, -100%);
        `;
        label.textContent = text;
        
        if (this._labelLayer) {
            this._labelLayer.appendChild(label);
        }
        
        return label;
    }
    
    /**
     * Create an annotation name label
     * @param {number} imageX - X position in image coords
     * @param {number} imageY - Y position in image coords
     * @param {string} text - Label text
     * @param {string} color - Label background color
     * @returns {HTMLElement}
     * @private
     */
    _createNameLabel(imageX, imageY, text, color) {
        if (!this._config.showLabels) return null;
        
        const screen = this._imageToScreen(imageX, imageY);
        
        const label = document.createElement('div');
        label.className = 'annotation-label-tag';
        label.style.cssText = `
            position: absolute;
            left: ${screen.x}px;
            top: ${screen.y}px;
            background: ${color};
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            transform: translate(8px, -50%);
            pointer-events: none;
        `;
        label.textContent = text;
        
        if (this._labelLayer) {
            this._labelLayer.appendChild(label);
        }
        
        return label;
    }
    
    // ========================================================================
    // Point Annotation Rendering
    // ========================================================================
    
    /**
     * Render a point annotation
     * @param {string} id - Annotation ID
     * @param {{x: number, y: number}} data - Point coordinates
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     */
    renderPoint(id, data, color, isSelected, isHovered) {
        const group = this._createGroup(id, 'point', isSelected, isHovered);
        const { scale, strokeWidth } = this._getRenderProps(isSelected);
        const r = this._config.pointRadius / scale;
        
        // Outer circle with inner fill
        group.appendChild(this._createCircle(data.x, data.y, r, {
            'class': 'annotation-point-outer',
            'fill': 'none',
            ...this._strokeAttrs(color, strokeWidth)
        }));
        
        group.appendChild(this._createCircle(data.x, data.y, r - 2 / scale, {
            'class': 'annotation-point-inner',
            'fill': color,
            'fill-opacity': '0.3'
        }));
        
        // Cross marker
        const crossSize = r + 2 / scale;
        const crossAttrs = { 'class': 'annotation-point-cross', ...this._strokeAttrs(color, strokeWidth) };
        group.appendChild(this._createLine(data.x - crossSize, data.y, data.x + crossSize, data.y, crossAttrs));
        group.appendChild(this._createLine(data.x, data.y - crossSize, data.x, data.y + crossSize, crossAttrs));
        
        if (this._config.showHandles && isSelected) {
            group.appendChild(this._createHandle(data.x, data.y, 'center', color, id));
        }
        
        this._transformGroup.appendChild(group);
        this._createNameLabel(data.x + r, data.y, id, color);
    }
    
    // ========================================================================
    // Line Annotation Rendering
    // ========================================================================
    
    /**
     * Render a line annotation
     * @param {string} id - Annotation ID
     * @param {{start: Point, end: Point}} data - Line data
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     * @param {number|null} calibration - Pixels per mm
     */
    renderLine(id, data, color, isSelected, isHovered, calibration) {
        const group = this._createGroup(id, 'line', isSelected, isHovered);
        const { scale, strokeWidth } = this._getRenderProps(isSelected);
        
        // Main line
        group.appendChild(this._createLine(data.start.x, data.start.y, data.end.x, data.end.y, {
            'class': 'annotation-line',
            ...this._strokeAttrs(color, strokeWidth, { 'stroke-linecap': 'round' })
        }));
        
        // Endpoint markers
        group.appendChild(this._createMarker(data.start.x, data.start.y, color, 'annotation-line-endpoint', scale, 4));
        group.appendChild(this._createMarker(data.end.x, data.end.y, color, 'annotation-line-endpoint', scale, 4));
        
        // Edit handles
        if (this._config.showHandles && isSelected) {
            const startHandle = this._createHandle(data.start.x, data.start.y, 'start', color, id);
            startHandle.dataset.pointIndex = '0';
            group.appendChild(startHandle);
            
            const endHandle = this._createHandle(data.end.x, data.end.y, 'end', color, id);
            endHandle.dataset.pointIndex = '1';
            group.appendChild(endHandle);
        }
        
        this._transformGroup.appendChild(group);
        
        // Measurements
        if (this._config.showMeasurements && window.Measurements) {
            const measurements = window.Measurements.measureLine(data, calibration);
            const midX = (data.start.x + data.end.x) / 2;
            const midY = (data.start.y + data.end.y) / 2;
            
            // Calculate perpendicular offset for label placement
            const angle = Math.atan2(data.end.y - data.start.y, data.end.x - data.start.x);
            const offset = this._config.measurementOffset / scale;
            
            this._createMeasurementLabel(
                midX + Math.sin(angle) * offset,
                midY - Math.cos(angle) * offset,
                measurements.formatted.length,
                color,
                'measurement-length'
            );
        }
        
        this._createNameLabel(data.start.x, data.start.y - 10 / scale, id, color);
    }
    
    // ========================================================================
    // Circle Annotation Rendering
    // ========================================================================
    
    /**
     * Render a circle annotation
     * @param {string} id - Annotation ID
     * @param {{center: Point, radius: number}} data - Circle data
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     * @param {number|null} calibration - Pixels per mm
     */
    renderCircle(id, data, color, isSelected, isHovered, calibration) {
        const group = this._createGroup(id, 'circle', isSelected, isHovered);
        const { scale, strokeWidth, fillOpacity } = this._getRenderProps(isSelected);
        
        // Circle shape
        group.appendChild(this._createCircle(data.center.x, data.center.y, data.radius, {
            'class': 'annotation-circle',
            ...this._fillStrokeAttrs(color, strokeWidth, fillOpacity)
        }));
        
        // Center marker
        group.appendChild(this._createMarker(data.center.x, data.center.y, color, 'annotation-circle-center', scale));
        
        // Radius line (dashed)
        group.appendChild(this._createLine(
            data.center.x, data.center.y,
            data.center.x + data.radius, data.center.y,
            {
                'class': 'annotation-circle-radius-line',
                'stroke': color,
                'stroke-width': 1 / scale,
                'stroke-dasharray': `${4 / scale},${2 / scale}`
            }
        ));
        
        // Edit handles
        if (this._config.showHandles && isSelected) {
            group.appendChild(this._createHandle(data.center.x, data.center.y, 'center', color, id));
            group.appendChild(this._createHandle(data.center.x + data.radius, data.center.y, 'radius', color, id));
        }
        
        this._transformGroup.appendChild(group);
        
        // Measurements
        if (this._config.showMeasurements && window.Measurements) {
            const measurements = window.Measurements.measureCircle(data, calibration);
            
            this._createMeasurementLabel(
                data.center.x + data.radius / 2,
                data.center.y - 8 / scale,
                `r: ${measurements.formatted.radius}`,
                color,
                'measurement-radius'
            );
            
            // Area text (if circle is large enough)
            if (data.radius * scale > 40) {
                const areaLabel = this._createMeasurementLabel(
                    data.center.x,
                    data.center.y + 15 / scale,
                    `A: ${measurements.formatted.area}`,
                    color,
                    'measurement-area'
                );
                if (areaLabel) {
                    areaLabel.style.transform = 'translate(-50%, 0)';
                }
            }
        }
        
        this._createNameLabel(data.center.x + data.radius, data.center.y, id, color);
    }
    
    // ========================================================================
    // Rectangle Annotation Rendering
    // ========================================================================
    
    /**
     * Render a rectangle annotation
     * @param {string} id - Annotation ID
     * @param {{topLeft: Point, bottomRight: Point}|{center: Point, width: number, height: number}} data - Rectangle data
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     * @param {number|null} calibration - Pixels per mm
     */
    renderRectangle(id, data, color, isSelected, isHovered, calibration) {
        // Normalize rectangle data to x, y, width, height
        let x, y, width, height;
        if (data.topLeft && data.bottomRight) {
            x = Math.min(data.topLeft.x, data.bottomRight.x);
            y = Math.min(data.topLeft.y, data.bottomRight.y);
            width = Math.abs(data.bottomRight.x - data.topLeft.x);
            height = Math.abs(data.bottomRight.y - data.topLeft.y);
        } else if (data.center && data.width && data.height) {
            width = data.width;
            height = data.height;
            x = data.center.x - width / 2;
            y = data.center.y - height / 2;
        } else {
            return;
        }
        
        const group = this._createGroup(id, 'rectangle', isSelected, isHovered);
        const { scale, strokeWidth, fillOpacity } = this._getRenderProps(isSelected);
        
        // Rectangle shape
        group.appendChild(this._createRect(x, y, width, height, {
            'class': 'annotation-rectangle',
            ...this._fillStrokeAttrs(color, strokeWidth, fillOpacity)
        }));
        
        // Corner markers and handles
        const corners = [
            { x: x, y: y, type: 'nw' },
            { x: x + width, y: y, type: 'ne' },
            { x: x, y: y + height, type: 'sw' },
            { x: x + width, y: y + height, type: 'se' }
        ];
        
        corners.forEach(corner => {
            group.appendChild(this._createMarker(corner.x, corner.y, color, 'annotation-rectangle-corner', scale));
            
            if (this._config.showHandles && isSelected) {
                group.appendChild(this._createHandle(corner.x, corner.y, corner.type, color, id));
            }
        });
        
        this._transformGroup.appendChild(group);
        
        // Measurements
        if (this._config.showMeasurements && window.Measurements) {
            const measurements = window.Measurements.measureRectangle(data, calibration);
            
            // Width label
            this._createMeasurementLabel(x + width / 2, y - 5 / scale, measurements.formatted.width, color, 'measurement-width');
            
            // Height label
            const heightLabel = this._createMeasurementLabel(
                x + width + 10 / scale, y + height / 2,
                measurements.formatted.height, color, 'measurement-height'
            );
            if (heightLabel) {
                heightLabel.style.transform = 'translate(0, -50%)';
            }
            
            // Area label (if large enough)
            if (width * scale > 60 && height * scale > 40) {
                const areaLabel = this._createMeasurementLabel(
                    x + width / 2, y + height / 2,
                    `A: ${measurements.formatted.area}`, color, 'measurement-area'
                );
                if (areaLabel) {
                    areaLabel.style.transform = 'translate(-50%, -50%)';
                }
            }
        }
        
        const nameLabel = this._createNameLabel(x, y - 5 / scale, id, color);
        if (nameLabel) {
            nameLabel.style.transform = 'translate(0, -100%)';
        }
    }
    
    // ========================================================================
    // Polygon Annotation Rendering
    // ========================================================================
    
    /**
     * Render a polygon annotation
     * @param {string} id - Annotation ID
     * @param {{points: Point[]}} data - Polygon data
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     * @param {number|null} calibration - Pixels per mm
     */
    renderPolygon(id, data, color, isSelected, isHovered, calibration) {
        const points = data.points || [];
        if (points.length < 3) return;
        
        const group = this._createGroup(id, 'polygon', isSelected, isHovered);
        const { scale, strokeWidth, fillOpacity } = this._getRenderProps(isSelected);
        
        // Create polygon path
        const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
        
        group.appendChild(this._createPath(pathData, {
            'class': 'annotation-polygon',
            ...this._fillStrokeAttrs(color, strokeWidth, fillOpacity, { 'stroke-linejoin': 'round' })
        }));
        
        // Vertex markers and handles
        points.forEach((p, index) => {
            group.appendChild(this._createMarker(p.x, p.y, color, 'annotation-polygon-vertex', scale));
            
            if (this._config.showHandles && isSelected) {
                const handle = this._createHandle(p.x, p.y, `vertex-${index}`, color, id);
                handle.dataset.pointIndex = index.toString();
                group.appendChild(handle);
            }
        });
        
        this._transformGroup.appendChild(group);
        
        // Measurements
        if (this._config.showMeasurements && window.Measurements) {
            const measurements = window.Measurements.measurePolygon(data, calibration);
            const centroid = measurements.centroid;
            
            const areaLabel = this._createMeasurementLabel(
                centroid.x, centroid.y, `A: ${measurements.formatted.area}`, color, 'measurement-area'
            );
            if (areaLabel) {
                areaLabel.style.transform = 'translate(-50%, -50%)';
            }
            
            const perimeterLabel = this._createMeasurementLabel(
                centroid.x, centroid.y + 18 / scale, `P: ${measurements.formatted.perimeter}`, color, 'measurement-perimeter'
            );
            if (perimeterLabel) {
                perimeterLabel.style.transform = 'translate(-50%, -50%)';
            }
        }
        
        this._createNameLabel(points[0].x, points[0].y - 10 / scale, id, color);
    }
    
    // ========================================================================
    // Angle Annotation Rendering
    // ========================================================================
    
    /**
     * Render an angle annotation
     * @param {string} id - Annotation ID
     * @param {{point1: Point, vertex: Point, point2: Point}} data - Angle data
     * @param {string} color - Display color
     * @param {boolean} isSelected - Whether selected
     * @param {boolean} isHovered - Whether hovered
     */
    renderAngle(id, data, color, isSelected, isHovered) {
        const group = this._createGroup(id, 'angle', isSelected, isHovered);
        const { scale, strokeWidth } = this._getRenderProps(isSelected);
        const armAttrs = {
            'class': 'annotation-angle-arm',
            ...this._strokeAttrs(color, strokeWidth, { 'stroke-linecap': 'round' })
        };
        
        // Arms: vertex to point1 and vertex to point2
        group.appendChild(this._createLine(data.vertex.x, data.vertex.y, data.point1.x, data.point1.y, armAttrs));
        group.appendChild(this._createLine(data.vertex.x, data.vertex.y, data.point2.x, data.point2.y, armAttrs));
        
        // Calculate arc
        const arcData = this._calculateAngleArc(data, scale);
        
        group.appendChild(this._createPath(arcData.path, {
            'class': 'annotation-angle-arc',
            'fill': 'none',
            ...this._strokeAttrs(color, strokeWidth - 0.5 / scale)
        }));
        
        // Markers: vertex (larger) and endpoints
        group.appendChild(this._createMarker(data.vertex.x, data.vertex.y, color, 'annotation-angle-vertex', scale, 4));
        group.appendChild(this._createMarker(data.point1.x, data.point1.y, color, 'annotation-angle-endpoint', scale));
        group.appendChild(this._createMarker(data.point2.x, data.point2.y, color, 'annotation-angle-endpoint', scale));
        
        // Edit handles
        if (this._config.showHandles && isSelected) {
            const handles = [
                { point: data.point1, type: 'point1', index: '0' },
                { point: data.vertex, type: 'vertex', index: '1' },
                { point: data.point2, type: 'point2', index: '2' }
            ];
            handles.forEach(h => {
                const handle = this._createHandle(h.point.x, h.point.y, h.type, color, id);
                handle.dataset.pointIndex = h.index;
                group.appendChild(handle);
            });
        }
        
        this._transformGroup.appendChild(group);
        
        // Angle measurement
        if (this._config.showMeasurements && window.Measurements) {
            const measurements = window.Measurements.measureAngle(data);
            const textPos = this._getArcLabelPosition(data, arcData.radius, scale);
            
            const angleLabel = this._createMeasurementLabel(
                textPos.x, textPos.y, measurements.formatted.angle, color, 'measurement-angle'
            );
            if (angleLabel) {
                angleLabel.style.transform = 'translate(-50%, -50%)';
            }
        }
        
        this._createNameLabel(data.vertex.x, data.vertex.y - 20 / scale, id, color);
    }
    
    /**
     * Calculate arc path data for angle annotation
     * @param {{point1: Point, vertex: Point, point2: Point}} data - Angle data
     * @param {number} scale - Current viewport scale
     * @returns {{path: string, radius: number, startAngle: number, endAngle: number}}
     * @private
     */
    _calculateAngleArc(data, scale) {
        const angle1 = Math.atan2(data.point1.y - data.vertex.y, data.point1.x - data.vertex.x);
        const angle2 = Math.atan2(data.point2.y - data.vertex.y, data.point2.x - data.vertex.x);
        
        // Normalize angle difference
        let diff = angle2 - angle1;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        
        const sweepFlag = diff < 0 ? 0 : 1;
        const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;
        
        // Calculate arc radius based on arm lengths
        const arm1Length = Math.hypot(data.point1.x - data.vertex.x, data.point1.y - data.vertex.y);
        const arm2Length = Math.hypot(data.point2.x - data.vertex.x, data.point2.y - data.vertex.y);
        const radius = Math.min(this._config.arcRadius / scale, arm1Length * 0.4, arm2Length * 0.4);
        
        // Arc endpoints
        const arcStart = {
            x: data.vertex.x + radius * Math.cos(angle1),
            y: data.vertex.y + radius * Math.sin(angle1)
        };
        const arcEnd = {
            x: data.vertex.x + radius * Math.cos(angle2),
            y: data.vertex.y + radius * Math.sin(angle2)
        };
        
        const path = `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`;
        
        return { path, radius, startAngle: angle1, endAngle: angle2 };
    }
    
    /**
     * Get position for angle measurement label
     * @param {{point1: Point, vertex: Point, point2: Point}} data - Angle data
     * @param {number} arcRadius - Arc radius
     * @param {number} scale - Current viewport scale
     * @returns {{x: number, y: number}}
     * @private
     */
    _getArcLabelPosition(data, arcRadius, scale) {
        const angle1 = Math.atan2(data.point1.y - data.vertex.y, data.point1.x - data.vertex.x);
        const angle2 = Math.atan2(data.point2.y - data.vertex.y, data.point2.x - data.vertex.x);
        const bisectorAngle = (angle1 + angle2) / 2;
        const textRadius = arcRadius + 15 / scale;
        
        return {
            x: data.vertex.x + textRadius * Math.cos(bisectorAngle),
            y: data.vertex.y + textRadius * Math.sin(bisectorAngle)
        };
    }
    
    // ========================================================================
    // Preview Rendering (for in-progress annotations)
    // ========================================================================
    
    /**
     * Render a preview of an in-progress annotation (dashed, semi-transparent)
     * Shows collected points + a line/shape to the current cursor position
     * @param {string} type - Annotation type
     * @param {Array<{x: number, y: number}>} points - Collected points so far
     * @param {{x: number, y: number}|null} previewPoint - Current cursor position
     * @param {string} [color] - Preview color
     */
    renderPreview(type, points, previewPoint, color = '#666666') {
        this.clearPreview();
        if (!this._transformGroup || !points || points.length === 0) return;

        const scale = this._currentScale;
        const strokeWidth = 2 / scale;
        const dashArray = `${6 / scale} ${4 / scale}`;
        const markerRadius = 4 / scale;

        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('annotation-preview');
        group.style.pointerEvents = 'none';
        group.style.opacity = '0.7';

        // Draw markers at all collected points
        points.forEach(p => {
            group.appendChild(this._createCircle(p.x, p.y, markerRadius, {
                'fill': color,
                'fill-opacity': '0.5',
                'stroke': color,
                'stroke-width': strokeWidth
            }));
        });

        // Combine points with preview point for shape rendering
        const allPoints = previewPoint ? [...points, previewPoint] : points;

        switch (type) {
            case 'point':
                // Point is already shown as marker above
                break;

            case 'line':
                if (allPoints.length >= 2) {
                    group.appendChild(this._createLine(
                        allPoints[0].x, allPoints[0].y,
                        allPoints[1].x, allPoints[1].y,
                        { 'stroke': color, 'stroke-width': strokeWidth, 'stroke-dasharray': dashArray }
                    ));
                }
                break;

            case 'circle':
                if (allPoints.length >= 2) {
                    const radius = Math.hypot(
                        allPoints[1].x - allPoints[0].x,
                        allPoints[1].y - allPoints[0].y
                    );
                    group.appendChild(this._createCircle(
                        allPoints[0].x, allPoints[0].y, radius,
                        { 'fill': color, 'fill-opacity': '0.1', 'stroke': color,
                          'stroke-width': strokeWidth, 'stroke-dasharray': dashArray }
                    ));
                }
                break;

            case 'rectangle':
                if (allPoints.length >= 2) {
                    const x = Math.min(allPoints[0].x, allPoints[1].x);
                    const y = Math.min(allPoints[0].y, allPoints[1].y);
                    const w = Math.abs(allPoints[1].x - allPoints[0].x);
                    const h = Math.abs(allPoints[1].y - allPoints[0].y);
                    group.appendChild(this._createRect(x, y, w, h, {
                        'fill': color, 'fill-opacity': '0.1', 'stroke': color,
                        'stroke-width': strokeWidth, 'stroke-dasharray': dashArray
                    }));
                }
                break;

            case 'angle':
                // Draw lines between consecutive points
                for (let i = 0; i < allPoints.length - 1 && i < 2; i++) {
                    group.appendChild(this._createLine(
                        allPoints[i].x, allPoints[i].y,
                        allPoints[i + 1].x, allPoints[i + 1].y,
                        { 'stroke': color, 'stroke-width': strokeWidth, 'stroke-dasharray': dashArray }
                    ));
                }
                break;

            case 'polygon':
            case 'freehand': {
                // Draw polyline through all points
                if (allPoints.length >= 2) {
                    const pathData = allPoints.map((p, i) =>
                        `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
                    ).join(' ');
                    // Close polygon if enough points and it's a polygon
                    const closePath = type === 'polygon' && points.length >= 3 ? ' Z' : '';
                    group.appendChild(this._createPath(pathData + closePath, {
                        'fill': type === 'polygon' && points.length >= 3 ? color : 'none',
                        'fill-opacity': '0.1',
                        'stroke': color,
                        'stroke-width': strokeWidth,
                        'stroke-dasharray': dashArray
                    }));
                }
                break;
            }
        }

        // Draw preview cursor marker if we have a preview point
        if (previewPoint) {
            group.appendChild(this._createCircle(previewPoint.x, previewPoint.y, markerRadius * 0.8, {
                'fill': 'none',
                'stroke': color,
                'stroke-width': strokeWidth,
                'stroke-dasharray': `${3 / scale} ${2 / scale}`
            }));
        }

        this._transformGroup.appendChild(group);
    }
    
    /**
     * Clear any preview annotations
     */
    clearPreview() {
        const previews = this._transformGroup?.querySelectorAll('.annotation-preview');
        previews?.forEach(p => p.remove());
    }
}

// ============================================================================
// Create Singleton Instance
// ============================================================================

const annotationRenderer = new AnnotationRenderer();

// ============================================================================
// Export to Window for Global Access
// ============================================================================

if (typeof window !== 'undefined') {
    window.AnnotationRenderer = AnnotationRenderer;
    window.annotationRenderer = annotationRenderer;
}

// ES Module exports (if using type="module")
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AnnotationRenderer, annotationRenderer };
}

console.log('[AnnotationRenderer] Core annotation renderer initialized');
