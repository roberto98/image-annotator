/**
 * EditingHandler - Manages annotation selection and modification
 * @module annotations/editing
 *
 * Features: drag-to-move, point/handle dragging, arrow key movement,
 * touch support, undo/redo integration, visual feedback.
 *
 * Compatible with both AnnotationState and legacy STATE systems.
 */

const EditingHandler = {
    // State properties
    isDragging: false,
    dragTarget: null,
    dragPointIndex: -1,
    dragHandleType: null,
    dragStartPos: null,
    originalData: null,
    editingLabel: null,
    _containerRect: null,
    _initialized: false,
    _justDragged: false,

    // Bound event handler references
    _handleMouseDown: null,
    _handleMouseMove: null,
    _handleMouseUp: null,
    _handleMouseOver: null,
    _handleMouseOut: null,
    _handleKeyDown: null,
    _handleTouchStart: null,
    _handleTouchMove: null,
    _handleTouchEnd: null,
    _handleContainerClick: null,

    // Touch state
    _touchStartPos: null,
    _isTouchDrag: false,

    // Save operation state
    _isSaving: false,
    _pendingSave: null,

    // Edit mode enabled state
    enabled: false,

    // Default constants (fallback when EditingConstants unavailable)
    _defaultConstants: {
        MIN_CIRCLE_RADIUS: 5,
        MIN_RECTANGLE_SIZE: 10,
        ARROW_STEP_NORMAL: 1,
        ARROW_STEP_SHIFT: 10,
        ARROW_STEP_CTRL: 0.5,
        TOUCH_DRAG_THRESHOLD: 5,
        ARROW_SAVE_DEBOUNCE: 300
    },

    // Constants accessors with fallbacks
    get MIN_CIRCLE_RADIUS() {
        return window.EditingConstants?.MIN_CIRCLE_RADIUS ?? this._defaultConstants.MIN_CIRCLE_RADIUS;
    },
    get MIN_RECTANGLE_SIZE() {
        return window.EditingConstants?.MIN_RECTANGLE_SIZE ?? this._defaultConstants.MIN_RECTANGLE_SIZE;
    },
    get ARROW_STEP_NORMAL() {
        return window.EditingConstants?.ARROW_STEP_NORMAL ?? this._defaultConstants.ARROW_STEP_NORMAL;
    },
    get ARROW_STEP_SHIFT() {
        return window.EditingConstants?.ARROW_STEP_SHIFT ?? this._defaultConstants.ARROW_STEP_SHIFT;
    },
    get ARROW_STEP_CTRL() {
        return window.EditingConstants?.ARROW_STEP_CTRL ?? this._defaultConstants.ARROW_STEP_CTRL;
    },
    get TOUCH_DRAG_THRESHOLD() {
        return window.EditingConstants?.TOUCH_DRAG_THRESHOLD ?? this._defaultConstants.TOUCH_DRAG_THRESHOLD;
    },
    get ARROW_SAVE_DEBOUNCE() {
        return window.EditingConstants?.ARROW_SAVE_DEBOUNCE ?? this._defaultConstants.ARROW_SAVE_DEBOUNCE;
    },

    // State accessors (compatibility layer)
    
    _getState() {
        return window.AnnotationState || {};
    },

    _getPatientId() {
        const state = this._getState();
        return state.patientId || window.patientId || window.__APP_CONFIG__?.patientId;
    },

    _getImageName() {
        const state = this._getState();
        return state.imageName || window.imageName || window.__APP_CONFIG__?.imageName;
    },

    _getAnnotation(label) {
        const state = this._getState();
        return state.getAnnotation ? state.getAnnotation(label) : state.annotations?.[label] || null;
    },

    _setAnnotation(label, data, saveToServer = false) {
        if (window.AnnotationState?.setAnnotation) {
            window.AnnotationState.setAnnotation(label, data, saveToServer);
        }
    },

    _removeAnnotation(label) {
        if (window.AnnotationState?.removeAnnotation) {
            window.AnnotationState.removeAnnotation(label);
        }
    },

    _getSelectedLabel() {
        const state = this._getState();
        return state.selectedLabel || state.selectedFigure || null;
    },

    _setSelectedLabel(label) {
        if (window.AnnotationState?.selectAnnotation) {
            window.AnnotationState.selectAnnotation(label);
        }
    },

    _saveToHistory() {
        if (typeof window.saveToHistory === 'function') {
            window.saveToHistory();
        }
    },

    _render() {
        window.forceRender?.();
    },

    // Initialization
    
    init() {
        if (this._initialized) {
            window.Debug?.log('EditingHandler', 'Already initialized');
            return;
        }

        // Bind methods to preserve 'this' context
        const methods = ['handleMouseDown', 'handleMouseMove', 'handleMouseUp', 'handleMouseOver',
            'handleMouseOut', 'handleKeyDown', 'handleTouchStart', 'handleTouchMove',
            'handleTouchEnd', 'handleContainerClick'];
        methods.forEach(m => this[`_${m}`] = this[m].bind(this));

        this.attachListeners();
        this._initialized = true;
        this._svgListenersAttached = false;
        window.Debug?.log('EditingHandler', 'Initialized');
    },

    enable() {
        this.enabled = true;
        window.editModeEnabled = true;
        window.Debug?.log('EditingHandler', 'Edit mode enabled');
    },

    disable() {
        this.enabled = false;
        window.editModeEnabled = false;
        this.deselect();
        window.Debug?.log('EditingHandler', 'Edit mode disabled');
    },

    isEnabled() {
        return this.enabled || window.editModeEnabled === true;
    },

    reattachSVGListeners() {
        if (this._svgListenersAttached) return;

        const svg = window.annotationRenderer?._svg;
        if (!svg || !this._handleMouseDown) return;

        svg.addEventListener('mousedown', this._handleMouseDown);
        svg.addEventListener('mouseover', this._handleMouseOver);
        svg.addEventListener('mouseout', this._handleMouseOut);
        svg.addEventListener('touchstart', this._handleTouchStart, { passive: false });
        this._svgListenersAttached = true;
        window.Debug?.log('EditingHandler', 'SVG listeners attached');
    },

    attachListeners() {
        const svg = window.annotationRenderer?._svg;
        if (svg && !this._svgListenersAttached) {
            svg.addEventListener('mousedown', this._handleMouseDown);
            svg.addEventListener('mouseover', this._handleMouseOver);
            svg.addEventListener('mouseout', this._handleMouseOut);
            svg.addEventListener('touchstart', this._handleTouchStart, { passive: false });
            this._svgListenersAttached = true;
        }

        const container = window.DOM?.imageContainer;
        if (container) {
            if (!this._svgListenersAttached) {
                container.addEventListener('mousedown', this._handleMouseDown);
                container.addEventListener('mouseover', this._handleMouseOver);
                container.addEventListener('mouseout', this._handleMouseOut);
                container.addEventListener('touchstart', this._handleTouchStart, { passive: false });
            }
            container.addEventListener('click', this._handleContainerClick);
        }

        document.addEventListener('keydown', this._handleKeyDown, true);
    },

    detachListeners() {
        const svg = window.annotationRenderer?._svg;
        if (svg) {
            svg.removeEventListener('mousedown', this._handleMouseDown);
            svg.removeEventListener('mouseover', this._handleMouseOver);
            svg.removeEventListener('mouseout', this._handleMouseOut);
            svg.removeEventListener('touchstart', this._handleTouchStart);
        }

        const container = window.DOM?.imageContainer;
        if (container) {
            container.removeEventListener('mousedown', this._handleMouseDown);
            container.removeEventListener('mouseover', this._handleMouseOver);
            container.removeEventListener('mouseout', this._handleMouseOut);
            container.removeEventListener('touchstart', this._handleTouchStart);
            container.removeEventListener('click', this._handleContainerClick);
        }

        document.removeEventListener('keydown', this._handleKeyDown, true);
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
        document.removeEventListener('touchmove', this._handleTouchMove);
        document.removeEventListener('touchend', this._handleTouchEnd);

        this._initialized = false;
    },

    // Mouse Event Handlers
    
    handleMouseDown(e) {
        if (!this.isEnabled()) return;
        if (!this._isAnnotationMode()) {
            window.Debug?.log('EditingHandler', 'Not in annotation mode, ignoring mousedown');
            return;
        }

        const target = e.target.closest('[data-annotation]');
        if (!target) {
            window.Debug?.log('EditingHandler', 'No annotation element found at click target');
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const { annotation: label, handle: handleType, pointIndex } = target.dataset;
        window.Debug?.log('EditingHandler', `MouseDown: label=${label}, handleType=${handleType}, pointIndex=${pointIndex}`);
        this._startDrag(e, label, handleType, pointIndex);
    },

    handleContainerClick(e) {
        if (!this._isAnnotationMode()) return;
        if (this._justDragged) {
            this._justDragged = false;
            return;
        }
        if (e.target.closest('[data-annotation]')) return;
        if (e.target.closest('.label-popup, .label-selector, button, input, .toolbar')) return;
        if (window.DrawingHandler?.isDrawingInProgress?.()) return;

        if (this._getSelectedLabel()) {
            this.deselect();
        }
    },

    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        const currentPos = this._eventToImage(e);
        if (currentPos) this._processDrag(currentPos);
    },

    handleMouseUp(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this._endDrag();
    },

    handleMouseOver(e) {
        if (this.isDragging) return;

        const target = e.target.closest('[data-annotation]');
        if (!target) return;

        const label = target.dataset.annotation;
        if (label && window.annotationRenderer?.setHovered) {
            window.annotationRenderer.setHovered(label);
        }
        target.style.cursor = 'pointer';
    },

    handleMouseOut(e) {
        if (this.isDragging) return;

        const target = e.target.closest('[data-annotation]');
        if (!target) return;

        const relatedTarget = e.relatedTarget?.closest('[data-annotation]');
        const currentLabel = target.dataset.annotation;
        const newLabel = relatedTarget?.dataset.annotation;

        if (currentLabel !== newLabel && window.annotationRenderer?.setHovered) {
            window.annotationRenderer.setHovered(newLabel || null);
        }
    },

    // Touch Event Handlers
    
    handleTouchStart(e) {
        if (!this.isEnabled() || !this._isAnnotationMode() || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const annotationEl = target?.closest('[data-annotation]');
        if (!annotationEl) return;

        e.preventDefault();

        const { annotation: label, handle: handleType, pointIndex } = annotationEl.dataset;
        this._touchStartPos = { x: touch.clientX, y: touch.clientY };
        this._isTouchDrag = false;
        this._selectAnnotation(label);

        this.editingLabel = label;
        this.dragHandleType = handleType;
        this.dragPointIndex = pointIndex !== undefined ? parseInt(pointIndex, 10) : -1;

        const annotation = this._getAnnotation(label);
        if (annotation) {
            this.originalData = JSON.parse(JSON.stringify(annotation.data || annotation));
        }

        document.addEventListener('touchmove', this._handleTouchMove, { passive: false });
        document.addEventListener('touchend', this._handleTouchEnd);
        document.addEventListener('touchcancel', this._handleTouchEnd);
    },

    handleTouchMove(e) {
        if (e.touches.length !== 1 || !this.editingLabel) return;
        e.preventDefault();

        const touch = e.touches[0];

        if (!this._isTouchDrag && this._touchStartPos) {
            const dx = touch.clientX - this._touchStartPos.x;
            const dy = touch.clientY - this._touchStartPos.y;
            if (Math.hypot(dx, dy) < this.TOUCH_DRAG_THRESHOLD) return;

            this._isTouchDrag = true;
            this.isDragging = true;
            this.dragStartPos = this._touchEventToImage(touch);

            if (this.dragPointIndex >= 0) {
                this.dragTarget = 'point';
            } else if (this.dragHandleType) {
                this.dragTarget = 'handle';
            } else {
                this.dragTarget = 'annotation';
            }
        }

        if (this._isTouchDrag) {
            const currentPos = this._touchEventToImage(touch);
            if (currentPos) this._processDrag(currentPos);
        }
    },

    handleTouchEnd(e) {
        this._cleanupTouchListeners();
        if (this._isTouchDrag) this._endDrag();

        this._touchStartPos = null;
        this._isTouchDrag = false;
        this.editingLabel = null;
        this.dragHandleType = null;
        this.dragPointIndex = -1;
    },

    _cleanupTouchListeners() {
        document.removeEventListener('touchmove', this._handleTouchMove);
        document.removeEventListener('touchend', this._handleTouchEnd);
        document.removeEventListener('touchcancel', this._handleTouchEnd);
    },

    // Keyboard Event Handlers
    
    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const selectedLabel = this._getSelectedLabel();
        const isMod = e.ctrlKey || e.metaKey;

        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                if (selectedLabel) {
                    e.preventDefault();
                    this.deleteSelected();
                }
                break;

            case 'Escape':
                e.preventDefault();
                this.deselect();
                break;

            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                if (selectedLabel) {
                    e.preventDefault();
                    this.moveWithArrowKey(e.key, e.shiftKey, isMod);
                }
                break;

            case 'z':
            case 'Z':
                if (isMod) {
                    e.preventDefault();
                    e.shiftKey ? this.redo() : this.undo();
                }
                break;

            case 'y':
            case 'Y':
                if (isMod) {
                    e.preventDefault();
                    this.redo();
                }
                break;
        }
    },

    // Drag Operations
    
    _startDrag(e, label, handleType, pointIndex) {
        window.Debug?.log('EditingHandler', `_startDrag: label=${label}, handleType=${handleType}, pointIndex=${pointIndex}`);
        this._selectAnnotation(label);

        const annotation = this._getAnnotation(label);
        if (!annotation) {
            window.Debug?.warn('EditingHandler', `No annotation found for label: ${label}`);
            return;
        }

        window.Debug?.log('EditingHandler', `Annotation found: type=${annotation.type}, data=`, annotation.data || annotation);

        this.isDragging = true;
        this.editingLabel = label;
        this.dragStartPos = this._eventToImage(e);
        this.originalData = JSON.parse(JSON.stringify(annotation.data || annotation));

        const container = window.DOM?.imageContainer;
        if (container) this._containerRect = container.getBoundingClientRect();

        if (pointIndex !== undefined) {
            this.dragTarget = 'point';
            this.dragPointIndex = parseInt(pointIndex, 10);
        } else if (handleType) {
            this.dragTarget = 'handle';
            this.dragHandleType = handleType;
        } else {
            this.dragTarget = 'annotation';
        }

        this._saveToHistory();
        document.addEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('mouseup', this._handleMouseUp);
        this._addDragFeedback();
        this._render();
    },

    _processDrag(currentPos) {
        const label = this.editingLabel || this._getSelectedLabel();
        const annotation = this._getAnnotation(label);
        if (!annotation) return;

        const dx = currentPos.x - this.dragStartPos.x;
        const dy = currentPos.y - this.dragStartPos.y;
        const newData = this.calculateNewData(annotation, dx, dy);

        this._setAnnotation(label, { ...annotation, data: newData }, false);
        this._render();
    },

    async _endDrag() {
        if (!this.isDragging) return;

        if (this._isSaving) {
            window.Debug?.warn('EditingHandler', 'Save already in progress, queueing');
            this._pendingSave = { retryEndDrag: true };
            return;
        }

        try {
            this._isSaving = true;
            this.isDragging = false;
            this._removeMouseListeners();
            this._removeDragFeedback();
            this._justDragged = true;
            await this._saveEditedAnnotation();
        } finally {
            this._cleanupDragState();
            this._processPendingSave();
        }
        this._render();
    },

    _removeMouseListeners() {
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
    },

    async _saveEditedAnnotation() {
        const label = this.editingLabel || this._getSelectedLabel();
        const annotation = this._getAnnotation(label);
        if (!annotation || !window.AnnotationAPI) return;

        try {
            await window.AnnotationAPI.saveAnnotation(
                this._getPatientId(),
                this._getImageName(),
                label,
                annotation.type,
                annotation.data || annotation
            );
            window.showMessage?.(`Updated: ${label}`, 'success');
        } catch (error) {
            window.Debug?.error('EditingHandler', 'Failed to save annotation:', error);
            window.showMessage?.(`Failed to save: ${error.message}`, 'error');
            this._revertToOriginalData(label, annotation);
        }
    },

    _revertToOriginalData(label, annotation) {
        if (this.originalData) {
            this._setAnnotation(label, { ...annotation, data: this.originalData }, false);
        }
    },

    _cleanupDragState() {
        this._isSaving = false;
        this.originalData = null;
        this.editingLabel = null;
        this.dragTarget = null;
        this.dragPointIndex = -1;
        this.dragHandleType = null;
        this._containerRect = null;
    },

    _processPendingSave() {
        if (this._pendingSave?.retryEndDrag) {
            this._pendingSave = null;
            window.Debug?.log('EditingHandler', 'Processing queued save');
            this._endDrag();
        }
    },

    // Data Calculation Methods
    
    calculateNewData(annotation, dx, dy) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
            window.Debug?.error('EditingHandler', `Invalid delta values: dx=${dx}, dy=${dy}`);
            return this.originalData || annotation.data || annotation;
        }

        const { type } = annotation;
        const original = this.originalData;
        window.Debug?.log('EditingHandler', `calculateNewData: dragTarget=${this.dragTarget}, type=${type}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);

        switch (this.dragTarget) {
            case 'annotation':
                return this.moveAnnotation(type, original, dx, dy);
            case 'point':
                window.Debug?.log('EditingHandler', `Moving point ${this.dragPointIndex}`);
                return this.movePoint(type, original, this.dragPointIndex, dx, dy);
            case 'handle':
                window.Debug?.log('EditingHandler', `Resizing with handle: ${this.dragHandleType}`);
                return this.resizeAnnotation(type, original, this.dragHandleType, dx, dy);
            default:
                return original;
        }
    },

    _movePointByDelta(point, dx, dy) {
        const clamped = this._clampToImageBounds(point.x + dx, point.y + dy);
        return { x: clamped.x, y: clamped.y };
    },

    moveAnnotation(type, data, dx, dy) {
        const move = (point) => this._movePointByDelta(point, dx, dy);
        
        switch (type) {
            case 'point':
                return move(data);
            
            case 'line':
                return {
                    start: move(data.start),
                    end: move(data.end)
                };
            
            case 'circle':
                return {
                    center: move(data.center),
                    radius: data.radius
                };
            
            case 'rectangle':
                return {
                    topLeft: move(data.topLeft),
                    bottomRight: move(data.bottomRight)
                };
            
            case 'angle':
                return {
                    point1: move(data.point1),
                    vertex: move(data.vertex),
                    point2: move(data.point2)
                };
            
            case 'polygon':
            case 'freehand':
                return { ...data, points: data.points.map(move) };
            
            default:
                return data;
        }
    },

    movePoint(type, data, pointIndex, dx, dy) {
        const move = (point) => this._movePointByDelta(point, dx, dy);
        
        switch (type) {
            case 'point':
                // Point has only one point, treat as full move
                return move(data);
            
            case 'line': {
                // pointIndex 0 = start, 1 = end
                const isStart = pointIndex === 0;
                return {
                    start: isStart ? move(data.start) : { ...data.start },
                    end: isStart ? { ...data.end } : move(data.end)
                };
            }
            
            case 'circle':
                // pointIndex 0 = center, 1 = edge (radius)
                if (pointIndex === 0) {
                    return { center: move(data.center), radius: data.radius };
                }
                // Moving edge point changes radius
                const edgeX = data.center.x + data.radius + dx;
                const edgeY = data.center.y + dy;
                const newRadius = Math.max(
                    this.MIN_CIRCLE_RADIUS,
                    Math.hypot(edgeX - data.center.x, edgeY - data.center.y)
                );
                return { center: { ...data.center }, radius: newRadius };
            
            case 'rectangle':
                return this._moveRectangleCorner(data, pointIndex, dx, dy);
            
            case 'angle':
                // pointIndex: 0=point1, 1=vertex, 2=point2
                return {
                    point1: pointIndex === 0 ? move(data.point1) : { ...data.point1 },
                    vertex: pointIndex === 1 ? move(data.vertex) : { ...data.vertex },
                    point2: pointIndex === 2 ? move(data.point2) : { ...data.point2 }
                };
            
            case 'polygon':
            case 'freehand':
                if (pointIndex < 0 || pointIndex >= data.points.length) return data;
                return {
                    ...data,
                    points: data.points.map((p, i) => i === pointIndex ? move(p) : { ...p })
                };
            
            default:
                return data;
        }
    },

    _moveRectangleCorner(data, pointIndex, dx, dy) {
        const tl = { ...data.topLeft };
        const br = { ...data.bottomRight };
        const minSize = this.MIN_RECTANGLE_SIZE;
        
        // Apply delta based on which corner is being moved
        // 0=topLeft, 1=topRight, 2=bottomRight, 3=bottomLeft
        const moveLeft = pointIndex === 0 || pointIndex === 3;
        const moveTop = pointIndex === 0 || pointIndex === 1;
        const moveRight = pointIndex === 1 || pointIndex === 2;
        const moveBottom = pointIndex === 2 || pointIndex === 3;
        
        if (moveLeft) tl.x = Math.min(tl.x + dx, br.x - minSize);
        if (moveTop) tl.y = Math.min(tl.y + dy, br.y - minSize);
        if (moveRight) br.x = Math.max(br.x + dx, tl.x + minSize);
        if (moveBottom) br.y = Math.max(br.y + dy, tl.y + minSize);
        
        const clampedTL = this._clampToImageBounds(tl.x, tl.y);
        const clampedBR = this._clampToImageBounds(br.x, br.y);
        
        return {
            topLeft: { x: clampedTL.x, y: clampedTL.y },
            bottomRight: { x: clampedBR.x, y: clampedBR.y }
        };
    },

    resizeAnnotation(type, data, handleType, dx, dy) {
        switch (type) {
            case 'circle': {
                // Map handle direction to radius delta
                const radiusDeltas = { n: -dy, s: dy, e: dx, w: -dx };
                const radiusDelta = radiusDeltas[handleType] ?? (Math.abs(dx) > Math.abs(dy) ? dx : dy);
                const newRadius = Math.max(this.MIN_CIRCLE_RADIUS, data.radius + radiusDelta);
                return { center: { ...data.center }, radius: newRadius };
            }
            
            case 'rectangle': {
                const tl = { ...data.topLeft };
                const br = { ...data.bottomRight };
                const minSize = this.MIN_RECTANGLE_SIZE;
                
                // Apply edge movements based on handle type (n, s, e, w, ne, nw, se, sw)
                if (handleType.includes('n')) tl.y = Math.min(tl.y + dy, br.y - minSize);
                if (handleType.includes('s')) br.y = Math.max(br.y + dy, tl.y + minSize);
                if (handleType.includes('w')) tl.x = Math.min(tl.x + dx, br.x - minSize);
                if (handleType.includes('e')) br.x = Math.max(br.x + dx, tl.x + minSize);
                
                const clampedTL = this._clampToImageBounds(tl.x, tl.y);
                const clampedBR = this._clampToImageBounds(br.x, br.y);
                
                return {
                    topLeft: { x: clampedTL.x, y: clampedTL.y },
                    bottomRight: { x: clampedBR.x, y: clampedBR.y }
                };
            }
            
            default:
                return data;
        }
    },

    // Arrow Key Movement

    moveWithArrowKey(direction, shiftKey, ctrlKey) {
        const label = this._getSelectedLabel();
        if (!label) return;
        
        const annotation = this._getAnnotation(label);
        if (!annotation) return;
        
        // Determine step size
        let step = this.ARROW_STEP_NORMAL;
        if (shiftKey) step = this.ARROW_STEP_SHIFT;
        if (ctrlKey) step = this.ARROW_STEP_CTRL;
        
        // Calculate delta
        const deltas = {
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 }
        };
        
        const delta = deltas[direction];
        if (!delta) return;
        
        // Save current state to history before modifying
        this._saveToHistory();
        
        // Get the data - could be annotation.data or just annotation for legacy format
        const data = annotation.data || annotation;
        
        // Calculate new data
        const newData = this.moveAnnotation(annotation.type, data, delta.x, delta.y);
        
        // Update state
        this._setAnnotation(label, {
            ...annotation,
            data: newData
        }, false);
        
        // Save to server (debounced)
        this._debouncedSave(label, annotation.type, newData);
        
        // Show feedback
        const stepLabel = shiftKey ? '10px' : ctrlKey ? '0.5px' : '1px';
        window.showMessage?.(`Moved ${stepLabel}`, 'info', 500);
        
        this._render();
    },

    _saveTimeout: null,

    _debouncedSave(label, type, data) {
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
        }
        
        this._saveTimeout = setTimeout(async () => {
            try {
                await window.AnnotationAPI?.saveAnnotation(
                    this._getPatientId(),
                    this._getImageName(),
                    label,
                    type,
                    data
                );
            } catch (error) {
                window.Debug?.error('EditingHandler', 'Failed to save after arrow move:', error);
            }
        }, this.ARROW_SAVE_DEBOUNCE);
    },

    // Selection and Deletion

    async deleteSelected() {
        const label = this._getSelectedLabel();
        if (!label) return;

        // No confirmation dialog - undo is available (US-020)

        // Save to history before deleting
        this._saveToHistory();

        let backendDeleteFailed = false;
        try {
            await window.AnnotationAPI?.deleteAnnotation(
                this._getPatientId(),
                this._getImageName(),
                label
            );
        } catch (error) {
            // If backend returns 404 (not found), annotation may only exist locally
            // Still proceed with local cleanup
            if (error.message?.includes('not found')) {
                window.Debug?.warn('EditingHandler', `Annotation "${label}" not in backend, removing locally`);
                backendDeleteFailed = true;
            } else {
                window.Debug?.error('EditingHandler', 'Failed to delete annotation:', error);
                window.showMessage?.(`Failed to delete: ${error.message}`, 'error');
                return;
            }
        }

        // Always clean up local state
        this._removeAnnotation(label);
        this._setSelectedLabel(null);

        // Also clear selectedAnnotation if using new state
        const state = this._getState();
        if (state.selectedAnnotation !== undefined) {
            state.selectedAnnotation = null;
        }

        this._render();

        if (backendDeleteFailed) {
            window.showMessage?.(`Removed local annotation: ${label}`, 'info');
        } else {
            window.showMessage?.(`Deleted: ${label}`, 'success');
        }
    },

    deselect() {
        const state = this._getState();
        
        this._setSelectedLabel(null);
        
        // Clear additional selection state if using new state
        if (state.selectedAnnotation !== undefined) {
            state.selectedAnnotation = null;
        }
        if (state.selectedPointIndex !== undefined) {
            state.selectedPointIndex = -1;
        }
        
        // Update renderer visual state
        if (window.annotationRenderer?.setSelected) {
            window.annotationRenderer.setSelected(null);
        }
        
        this._render();
        window.showMessage?.('Selection cleared', 'info', 500);
    },

    // Undo/Redo

    undo() {
        // Delegate to global undo function which handles AnnotationState/AppStore priority
        if (typeof window.undo === 'function') {
            window.undo();
            // Sync with server after undo
            this._syncAfterUndo();
        } else {
            window.showMessage?.('Nothing to undo', 'info');
        }
    },

    redo() {
        // Delegate to global redo function which handles AnnotationState/AppStore priority
        if (typeof window.redo === 'function') {
            window.redo();
            // Sync with server after redo
            this._syncAfterUndo();
        } else {
            window.showMessage?.('Nothing to redo', 'info');
        }
    },

    async _syncAfterUndo() {
        const state = this._getState();
        const annotations = state.annotations;
        if (!annotations) return;
        
        try {
            await window.AnnotationAPI?.batchSaveAnnotations(
                this._getPatientId(),
                this._getImageName(),
                annotations
            );
        } catch (error) {
            window.Debug?.error('EditingHandler', 'Failed to sync after undo/redo:', error);
        }
    },

    // Helper Methods

    _isAnnotationMode() {
        return window.AnnotationState?.isAnnotationMode ?? true;
    },

    _selectAnnotation(label) {
        const state = this._getState();
        
        this._setSelectedLabel(label);
        
        if (typeof state.selectAnnotation === 'function') {
            state.selectAnnotation(label);
        } else if (state.selectedAnnotation !== undefined) {
            this._setSelectedLabel(label);
        }

        if (window.annotationRenderer?.setSelected) {
            window.annotationRenderer.setSelected(label);
        }
    },

    _eventToImage(e) {
        return window.viewport?.eventToImage(e) ?? null;
    },

    _touchEventToImage(touch) {
        const container = window.DOM?.imageContainer;
        if (!container) return null;
        const rect = this._containerRect || container.getBoundingClientRect();
        return window.viewport?.screenToImage(touch.clientX - rect.left, touch.clientY - rect.top) ?? null;
    },

    _clampToImageBounds(x, y) {
        const width = window.AnnotationState?.imageWidth || Infinity;
        const height = window.AnnotationState?.imageHeight || Infinity;
        return {
            x: Math.max(0, Math.min(width, x)),
            y: Math.max(0, Math.min(height, y))
        };
    },

    _addDragFeedback() {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.annotationRenderer?._svg?.classList.add('dragging');
    },

    _removeDragFeedback() {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.annotationRenderer?._svg?.classList.remove('dragging');
    }
};

// Export to Global Scope

if (typeof window !== 'undefined') {
    window.EditingHandler = EditingHandler;

    function initWhenReady() {
        const hasDOM = window.DOM?.imageContainer || document.querySelector('.image-container');
        const hasRenderer = window.annotationRenderer?._svg;

        if (hasDOM || hasRenderer) {
            EditingHandler.init();
        } else {
            initWhenReady._attempts = (initWhenReady._attempts || 0) + 1;
            if (initWhenReady._attempts < 10) {
                requestAnimationFrame(initWhenReady);
            } else {
                window.Debug?.warn('EditingHandler', 'Initializing without all dependencies ready');
                EditingHandler.init();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
        requestAnimationFrame(initWhenReady);
    }
}
