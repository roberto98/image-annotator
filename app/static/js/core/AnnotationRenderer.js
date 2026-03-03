/**
 * AnnotationRenderer - SVG-based annotation rendering with viewport synchronization
 * @module core/AnnotationRenderer
 *
 * Features: SVG overlay synced with viewport transform, annotations in image coords,
 * all annotation types (point, line, circle, rectangle, polygon, angle),
 * selection/hover state, measurement labels.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

class AnnotationRenderer {
    constructor() {
        this._container = null;
        this._svg = null;
        this._transformGroup = null;
        this._defs = null;
        this._labelLayer = null;
        this._viewport = null;
        this._viewportSubscription = null;
        this._selectedId = null;
        this._hoveredId = null;
        this._config = this._getDefaultConfig();
        this._imageWidth = 0;
        this._imageHeight = 0;
        this._initialized = false;
        this._renderedAnnotations = new Set();
    }

    // Configuration
    
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

    configure(options) {
        this._config = { ...this._config, ...options };
    }

    get _currentScale() {
        return this._viewport?.scale || 1;
    }

    // Initialization
    
    init(container, viewport = null, options = {}) {
        if (!container) {
            console.error('[AnnotationRenderer] Container element required');
            return;
        }

        // Clean up previous initialization if re-initializing
        if (this._initialized) {
            window.Debug?.warn('AnnotationRenderer', 'Re-initializing - cleaning up previous state');
            this._cleanupSubscriptions();
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

        this._initialized = true;
        window.Debug?.log('AnnotationRenderer', 'Initialized');
    }

    setImageSize(width, height) {
        this._imageWidth = width;
        this._imageHeight = height;
        this._syncTransform();
    }

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

    _subscribeToViewport() {
        if (!this._viewport) return;

        // Clean up any existing subscription first
        this._cleanupSubscriptions();

        this._viewportSubscription = this._viewport.subscribe(() => this._syncTransform());
    }

    _cleanupSubscriptions() {
        if (this._viewport && this._viewportSubscription !== null) {
            this._viewport.unsubscribe(this._viewportSubscription);
            this._viewportSubscription = null;
        }
    }

    _syncTransform() {
        if (!this._viewport) return;

        const { scale, offsetX, offsetY } = this._viewport;

        // Update SVG annotation transform
        if (this._transformGroup) {
            this._transformGroup.setAttribute('transform', `matrix(${scale}, 0, 0, ${scale}, ${offsetX}, ${offsetY})`);
        }

        // Reposition HTML label divs — they store their anchor in image coords
        if (this._labelLayer) {
            for (const label of this._labelLayer.children) {
                const ix = label.dataset.imageX;
                const iy = label.dataset.imageY;
                if (ix !== undefined && iy !== undefined) {
                    const screen = this._viewport.imageToScreen(parseFloat(ix), parseFloat(iy));
                    label.style.left = `${screen.x}px`;
                    label.style.top = `${screen.y}px`;
                }
            }
        }
    }

    // Cleanup

    destroy() {
        this._cleanupSubscriptions();
        this._svg?.remove();
        this._labelLayer?.remove();

        this._svg = null;
        this._labelLayer = null;
        this._container = null;
        this._transformGroup = null;
        this._defs = null;
        this._renderedAnnotations.clear();
        this._initialized = false;

        window.Debug?.log('AnnotationRenderer', 'Destroyed');
    }

    // Main Render Methods

    render(annotations, calibration = null, forceFull = false) {
        if (!annotations) {
            this.clear();
            return;
        }

        // Use differential rendering for performance unless forced full render
        if (!forceFull && this._canUseDifferentialRender(annotations)) {
            this._renderDifferential(annotations, calibration);
        } else {
            this._renderFull(annotations, calibration);
        }
    }

    _canUseDifferentialRender(annotations) {
        // Differential rendering only beneficial if we have existing rendered annotations
        if (this._renderedAnnotations.size === 0) {
            return false;
        }

        const currentIds = new Set(Object.keys(annotations));
        const removedCount = [...this._renderedAnnotations].filter(id => !currentIds.has(id)).length;
        const addedCount = [...currentIds].filter(id => !this._renderedAnnotations.has(id)).length;

        // If more than 50% changed, full render is likely faster
        const totalChanges = removedCount + addedCount;
        const changeRatio = totalChanges / Math.max(this._renderedAnnotations.size, currentIds.size);

        return changeRatio < 0.5;
    }

    _renderDifferential(annotations, calibration) {
        const currentIds = new Set(Object.keys(annotations));
        let errorCount = 0;
        const maxErrors = 10;

        // Remove annotations that no longer exist
        for (const id of this._renderedAnnotations) {
            if (!currentIds.has(id)) {
                this._removeRenderedAnnotation(id);
            }
        }

        // Add or update annotations
        for (const [id, annotation] of Object.entries(annotations)) {
            try {
                // Always re-render to ensure updates are shown
                // In future, could add data comparison to skip unchanged annotations
                this._removeRenderedAnnotation(id);
                this._renderAnnotation(id, annotation, calibration);
                this._renderedAnnotations.add(id);
            } catch (error) {
                errorCount++;
                console.error(`[AnnotationRenderer] Failed to render annotation ${id}:`, error);

                if (errorCount >= maxErrors) {
                    console.error('[AnnotationRenderer] Too many render errors, stopping');
                    window.showMessage?.('Some annotations failed to render', 'error');
                    throw new Error(`Too many annotation render errors (${errorCount})`);
                }
            }
        }

        if (errorCount > 0 && errorCount < maxErrors) {
            window.showMessage?.(`${errorCount} annotation(s) failed to render`, 'warning');
        }
    }

    _renderFull(annotations, calibration) {
        this.clear();

        let errorCount = 0;
        const maxErrors = 10;

        Object.entries(annotations).forEach(([id, annotation]) => {
            try {
                this._renderAnnotation(id, annotation, calibration);
                this._renderedAnnotations.add(id);
            } catch (error) {
                errorCount++;
                console.error(`[AnnotationRenderer] Failed to render annotation ${id}:`, error);

                if (errorCount >= maxErrors) {
                    console.error('[AnnotationRenderer] Too many render errors, stopping');
                    window.showMessage?.('Some annotations failed to render', 'error');
                    throw new Error(`Too many annotation render errors (${errorCount})`);
                }
            }
        });

        if (errorCount > 0 && errorCount < maxErrors) {
            window.showMessage?.(`${errorCount} annotation(s) failed to render`, 'warning');
        }
    }

    _removeRenderedAnnotation(id) {
        if (!this._transformGroup) return;

        const escapedId = CSS.escape(id);
        const group = this._transformGroup.querySelector(`[data-annotation-id="${escapedId}"]`);
        if (group) {
            group.remove();
        }

        // Also remove any labels in the label layer
        if (this._labelLayer) {
            const labels = this._labelLayer.querySelectorAll(`[data-annotation-id="${escapedId}"]`);
            labels.forEach(label => label.remove());
        }

        this._renderedAnnotations.delete(id);
    }

    clear() {
        this._transformGroup?.replaceChildren();
        if (this._labelLayer) this._labelLayer.innerHTML = '';
        this._renderedAnnotations.clear();
    }

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

    // Selection & Hover State

    setSelected(annotationId) {
        const previousId = this._selectedId;
        this._selectedId = annotationId;
        if (previousId) this._updateAnnotationState(previousId);
        if (annotationId) this._updateAnnotationState(annotationId);
    }

    setHovered(annotationId) {
        const previousId = this._hoveredId;
        this._hoveredId = annotationId;
        if (previousId) this._updateAnnotationState(previousId);
        if (annotationId) this._updateAnnotationState(annotationId);
    }

    _updateAnnotationState(annotationId) {
        const escapedId = CSS.escape(annotationId);
        const group = this._transformGroup?.querySelector(`[data-annotation-id="${escapedId}"]`);
        if (!group) return;

        const isSelected = annotationId === this._selectedId;
        const isHovered = annotationId === this._hoveredId;

        group.classList.toggle('annotation--selected', isSelected);
        group.classList.toggle('annotation--hovered', isHovered);
        group.classList.toggle('selected', isSelected);
    }

    // SVG Element Helpers

    _getRenderProps(isSelected) {
        const scale = this._currentScale;
        const strokeWidth = (isSelected ? this._config.selectedStrokeWidth : this._config.strokeWidth) / scale;
        const fillOpacity = isSelected ? this._config.selectedFillOpacity : this._config.fillOpacity;
        return { scale, strokeWidth, fillOpacity };
    }

    _strokeAttrs(color, strokeWidth, extras = {}) {
        return { 'stroke': color, 'stroke-width': strokeWidth, ...extras };
    }

    _fillStrokeAttrs(color, strokeWidth, fillOpacity, extras = {}) {
        return { 'fill': color, 'fill-opacity': fillOpacity, 'stroke': color, 'stroke-width': strokeWidth, ...extras };
    }

    _createMarker(x, y, color, className, scale, baseRadius = 3) {
        return this._createCircle(x, y, baseRadius / scale, { 'class': className, 'fill': color });
    }

    _createGroup(id, type, isSelected, isHovered) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('annotation', `annotation-${type}-group`);
        group.style.pointerEvents = 'all';
        group.style.cursor = 'pointer';

        if (isSelected) group.classList.add('annotation--selected', 'selected');
        if (isHovered) group.classList.add('annotation--hovered');

        group.dataset.annotationId = id;
        group.dataset.annotation = id;
        group.dataset.label = id;
        group.setAttribute('role', 'img');
        group.setAttribute('aria-label', `${type} annotation: ${id}`);

        return group;
    }

    _createCircle(cx, cy, r, attrs = {}) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        Object.entries(attrs).forEach(([k, v]) => circle.setAttribute(k, v));
        return circle;
    }

    _createLine(x1, y1, x2, y2, attrs = {}) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        Object.entries(attrs).forEach(([k, v]) => line.setAttribute(k, v));
        return line;
    }

    _createRect(x, y, width, height, attrs = {}) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        Object.entries(attrs).forEach(([k, v]) => rect.setAttribute(k, v));
        return rect;
    }

    _createPath(d, attrs = {}) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        Object.entries(attrs).forEach(([k, v]) => path.setAttribute(k, v));
        return path;
    }

    _createHandle(x, y, handleType, color, annotationId) {
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

    _imageToScreen(imageX, imageY) {
        return this._viewport ? this._viewport.imageToScreen(imageX, imageY) : { x: imageX, y: imageY };
    }

    _createMeasurementLabel(imageX, imageY, text, color, className = '', annotationId = null) {
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

        // Store image-space anchor so _syncTransform can reposition on pan/zoom
        label.dataset.imageX = imageX;
        label.dataset.imageY = imageY;

        // Add annotation ID for easier removal in differential rendering
        if (annotationId) {
            label.dataset.annotationId = annotationId;
        }

        if (this._labelLayer) {
            this._labelLayer.appendChild(label);
        }

        return label;
    }

    _createNameLabel(imageX, imageY, text, color, annotationId = null) {
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

        // Store image-space anchor so _syncTransform can reposition on pan/zoom
        label.dataset.imageX = imageX;
        label.dataset.imageY = imageY;

        // Add annotation ID for easier removal in differential rendering
        if (annotationId) {
            label.dataset.annotationId = annotationId;
        }

        if (this._labelLayer) {
            this._labelLayer.appendChild(label);
        }

        return label;
    }

    // Point Annotation Rendering

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
        this._createNameLabel(data.x + r, data.y, id, color, id);
    }

    // Line Annotation Rendering

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
                'measurement-length',
                id
            );
        }

        this._createNameLabel(data.start.x, data.start.y - 10 / scale, id, color, id);
    }

    // Circle Annotation Rendering

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
        
        // Edit handles - use pointIndex to route to movePoint() which has proper handling
        if (this._config.showHandles && isSelected) {
            const centerHandle = this._createHandle(data.center.x, data.center.y, 'center', color, id);
            centerHandle.dataset.pointIndex = '0';  // pointIndex 0 = move center
            group.appendChild(centerHandle);

            const radiusHandle = this._createHandle(data.center.x + data.radius, data.center.y, 'radius', color, id);
            radiusHandle.dataset.pointIndex = '1';  // pointIndex 1 = change radius
            group.appendChild(radiusHandle);
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
                'measurement-radius',
                id
            );

            // Area text (if circle is large enough)
            if (data.radius * scale > 40) {
                const areaLabel = this._createMeasurementLabel(
                    data.center.x,
                    data.center.y + 15 / scale,
                    `A: ${measurements.formatted.area}`,
                    color,
                    'measurement-area',
                    id
                );
                if (areaLabel) {
                    areaLabel.style.transform = 'translate(-50%, 0)';
                }
            }
        }

        this._createNameLabel(data.center.x + data.radius, data.center.y, id, color, id);
    }

    // Rectangle Annotation Rendering

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
            this._createMeasurementLabel(x + width / 2, y - 5 / scale, measurements.formatted.width, color, 'measurement-width', id);

            // Height label
            const heightLabel = this._createMeasurementLabel(
                x + width + 10 / scale, y + height / 2,
                measurements.formatted.height, color, 'measurement-height', id
            );
            if (heightLabel) {
                heightLabel.style.transform = 'translate(0, -50%)';
            }

            // Area label (if large enough)
            if (width * scale > 60 && height * scale > 40) {
                const areaLabel = this._createMeasurementLabel(
                    x + width / 2, y + height / 2,
                    `A: ${measurements.formatted.area}`, color, 'measurement-area', id
                );
                if (areaLabel) {
                    areaLabel.style.transform = 'translate(-50%, -50%)';
                }
            }
        }

        const nameLabel = this._createNameLabel(x, y - 5 / scale, id, color, id);
        if (nameLabel) {
            nameLabel.style.transform = 'translate(0, -100%)';
        }
    }

    // Polygon Annotation Rendering

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
                centroid.x, centroid.y, `A: ${measurements.formatted.area}`, color, 'measurement-area', id
            );
            if (areaLabel) {
                areaLabel.style.transform = 'translate(-50%, -50%)';
            }

            const perimeterLabel = this._createMeasurementLabel(
                centroid.x, centroid.y + 18 / scale, `P: ${measurements.formatted.perimeter}`, color, 'measurement-perimeter', id
            );
            if (perimeterLabel) {
                perimeterLabel.style.transform = 'translate(-50%, -50%)';
            }
        }

        this._createNameLabel(points[0].x, points[0].y - 10 / scale, id, color, id);
    }

    // Angle Annotation Rendering

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
                textPos.x, textPos.y, measurements.formatted.angle, color, 'measurement-angle', id
            );
            if (angleLabel) {
                angleLabel.style.transform = 'translate(-50%, -50%)';
            }
        }

        this._createNameLabel(data.vertex.x, data.vertex.y - 20 / scale, id, color, id);
    }

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

    // Preview Rendering

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
