/**
 * EditingHandler - Manages annotation selection and modification
 * @module annotations/editing
 * 
 * This module provides a comprehensive editing system for annotations:
 * - Drag to move entire annotations
 * - Drag specific points to reshape annotations  
 * - Drag handles to resize circles/rectangles
 * - Arrow key movement for fine adjustments
 * - Touch support for mobile editing
 * - Undo/redo integration
 * - Visual feedback during drag operations
 * 
 * Compatibility: Works with both the new AnnotationState/AnnotationRenderer
 * and the legacy STATE/renderAnnotations() systems.
 * 
 * Dependencies:
 * - constants.js (EditingConstants, Debug)
 */

// ============================================================================
// EditingHandler Module
// ============================================================================

const EditingHandler = {
    // ========================================================================
    // State Properties
    // ========================================================================
    
    /** Whether a drag operation is in progress */
    isDragging: false,
    
    /** Type of drag: 'annotation', 'point', 'handle' */
    dragTarget: null,
    
    /** Index of point being dragged (for multi-point annotations) */
    dragPointIndex: -1,
    
    /** Type of resize handle being dragged */
    dragHandleType: null,
    
    /** Starting position for drag operation in image coordinates */
    dragStartPos: null,
    
    /** Original annotation data before drag (for undo/revert) */
    originalData: null,
    
    /** Label of the annotation being edited */
    editingLabel: null,
    
    /** Cached container rect for performance */
    _containerRect: null,
    
    /** Whether handler is initialized */
    _initialized: false,
    
    /** Flag to prevent deselection right after drag */
    _justDragged: false,
    
    // Bound event handler references for cleanup
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
    
    // ========================================================================
    // Constants Accessors (using shared constants with fallbacks)
    // ========================================================================
    
    /** Get minimum circle radius */
    get MIN_CIRCLE_RADIUS() {
        return window.EditingConstants?.MIN_CIRCLE_RADIUS ?? 5;
    },
    
    /** Get minimum rectangle size */
    get MIN_RECTANGLE_SIZE() {
        return window.EditingConstants?.MIN_RECTANGLE_SIZE ?? 10;
    },
    
    /** Get arrow step normal */
    get ARROW_STEP_NORMAL() {
        return window.EditingConstants?.ARROW_STEP_NORMAL ?? 1;
    },
    
    /** Get arrow step with shift */
    get ARROW_STEP_SHIFT() {
        return window.EditingConstants?.ARROW_STEP_SHIFT ?? 10;
    },
    
    /** Get arrow step with ctrl */
    get ARROW_STEP_CTRL() {
        return window.EditingConstants?.ARROW_STEP_CTRL ?? 0.5;
    },
    
    /** Get touch drag threshold */
    get TOUCH_DRAG_THRESHOLD() {
        return window.EditingConstants?.TOUCH_DRAG_THRESHOLD ?? 5;
    },
    
    /** Get arrow save debounce time */
    get ARROW_SAVE_DEBOUNCE() {
        return window.EditingConstants?.ARROW_SAVE_DEBOUNCE ?? 300;
    },
    
    // ========================================================================
    // State Accessors (compatibility layer)
    // ========================================================================
    
    /**
     * Get the state object (new or legacy)
     * @returns {Object} State object
     */
    _getState() {
        return window.AnnotationState || window.STATE || {};
    },
    
    /**
     * Get patient ID from state
     * @returns {string|undefined}
     */
    _getPatientId() {
        const state = this._getState();
        return state.patientId || window.patientId || window.STATE?.patientId || window.__APP_CONFIG__?.patientId;
    },
    
    /**
     * Get image name from state
     * @returns {string|undefined}
     */
    _getImageName() {
        const state = this._getState();
        return state.imageName || window.imageName || window.STATE?.imageName || window.__APP_CONFIG__?.imageName;
    },
    
    /**
     * Get an annotation by label
     * @param {string} label - Annotation label
     * @returns {Object|null} Annotation object
     */
    _getAnnotation(label) {
        const state = this._getState();
        if (state.getAnnotation) {
            return state.getAnnotation(label);
        }
        return state.annotations?.[label] || null;
    },
    
    /**
     * Set an annotation
     * @param {string} label - Annotation label
     * @param {Object} data - Annotation data
     * @param {boolean} [saveToServer=false] - Whether to save to server
     */
    _setAnnotation(label, data, saveToServer = false) {
        const state = this._getState();
        if (state.setAnnotation) {
            state.setAnnotation(label, data, saveToServer);
        } else if (state.annotations) {
            state.annotations = {
                ...state.annotations,
                [label]: data
            };
        }
    },
    
    /**
     * Remove an annotation
     * @param {string} label - Annotation label
     */
    _removeAnnotation(label) {
        const state = this._getState();
        if (state.removeAnnotation) {
            state.removeAnnotation(label);
        } else if (state.annotations) {
            const { [label]: _, ...rest } = state.annotations;
            state.annotations = rest;
        }
    },
    
    /**
     * Get selected label
     * @returns {string|null}
     */
    _getSelectedLabel() {
        const state = this._getState();
        return state.selectedLabel || state.selectedFigure || null;
    },
    
    /**
     * Set selected label
     * @param {string|null} label
     */
    _setSelectedLabel(label) {
        const state = this._getState();
        if ('selectedLabel' in state) {
            state.selectedLabel = label;
        }
        if ('selectedFigure' in state) {
            state.selectedFigure = label;
        }
    },
    
    /**
     * Save current state to history
     */
    _saveToHistory() {
        const state = this._getState();
        if (state.saveToHistory) {
            state.saveToHistory();
        } else if (typeof window.saveToHistory === 'function') {
            window.saveToHistory();
        } else if (window.AppStore?.saveToHistory) {
            window.AppStore.saveToHistory();
        }
    },
    
    /**
     * Trigger a render update
     */
    _render() {
        // Use new renderer singleton first
        if (window.annotationRenderer?.render) {
            const annotations = window.AnnotationState?.annotations || window.STATE?.annotations || {};
            const calibration = window.AnnotationState?.calibration?.pixelsPerMm || null;
            window.annotationRenderer.render(annotations, calibration);
        } else if (typeof window.renderAnnotations === 'function') {
            window.renderAnnotations();
        } else if (typeof window.scheduleRender === 'function') {
            window.scheduleRender();
        }
    },
    
    // ========================================================================
    // Initialization
    // ========================================================================
    
    /**
     * Initialize editing handler
     * Binds event handlers and attaches listeners
     */
    init() {
        if (this._initialized) {
            window.Debug?.log('EditingHandler', 'Already initialized');
            return;
        }
        
        // Bind methods to preserve 'this' context
        this._handleMouseDown = this.handleMouseDown.bind(this);
        this._handleMouseMove = this.handleMouseMove.bind(this);
        this._handleMouseUp = this.handleMouseUp.bind(this);
        this._handleMouseOver = this.handleMouseOver.bind(this);
        this._handleMouseOut = this.handleMouseOut.bind(this);
        this._handleKeyDown = this.handleKeyDown.bind(this);
        this._handleTouchStart = this.handleTouchStart.bind(this);
        this._handleTouchMove = this.handleTouchMove.bind(this);
        this._handleTouchEnd = this.handleTouchEnd.bind(this);
        this._handleContainerClick = this.handleContainerClick.bind(this);
        
        this.attachListeners();
        this._initialized = true;
        
        window.Debug?.log('EditingHandler', 'Initialized');
    },
    
    /**
     * Attach event listeners to annotation elements
     * Uses event delegation on the SVG layer for efficiency
     */
    attachListeners() {
        // Get SVG layer from AnnotationRenderer if available
        const svg = window.AnnotationRenderer?.svg;
        if (svg) {
            svg.addEventListener('mousedown', this._handleMouseDown);
            svg.addEventListener('mouseover', this._handleMouseOver);
            svg.addEventListener('mouseout', this._handleMouseOut);
            svg.addEventListener('touchstart', this._handleTouchStart, { passive: false });
        }
        
        // Also listen on image container as fallback
        const container = window.DOM?.imageContainer;
        if (container) {
            // Don't add duplicate listeners if SVG is inside container
            if (!svg || !container.contains(svg)) {
                container.addEventListener('mousedown', this._handleMouseDown);
                container.addEventListener('mouseover', this._handleMouseOver);
                container.addEventListener('mouseout', this._handleMouseOut);
                container.addEventListener('touchstart', this._handleTouchStart, { passive: false });
            }
            
            // Listen for clicks on container to handle empty space deselection
            container.addEventListener('click', this._handleContainerClick);
        }
        
        // Global keyboard listener - use capture to get events before other handlers
        document.addEventListener('keydown', this._handleKeyDown, true);
    },
    
    /**
     * Detach event listeners (for cleanup)
     */
    detachListeners() {
        const svg = window.AnnotationRenderer?.svg;
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
    
    // ========================================================================
    // Mouse Event Handlers
    // ========================================================================
    
    /**
     * Handle mouse down on annotations
     * Determines what was clicked and starts appropriate drag operation
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseDown(e) {
        // Only handle in annotation mode
        if (!this._isAnnotationMode()) return;
        
        // Find clicked annotation element
        const target = e.target.closest('[data-annotation]');
        if (!target) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const label = target.dataset.annotation;
        const handleType = target.dataset.handle;
        const pointIndex = target.dataset.pointIndex;
        
        this._startDrag(e, label, handleType, pointIndex);
    },
    
    /**
     * Handle click on container for empty space deselection
     * @param {MouseEvent} e - Mouse event
     */
    handleContainerClick(e) {
        // Only handle in annotation mode (not pan mode)
        if (!this._isAnnotationMode()) return;
        
        // Ignore if a drag just happened (we moved the annotation)
        // A small threshold handles minor movement during click
        if (this._justDragged) {
            this._justDragged = false;
            return;
        }
        
        // Ignore if clicking on an annotation element
        const target = e.target.closest('[data-annotation]');
        if (target) return;
        
        // Ignore if clicking on UI elements (popups, buttons, etc.)
        if (e.target.closest('.label-popup, .label-selector, button, input, .toolbar')) {
            return;
        }
        
        // Ignore if a drawing is in progress
        if (window.DrawingHandler?.isDrawingInProgress?.()) {
            return;
        }
        
        // Check if there's a current selection to clear
        const selectedLabel = this._getSelectedLabel();
        if (selectedLabel) {
            this.deselect();
        }
    },
    
    /**
     * Handle mouse move during drag
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        
        const currentPos = this._eventToImage(e);
        if (!currentPos) return;
        
        this._processDrag(currentPos);
    },
    
    /**
     * Handle mouse up - end drag operation
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseUp(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        
        this._endDrag();
    },
    
    /**
     * Handle mouse over for hover highlighting
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseOver(e) {
        // Don't highlight during drag operations
        if (this.isDragging) return;
        
        // Find annotation element under mouse
        const target = e.target.closest('[data-annotation]');
        if (!target) return;
        
        const label = target.dataset.annotation;
        if (!label) return;
        
        // Update hover state in renderer
        if (window.annotationRenderer?.setHovered) {
            window.annotationRenderer.setHovered(label);
        }
        
        // Also update cursor to indicate interactivity
        target.style.cursor = 'pointer';
    },
    
    /**
     * Handle mouse out to clear hover highlighting
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseOut(e) {
        // Don't clear during drag operations
        if (this.isDragging) return;
        
        // Check if we're leaving an annotation element
        const target = e.target.closest('[data-annotation]');
        if (!target) return;
        
        // Check if we're moving to another element within the same annotation
        const relatedTarget = e.relatedTarget?.closest('[data-annotation]');
        const currentLabel = target.dataset.annotation;
        const newLabel = relatedTarget?.dataset.annotation;
        
        // Only clear hover if we're leaving to a different annotation or no annotation
        if (currentLabel !== newLabel) {
            if (window.annotationRenderer?.setHovered) {
                window.annotationRenderer.setHovered(newLabel || null);
            }
        }
    },
    
    // ========================================================================
    // Touch Event Handlers
    // ========================================================================
    
    /**
     * Handle touch start for mobile editing
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        if (!this._isAnnotationMode()) return;
        if (e.touches.length !== 1) return; // Only single touch
        
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const annotationEl = target?.closest('[data-annotation]');
        
        if (!annotationEl) return;
        
        e.preventDefault();
        
        const label = annotationEl.dataset.annotation;
        const handleType = annotationEl.dataset.handle;
        const pointIndex = annotationEl.dataset.pointIndex;
        
        // Store touch start for threshold check
        this._touchStartPos = { x: touch.clientX, y: touch.clientY };
        this._isTouchDrag = false;
        
        // Pre-select the annotation
        this._selectAnnotation(label);
        
        // Store data for potential drag
        this.editingLabel = label;
        this.dragHandleType = handleType;
        this.dragPointIndex = pointIndex !== undefined ? parseInt(pointIndex, 10) : -1;
        
        // Store original data
        const annotation = this._getAnnotation(label);
        if (annotation) {
            this.originalData = JSON.parse(JSON.stringify(annotation.data || annotation));
        }
        
        // Attach touch move/end listeners
        document.addEventListener('touchmove', this._handleTouchMove, { passive: false });
        document.addEventListener('touchend', this._handleTouchEnd);
    },
    
    /**
     * Handle touch move for mobile editing
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        if (e.touches.length !== 1) return;
        if (!this.editingLabel) return;
        
        e.preventDefault();
        
        const touch = e.touches[0];
        
        // Check drag threshold
        if (!this._isTouchDrag && this._touchStartPos) {
            const dx = touch.clientX - this._touchStartPos.x;
            const dy = touch.clientY - this._touchStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.TOUCH_DRAG_THRESHOLD) return;
            
            // Start actual drag
            this._isTouchDrag = true;
            this.isDragging = true;
            this.dragStartPos = this._touchEventToImage(touch);
            
            // Determine drag target
            if (this.dragPointIndex >= 0) {
                this.dragTarget = 'point';
            } else if (this.dragHandleType) {
                this.dragTarget = 'handle';
            } else {
                this.dragTarget = 'annotation';
            }
        }
        
        if (!this._isTouchDrag) return;
        
        const currentPos = this._touchEventToImage(touch);
        if (currentPos) {
            this._processDrag(currentPos);
        }
    },
    
    /**
     * Handle touch end for mobile editing
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        document.removeEventListener('touchmove', this._handleTouchMove);
        document.removeEventListener('touchend', this._handleTouchEnd);
        
        if (this._isTouchDrag) {
            this._endDrag();
        }
        
        this._touchStartPos = null;
        this._isTouchDrag = false;
        this.editingLabel = null;
        this.dragHandleType = null;
        this.dragPointIndex = -1;
    },
    
    // ========================================================================
    // Keyboard Event Handlers
    // ========================================================================
    
    /**
     * Handle keyboard for selection and movement
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        // Skip if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const selectedLabel = this._getSelectedLabel();
        
        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                if (selectedLabel) {
                    e.preventDefault();
                    this.deleteSelected();
                }
                return;
                
            case 'Escape':
                e.preventDefault();
                this.deselect();
                return;
                
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                if (selectedLabel) {
                    e.preventDefault();
                    this.moveWithArrowKey(e.key, e.shiftKey, e.ctrlKey || e.metaKey);
                }
                return;
                
            case 'z':
            case 'Z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                return;
                
            case 'y':
            case 'Y':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.redo();
                }
                return;
        }
    },
    
    // ========================================================================
    // Drag Operations
    // ========================================================================
    
    /**
     * Start a drag operation
     * @private
     * @param {Event} e - The triggering event
     * @param {string} label - Annotation label
     * @param {string} handleType - Handle type if dragging a handle
     * @param {string} pointIndex - Point index if dragging a point
     */
    _startDrag(e, label, handleType, pointIndex) {
        // Select the annotation
        this._selectAnnotation(label);
        
        // Get annotation data
        const annotation = this._getAnnotation(label);
        if (!annotation) return;
        
        // Start drag operation
        this.isDragging = true;
        this.editingLabel = label;
        this.dragStartPos = this._eventToImage(e);
        this.originalData = JSON.parse(JSON.stringify(annotation.data || annotation));
        
        // Cache container rect
        const container = window.DOM?.imageContainer;
        if (container) {
            this._containerRect = container.getBoundingClientRect();
        }
        
        // Determine drag target
        if (pointIndex !== undefined) {
            this.dragTarget = 'point';
            this.dragPointIndex = parseInt(pointIndex, 10);
        } else if (handleType) {
            this.dragTarget = 'handle';
            this.dragHandleType = handleType;
        } else {
            this.dragTarget = 'annotation';
        }
        
        // Save state to history before modification
        this._saveToHistory();
        
        // Attach move/up listeners
        document.addEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('mouseup', this._handleMouseUp);
        
        // Add visual feedback
        this._addDragFeedback();
        
        this._render();
    },
    
    /**
     * Process drag movement
     * @private
     * @param {{x: number, y: number}} currentPos - Current position in image coordinates
     */
    _processDrag(currentPos) {
        const label = this.editingLabel || this._getSelectedLabel();
        const annotation = this._getAnnotation(label);
        if (!annotation) return;
        
        const dx = currentPos.x - this.dragStartPos.x;
        const dy = currentPos.y - this.dragStartPos.y;
        
        const newData = this.calculateNewData(annotation, dx, dy);
        
        // Update annotation in state (don't save to server yet)
        this._setAnnotation(label, {
            ...annotation,
            data: newData
        }, false); // Don't notify server during drag
        
        this._render();
    },
    
    /**
     * End drag operation and save to server
     * @private
     */
    async _endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
        
        // Remove visual feedback
        this._removeDragFeedback();
        
        // Mark that we just finished dragging to prevent accidental deselection
        this._justDragged = true;
        
        // Save to server
        const label = this.editingLabel || this._getSelectedLabel();
        const annotation = this._getAnnotation(label);
        
        if (annotation && window.AnnotationAPI) {
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
                
                // Revert to original data on error
                if (this.originalData) {
                    this._setAnnotation(label, {
                        ...annotation,
                        data: this.originalData
                    }, false);
                }
            }
        }
        
        // Reset state
        this.originalData = null;
        this.editingLabel = null;
        this.dragTarget = null;
        this.dragPointIndex = -1;
        this.dragHandleType = null;
        this._containerRect = null;
        
        this._render();
    },
    
    // ========================================================================
    // Data Calculation Methods
    // ========================================================================
    
    /**
     * Calculate new annotation data based on drag
     * @param {Object} annotation - The annotation object
     * @param {number} dx - Delta X in image coordinates
     * @param {number} dy - Delta Y in image coordinates
     * @returns {Object} New data object
     */
    calculateNewData(annotation, dx, dy) {
        const type = annotation.type;
        const original = this.originalData;
        
        switch (this.dragTarget) {
            case 'annotation':
                return this.moveAnnotation(type, original, dx, dy);
            case 'point':
                return this.movePoint(type, original, this.dragPointIndex, dx, dy);
            case 'handle':
                return this.resizeAnnotation(type, original, this.dragHandleType, dx, dy);
            default:
                return original;
        }
    },
    
    /**
     * Helper to move a point by delta and clamp to bounds
     * @private
     * @param {{x: number, y: number}} point - Original point
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     * @returns {{x: number, y: number}} New clamped point
     */
    _movePointByDelta(point, dx, dy) {
        const clamped = this._clampToImageBounds(point.x + dx, point.y + dy);
        return { x: clamped.x, y: clamped.y };
    },
    
    /**
     * Move entire annotation by delta
     * @param {string} type - Annotation type
     * @param {Object} data - Original data
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     * @returns {Object} New data
     */
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
    
    /**
     * Move a specific point within an annotation
     * @param {string} type - Annotation type
     * @param {Object} data - Original data
     * @param {number} pointIndex - Index of point to move
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     * @returns {Object} New data
     */
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
    
    /**
     * Helper to move a rectangle corner
     * @private
     */
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
    
    /**
     * Resize annotation using handle
     * @param {string} type - Annotation type
     * @param {Object} data - Original data
     * @param {string} handleType - Handle type (n, s, e, w, ne, nw, se, sw, radius)
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     * @returns {Object} New data
     */
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
    
    // ========================================================================
    // Arrow Key Movement
    // ========================================================================
    
    /**
     * Move selected annotation with arrow keys
     * @param {string} direction - Arrow key direction
     * @param {boolean} shiftKey - Shift key pressed (larger step)
     * @param {boolean} ctrlKey - Ctrl key pressed (smaller step)
     */
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
    
    /** Debounce timer for arrow key saves */
    _saveTimeout: null,
    
    /**
     * Debounced save to server for arrow key movement
     * @private
     */
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
    
    // ========================================================================
    // Selection and Deletion
    // ========================================================================
    
    /**
     * Delete selected annotation
     */
    async deleteSelected() {
        const label = this._getSelectedLabel();
        if (!label) return;
        
        // No confirmation dialog - undo is available (US-020)
        
        // Save to history before deleting
        this._saveToHistory();
        
        try {
            await window.AnnotationAPI?.deleteAnnotation(
                this._getPatientId(),
                this._getImageName(),
                label
            );
            
            this._removeAnnotation(label);
            this._setSelectedLabel(null);
            
            // Also clear selectedAnnotation if using new state
            const state = this._getState();
            if (state.selectedAnnotation !== undefined) {
                state.selectedAnnotation = null;
            }
            
            this._render();
            window.showMessage?.(`Deleted: ${label}`, 'success');
        } catch (error) {
            window.Debug?.error('EditingHandler', 'Failed to delete annotation:', error);
            window.showMessage?.(`Failed to delete: ${error.message}`, 'error');
        }
    },
    
    /**
     * Deselect current annotation
     */
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
    
    // ========================================================================
    // Undo/Redo
    // ========================================================================
    
    /**
     * Undo last change
     */
    undo() {
        const state = this._getState();
        
        // Try AnnotationState's undo first
        if (state.undo && state.undo()) {
            this._render();
            window.showMessage?.('Undo successful', 'success');
            
            // Sync with server
            this._syncAfterUndo();
            return;
        }
        
        // Fall back to legacy history if available
        if (typeof window.undo === 'function') {
            window.undo();
            return;
        }
        
        window.showMessage?.('Nothing to undo', 'info');
    },
    
    /**
     * Redo last undone change
     */
    redo() {
        const state = this._getState();
        
        // Try AnnotationState's redo first
        if (state.redo && state.redo()) {
            this._render();
            window.showMessage?.('Redo successful', 'success');
            
            // Sync with server
            this._syncAfterUndo();
            return;
        }
        
        // Fall back to legacy redo if available
        if (typeof window.redo === 'function') {
            window.redo();
            return;
        }
        
        window.showMessage?.('Nothing to redo', 'info');
    },
    
    /**
     * Sync state with server after undo/redo
     * @private
     */
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
    
    // ========================================================================
    // Helper Methods
    // ========================================================================
    
    /**
     * Check if in annotation mode
     * @private
     * @returns {boolean}
     */
    _isAnnotationMode() {
        // Check AnnotationState first, fall back to STATE
        return window.AnnotationState?.isAnnotationMode ?? 
               window.STATE?.isAnnotationMode ?? 
               true;
    },
    
    /**
     * Select an annotation
     * @private
     * @param {string} label - Annotation label
     */
    _selectAnnotation(label) {
        const state = this._getState();
        
        this._setSelectedLabel(label);
        
        // Use the selectAnnotation method if available (preferred)
        if (typeof state.selectAnnotation === 'function') {
            state.selectAnnotation(label);
        } else if (state.selectedAnnotation !== undefined) {
            // Legacy fallback - just set the label
            this._setSelectedLabel(label);
        }
        
        // Update renderer visual state
        if (window.annotationRenderer?.setSelected) {
            window.annotationRenderer.setSelected(label);
        }
    },
    
    /**
     * Convert event to image coordinates
     * @private
     * @param {MouseEvent} e - Mouse event
     * @returns {{x: number, y: number}|null}
     */
    _eventToImage(e) {
        if (window.viewport?.eventToImage) {
            return window.viewport.eventToImage(e);
        }
        
        // Fallback calculation
        const container = window.DOM?.imageContainer;
        if (!container) return null;
        
        const rect = this._containerRect || container.getBoundingClientRect();
        const zoom = window.STATE?.currentZoom || 1;
        const translateX = window.STATE?.translateX || 0;
        const translateY = window.STATE?.translateY || 0;
        
        return {
            x: (e.clientX - rect.left - translateX) / zoom,
            y: (e.clientY - rect.top - translateY) / zoom
        };
    },
    
    /**
     * Convert touch to image coordinates
     * @private
     * @param {Touch} touch - Touch object
     * @returns {{x: number, y: number}|null}
     */
    _touchEventToImage(touch) {
        const container = window.DOM?.imageContainer;
        if (!container) return null;
        
        const rect = this._containerRect || container.getBoundingClientRect();
        const zoom = window.STATE?.currentZoom || window.AnnotationState?.calibration?.pixelsPerMm || 1;
        const translateX = window.STATE?.translateX || 0;
        const translateY = window.STATE?.translateY || 0;
        
        if (window.viewport?.displayToImage) {
            const containerX = touch.clientX - rect.left;
            const containerY = touch.clientY - rect.top;
            return window.viewport.displayToImage(containerX, containerY);
        }
        
        return {
            x: (touch.clientX - rect.left - translateX) / zoom,
            y: (touch.clientY - rect.top - translateY) / zoom
        };
    },
    
    /**
     * Clamp coordinates to image bounds
     * @private
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {{x: number, y: number}}
     */
    _clampToImageBounds(x, y) {
        const width = window.STATE?.naturalWidth || 
                      window.AnnotationState?.imageWidth || 
                      Infinity;
        const height = window.STATE?.naturalHeight || 
                       window.AnnotationState?.imageHeight || 
                       Infinity;
        
        return {
            x: Math.max(0, Math.min(width, x)),
            y: Math.max(0, Math.min(height, y))
        };
    },
    
    /**
     * Add visual feedback during drag
     * @private
     */
    _addDragFeedback() {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        
        // Add dragging class to annotation element
        const svg = window.AnnotationRenderer?.svg;
        if (svg) {
            svg.classList.add('dragging');
        }
    },
    
    /**
     * Remove visual feedback after drag
     * @private
     */
    _removeDragFeedback() {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        const svg = window.AnnotationRenderer?.svg;
        if (svg) {
            svg.classList.remove('dragging');
        }
    }
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.EditingHandler = EditingHandler;
    
    /**
     * Initialize EditingHandler when dependencies are ready.
     * Uses requestAnimationFrame for better timing than setTimeout,
     * ensuring the browser has completed layout and other scripts have run.
     */
    function initWhenReady() {
        // Check if essential dependencies are available
        const hasDOM = window.DOM?.imageContainer || document.querySelector('.image-container');
        const hasRenderer = window.AnnotationRenderer?.svg;
        
        if (hasDOM || hasRenderer) {
            EditingHandler.init();
        } else {
            // Dependencies not ready - wait for next frame and try again
            // Use a counter to prevent infinite loops
            initWhenReady._attempts = (initWhenReady._attempts || 0) + 1;
            if (initWhenReady._attempts < 10) {
                requestAnimationFrame(initWhenReady);
            } else {
                // After 10 attempts (~160ms at 60fps), initialize anyway
                // The handler will gracefully handle missing elements
                window.Debug?.warn('EditingHandler', 'Initializing without all dependencies ready');
                EditingHandler.init();
            }
        }
    }
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
        // DOM already ready, use requestAnimationFrame for next paint
        requestAnimationFrame(initWhenReady);
    }
}
