/**
 * DrawingHandler - Manages annotation creation through mouse/touch clicks
 * @module annotations/drawing
 * 
 * This module handles the complete drawing flow:
 * 1. User selects a tool (point, line, circle, etc.)
 * 2. User clicks on image
 * 3. LabelSelector popup appears - user selects a label
 * 4. Points are collected based on tool requirements
 * 5. Annotation is completed and saved
 * 
 * Features:
 * - Multi-click annotation drawing
 * - Freehand drawing with drag
 * - Polygon completion via double-click or Enter key
 * - Touch support for mobile devices
 * - Real-time preview during drawing
 * - Coordinate system transformation via viewport
 * 
 * Dependencies:
 * - constants.js (DrawingConstants, Debug)
 * - types.js (AnnotationType)
 */

// ============================================================================
// Drawing Handler Object
// ============================================================================

const DrawingHandler = {
    // ========================================================================
    // State
    // ========================================================================

    /**
     * Whether drawing mode is active
     * @type {boolean}}
     */
    isActive: false,

    /**
     * Preview point for real-time feedback during drawing
     * @type {{x: number, y: number}|null}
     */
    previewPoint: null,

    /**
     * Timestamp of last click for double-click detection
     * @type {number}
     */
    lastClickTime: 0,

    /**
     * Coordinates of last click for double-click detection
     * @type {{x: number, y: number}|null}
     */
    lastClickCoords: null,

    // ========================================================================
    // Bound Event Handlers (for cleanup)
    // ========================================================================

    _handleClick: null,
    _handleMouseMove: null,
    _handleMouseDown: null,
    _handleMouseUp: null,
    _handleKeyDown: null,
    _handleTouchStart: null,
    _handleTouchMove: null,
    _handleTouchEnd: null,
    _handleDoubleClick: null,

    // ========================================================================
    // Initialization
    // ========================================================================

    // ========================================================================
    // Constants Accessors (using shared constants with fallbacks)
    // ========================================================================

    /** Get AnnotationType enum with fallback */
    get _types() {
        return window.AnnotationType || {};
    },

    /** Get double-click threshold */
    get DOUBLE_CLICK_THRESHOLD() {
        return window.DrawingConstants?.DOUBLE_CLICK_THRESHOLD ?? 300;
    },

    /** Get double-click distance */
    get DOUBLE_CLICK_DISTANCE() {
        return window.DrawingConstants?.DOUBLE_CLICK_DISTANCE ?? 10;
    },

    /**
     * Initialize drawing handler
     * Binds event handlers to preserve 'this' context
     */
    init() {
        this._handleClick = this.handleClick.bind(this);
        this._handleMouseMove = this.handleMouseMove.bind(this);
        this._handleMouseDown = this.handleMouseDown.bind(this);
        this._handleMouseUp = this.handleMouseUp.bind(this);
        this._handleKeyDown = this.handleKeyDown.bind(this);
        this._handleTouchStart = this.handleTouchStart.bind(this);
        this._handleTouchMove = this.handleTouchMove.bind(this);
        this._handleTouchEnd = this.handleTouchEnd.bind(this);
        this._handleDoubleClick = this.handleDoubleClick.bind(this);

        window.Debug?.log('DrawingHandler', 'Initialized');
    },

    // ========================================================================
    // Activation / Deactivation
    // ========================================================================

    /**
     * Activate drawing mode for a specific tool
     * @param {string} tool - The annotation type to draw (from AnnotationType)
     */
    activate(tool) {
        // Validate tool
        const normalizedTool = tool?.toLowerCase();
        if (!window.AnnotationType || !Object.values(window.AnnotationType).includes(normalizedTool)) {
            window.Debug?.error('DrawingHandler', `Unknown tool: ${tool}`);
            return;
        }

        // Already active with same tool
        if (this.isActive && window.AnnotationState?.currentTool === normalizedTool) {
            return;
        }

        // Deactivate any existing drawing
        if (this.isActive) {
            this.deactivate();
        }

        this.isActive = true;

        // Update state
        if (window.AnnotationState) {
            window.AnnotationState.currentTool = normalizedTool;
            window.AnnotationState.clearPending();
        }

        // Attach event listeners
        this._attachEventListeners();

        // Update cursor
        this.updateCursor();

        window.Debug?.log('DrawingHandler', `Activated with tool: ${normalizedTool}`);
    },

    /**
     * Deactivate drawing mode
     */
    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this.previewPoint = null;
        this.lastClickTime = 0;
        this.lastClickCoords = null;

        // Clear pending state
        if (window.AnnotationState) {
            window.AnnotationState.clearPending();
            window.AnnotationState.selectedLabel = null;
        }

        // Remove event listeners
        this._removeEventListeners();

        // Reset cursor
        const container = window.DOM?.imageContainer;
        if (container) {
            container.style.cursor = 'default';
        }

        // Re-render to clear previews
        this._triggerRender();

        window.Debug?.log('DrawingHandler', 'Deactivated');
    },

    /**
     * Attach event listeners to the container
     * @private
     */
    _attachEventListeners() {
        // Always clean up first to prevent memory leaks
        this._removeEventListeners();

        const container = window.DOM?.imageContainer;
        if (!container) {
            window.Debug?.warn('DrawingHandler', 'No image container found');
            return;
        }

        // Mouse events
        container.addEventListener('click', this._handleClick);
        container.addEventListener('mousemove', this._handleMouseMove);
        container.addEventListener('mousedown', this._handleMouseDown);
        container.addEventListener('mouseup', this._handleMouseUp);
        container.addEventListener('dblclick', this._handleDoubleClick);

        // Touch events
        container.addEventListener('touchstart', this._handleTouchStart, { passive: false });
        container.addEventListener('touchmove', this._handleTouchMove, { passive: false });
        container.addEventListener('touchend', this._handleTouchEnd);

        // Keyboard events (global)
        document.addEventListener('keydown', this._handleKeyDown);
    },

    /**
     * Remove event listeners from the container
     * @private
     */
    _removeEventListeners() {
        const container = window.DOM?.imageContainer;
        if (container) {
            container.removeEventListener('click', this._handleClick);
            container.removeEventListener('mousemove', this._handleMouseMove);
            container.removeEventListener('mousedown', this._handleMouseDown);
            container.removeEventListener('mouseup', this._handleMouseUp);
            container.removeEventListener('dblclick', this._handleDoubleClick);
            container.removeEventListener('touchstart', this._handleTouchStart);
            container.removeEventListener('touchmove', this._handleTouchMove);
            container.removeEventListener('touchend', this._handleTouchEnd);
        }
        document.removeEventListener('keydown', this._handleKeyDown);
    },

    // ========================================================================
    // Mouse Event Handlers
    // ========================================================================

    /**
     * Handle click on the image container
     * @param {MouseEvent} e - Mouse event
     */
    handleClick(e) {
        if (!this.isActive) return;

        // Check if in annotation mode
        if (window.AnnotationState && !window.AnnotationState.isAnnotationMode) return;

        // Ignore if popup is open
        if (window.LabelSelector?.isOpen) return;
        if (window.LabelPopup?.isOpen) return;

        // Get image coordinates
        const coords = window.viewport?.eventToImage(e);
        if (!coords) return;

        // Check bounds
        if (!window.viewport?.isWithinBounds(coords.x, coords.y)) {
            window.showMessage?.('Click within image bounds', 'warning');
            return;
        }

        // Detect double-click manually for polygon completion
        const now = Date.now();
        if (this.lastClickCoords &&
            now - this.lastClickTime < this.DOUBLE_CLICK_THRESHOLD &&
            this._distance(coords, this.lastClickCoords) < this.DOUBLE_CLICK_DISTANCE) {
            // Double-click detected
            this._handleDoubleClickAction(coords);
            this.lastClickTime = 0;
            this.lastClickCoords = null;
            return;
        }

        this.lastClickTime = now;
        this.lastClickCoords = { x: coords.x, y: coords.y };

        const state = window.AnnotationState;
        if (!state) return;

        const tool = state.currentTool;

        // [MODIFIED] Allow drawing without label selected first
        /*
        // If this is the first click and no label selected, show label selector
        if (state.pendingPoints.length === 0 && !state.selectedLabel) {
            this.promptForLabel(e.clientX, e.clientY, coords);
            return;
        }
        */

        // Ensure pendingType is set when first point is added
        if (!state.pendingType) {
            state.pendingType = state.currentTool;
        }

        // Add point to pending
        state.addPendingPoint(coords.x, coords.y);
        window.Debug?.log('DrawingHandler', `Point added at ${coords.x},${coords.y}. Total: ${state.pendingPoints.length}`);

        // Check if annotation can be completed
        if (state.canComplete()) {
            // For variable-length types (polygon), don't auto-complete
            if (tool === this._types.POLYGON) {
                // Just render and wait for completion signal
                this._triggerRender();
            } else {
                this.completeAnnotation();
            }
        } else {
            // Update preview
            this._triggerRender();
        }
    },

    /**
     * Handle double-click for polygon completion
     * @param {MouseEvent} e - Mouse event
     */
    handleDoubleClick(e) {
        if (!this.isActive) return;

        const state = window.AnnotationState;
        if (!state) return;

        const tool = state.currentTool;

        if (tool === this._types.POLYGON && state.pendingPoints.length >= 3) {
            e.preventDefault();
            e.stopPropagation();
            this.completeAnnotation();
        }
    },

    /**
     * Handle double-click action (internal)
     * @private
     * @param {{x: number, y: number}} coords - Image coordinates
     */
    _handleDoubleClickAction(coords) {
        const state = window.AnnotationState;
        if (!state) return;

        const tool = state.currentTool;

        if (tool === this._types.POLYGON && state.pendingPoints.length >= 3) {
            this.completeAnnotation();
        }
    },

    /**
     * Handle mouse move for preview
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        if (!this.isActive) return;

        const state = window.AnnotationState;
        if (!state) return;

        // Only show preview if we have pending points
        if (state.pendingPoints.length === 0) return;

        const coords = window.viewport?.eventToImage(e);
        if (!coords) return;

        // Store current mouse position for preview
        this.previewPoint = coords;
        this._triggerRender();
    },

    /**
     * Handle mouse down
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseDown(e) {
        // No special handling needed without freehand
    },

    /**
     * Handle mouse up
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseUp(e) {
        // No special handling needed without freehand
    },

    // ========================================================================
    // Touch Event Handlers
    // ========================================================================

    /**
     * Handle touch start
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        if (!this.isActive) return;
        if (e.touches.length !== 1) return; // Only single touch

        const state = window.AnnotationState;
        if (!state) return;

        // Convert touch to mouse-like event for coordinate extraction
        const touch = e.touches[0];
        const coords = window.viewport?.eventToImage({
            clientX: touch.clientX,
            clientY: touch.clientY
        });

        if (!coords || !window.viewport?.isWithinBounds(coords.x, coords.y)) return;

        // Handle freehand tool
        if (state.currentTool === this._types.FREEHAND && state.selectedLabel) {
            e.preventDefault();
            this.isFreehandDrawing = true;
            state.addPendingPoint(coords.x, coords.y);
            return;
        }

        // For other tools, check if we need label selection
        // [MODIFIED] Removed "Select Label First" requirement for touch
        /*
        if (state.pendingPoints.length === 0 && !state.selectedLabel) {
            e.preventDefault();
            this.promptForLabel(touch.clientX, touch.clientY, coords);
        }
        */
    },

    /**
     * Handle touch move
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        if (!this.isActive) return;
        if (e.touches.length !== 1) return;

        const state = window.AnnotationState;
        if (!state) return;

        const touch = e.touches[0];
        const coords = window.viewport?.eventToImage({
            clientX: touch.clientX,
            clientY: touch.clientY
        });

        if (!coords) return;

        // Update preview point
        if (state.pendingPoints.length > 0) {
            this.previewPoint = coords;
            this._triggerRender();
        }
    },

    /**
     * Handle touch end
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        if (!this.isActive) return;

        const state = window.AnnotationState;
        if (!state) return;

        // For click-based tools on touch, we use touchend to trigger the click logic
        if (e.changedTouches.length === 1 && state.pendingPoints.length === 0) {
            // First touch - handled by click or touchstart for label selection
            return;
        }

        // Add point from touch
        if (e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            const coords = window.viewport?.eventToImage({
                clientX: touch.clientX,
                clientY: touch.clientY
            });

            if (coords && window.viewport?.isWithinBounds(coords.x, coords.y)) {
                state.addPendingPoint(coords.x, coords.y);

                // Check if we can complete
                if (state.canComplete() && state.currentTool !== this._types.POLYGON) {
                    this.completeAnnotation();
                } else {
                    this._triggerRender();
                }
            }
        }
    },

    // ========================================================================
    // Keyboard Event Handlers
    // ========================================================================

    /**
     * Handle keyboard events
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        if (!this.isActive) return;

        // Don't capture if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const state = window.AnnotationState;
        if (!state) return;

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this.cancelDrawing();
                break;

            case 'Enter':
                // Complete polygon with Enter
                if (state.currentTool === this._types.POLYGON && state.pendingPoints.length >= 3) {
                    e.preventDefault();
                    this.completeAnnotation();
                }
                break;

            case 'Backspace':
            case 'Delete':
                // Remove last point
                if (state.pendingPoints.length > 0) {
                    e.preventDefault();
                    state.removeLastPendingPoint();
                    this._triggerRender();
                }
                break;

            case 'z':
            case 'Z':
                // Undo last point with Ctrl+Z
                if (e.ctrlKey || e.metaKey) {
                    if (state.pendingPoints.length > 0) {
                        e.preventDefault();
                        state.removeLastPendingPoint();
                        this._triggerRender();
                    }
                }
                break;
        }
    },

    // ========================================================================
    // Label Selection
    // ========================================================================

    /**
     * Show label selector popup
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     * @param {{x: number, y: number}} imageCoords - Image coordinates where user clicked
     */
    promptForLabel(screenX, screenY, imageCoords) {
        if (window.LabelSelector) {
            window.LabelSelector.show(
                screenX,
                screenY,
                imageCoords,
                (labelName, coords) => this._onLabelSelected(labelName, coords),
                () => this._onLabelCancelled()
            );
        } else if (window.LabelPopup) {
            // Fallback to LabelPopup if LabelSelector not available
            window.LabelPopup.show(screenX, screenY, imageCoords);
        } else {
            window.Debug?.warn('DrawingHandler', 'No label selector available');
        }
    },

    /**
     * Callback when label is selected
     * @private
     * @param {string} labelName - Selected label name
     * @param {{x: number, y: number}} coords - Image coordinates
     */
    _onLabelSelected(labelName, coords) {
        window.Debug?.log('DrawingHandler', `Label selected: ${labelName}`);
        const state = window.AnnotationState;
        if (!state) return;

        // Store selected label
        state.selectedLabel = labelName;
        state.pendingType = state.currentTool;

        // Add point ONLY if coords provided (click-to-select scenario)
        // If coords is null (draw-then-select scenario), we don't add a point
        if (coords) {
            state.addPendingPoint(coords.x, coords.y);
        }

        // Check if we can complete now
        if (state.canComplete()) {
            this.completeAnnotation();
            return;
        }

        this._triggerRender();
        window.showMessage?.(`Drawing ${state.currentTool}: click to add points`, 'info');
    },

    /**
     * Callback when label selection is cancelled
     * Cancels/deletes any pending annotation that was being created
     * @private
     */
    _onLabelCancelled() {
        const state = window.AnnotationState;
        if (!state) return;

        // Check if we have pending points (annotation was being created)
        const hadPendingPoints = state.pendingPoints.length > 0;
        const hadPendingType = !!state.pendingType;

        // Always clear pending state when label selection is cancelled
        // This effectively "deletes" the annotation that was being created
        state.clearPending();
        state.selectedLabel = null;
        this.previewPoint = null;

        // Re-render to remove any preview
        this._triggerRender();

        // Log what was cancelled
        if (hadPendingPoints || hadPendingType) {
            window.Debug?.log('DrawingHandler', 'Annotation creation cancelled - pending annotation deleted');
            window.showMessage?.('Annotation cancelled', 'info');
        }
    },

    // ========================================================================
    // Drawing Completion
    // ========================================================================

    /**
     * Complete the current annotation
     */
    async completeAnnotation() {
        window.Debug?.log('DrawingHandler', 'Attempting to complete annotation...');
        const state = window.AnnotationState;
        if (!state) return;

        const tool = state.pendingType || state.currentTool;
        // const label = state.selectedLabel; // Don't access yet
        const points = [...state.pendingPoints]; // Copy array

        // Check if points are required for this tool type
        const required = window.ClicksRequired?.[tool] ?? -1;

        // All types need at least one point
        if (points.length === 0) {
            window.showMessage?.('No points recorded', 'error');
            return;
        }

        // [MODIFIED] Check for label and prompt if missing
        if (!state.selectedLabel) {
            window.Debug?.log('DrawingHandler', 'No label selected, prompting user...');

            // Calculate screen position for popup
            let screenX = window.innerWidth / 2;
            let screenY = window.innerHeight / 2;

            // For tools with points, position near the last point
            if (points.length > 0) {
                const lastPoint = points[points.length - 1];
                if (window.viewport && window.DOM && window.DOM.imageContainer) {
                    const display = window.viewport.imageToScreen(lastPoint.x, lastPoint.y);
                    const rect = window.DOM.imageContainer.getBoundingClientRect();
                    screenX = rect.left + display.x;
                    screenY = rect.top + display.y;
                }
            }

            // Show popup - Pass NULL for coords to indicate we aren't adding a new point
            this.promptForLabel(screenX, screenY, null);
            return;
        }

        const label = state.selectedLabel;

        // Validate point count (skip for tags which require 0 points)
        if (required > 0 && points.length < required) {
            window.showMessage?.(`${tool} requires ${required} points`, 'warning');
            return;
        }

        // Build annotation data based on type
        const data = this.buildAnnotationData(tool, points, label);

        // Validate the data
        const validation = window.validateAnnotationData?.(tool, data);
        if (validation && !validation.valid) {
            window.Debug?.error('DrawingHandler', 'Invalid annotation data:', validation.error);
            window.showMessage?.(`Invalid annotation: ${validation.error}`, 'error');
            return;
        }

        // Get color for label
        const color = this.getColorForLabel(label);

        // Save via API
        try {
            const patientId = state.patientId || window.__APP_CONFIG__?.patientId;
            const imageName = state.imageName || window.__APP_CONFIG__?.imageName;

            if (!patientId || !imageName) {
                throw new Error('Missing patient ID or image name');
            }

            const result = await window.AnnotationAPI?.saveAnnotation(
                patientId,
                imageName,
                label,
                tool,
                data,
                { color }
            );

            if (result?.status === 'success' || result?.status === 'ok') {
                // Update local state
                state.setAnnotation(label, {
                    type: tool,
                    status: 'ok',
                    color: color,
                    data: data,
                    timestamp: new Date().toISOString()
                });

                const typeName = window.getTypeDisplayName?.(tool) || tool;
                window.showMessage?.(`Created ${typeName} annotation: ${label}`, 'success');
            } else {
                throw new Error(result?.error || 'Save returned non-success');
            }
        } catch (error) {
            window.Debug?.error('DrawingHandler', 'Failed to save annotation:', error);
            window.showMessage?.(`Failed to save: ${error.message}`, 'error');
        }

        // Clear pending state
        state.clearPending();
        state.selectedLabel = null;
        this.previewPoint = null;

        // Re-render canvas
        this._triggerRender();

        // Explicitly update sidebar to show new annotation
        if (typeof window.renderLabelList === 'function') {
            window.renderLabelList();
        }
    },

    /**
     * Cancel the current drawing
     */
    cancelDrawing() {
        const state = window.AnnotationState;
        if (!state) return;

        const hadPoints = state.pendingPoints.length > 0;

        state.clearPending();
        state.selectedLabel = null;
        this.previewPoint = null;
        this.lastClickTime = 0;
        this.lastClickCoords = null;

        this._triggerRender();

        if (hadPoints) {
            window.showMessage?.('Drawing cancelled', 'info');
        }
    },

    // ========================================================================
    // Data Building
    // ========================================================================

    /**
     * Build annotation data from collected points
     * @param {string} type - Annotation type
     * @param {Array<{x: number, y: number}>} points - Collected points
     * @param {string} [label] - Label name (used for tag value)
     * @returns {Object} Annotation data object
     */
    buildAnnotationData(type, points, label) {
        switch (type) {
            case 'point':
                return {
                    x: points[0].x,
                    y: points[0].y
                };

            case 'line':
                return {
                    start: { x: points[0].x, y: points[0].y },
                    end: { x: points[1].x, y: points[1].y }
                };

            case 'circle':
                const radius = window.Measurements?.circleRadius(points[0], points[1]) ||
                    this._distance(points[0], points[1]);
                return {
                    center: { x: points[0].x, y: points[0].y },
                    radius: radius
                };

            case 'rectangle':
                return {
                    topLeft: {
                        x: Math.min(points[0].x, points[1].x),
                        y: Math.min(points[0].y, points[1].y)
                    },
                    bottomRight: {
                        x: Math.max(points[0].x, points[1].x),
                        y: Math.max(points[0].y, points[1].y)
                    }
                };

            case 'angle':
                return {
                    point1: { x: points[0].x, y: points[0].y },
                    vertex: { x: points[1].x, y: points[1].y },
                    point2: { x: points[2].x, y: points[2].y }
                };

            case 'polygon':
                return {
                    points: points.map(p => ({ x: p.x, y: p.y })),
                    closed: true
                };

            default:
                window.Debug?.warn('DrawingHandler', `Unknown type: ${type}`);
                return {
                    points: points.map(p => ({ x: p.x, y: p.y }))
                };
        }
    },

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Update cursor based on current tool
     * All annotation tools use crosshair cursor
     */
    updateCursor() {
        const container = window.DOM?.imageContainer;
        if (!container) return;

        container.style.cursor = 'crosshair';
    },

    /**
     * Get color for a label
     * @param {string} labelName - Label name
     * @returns {string} Hex color string
     */
    getColorForLabel(labelName) {
        // Try to find label in state
        // Use stable color assignment based on label name
        if (window.getColorForLabel && labelName) {
            return window.getColorForLabel(labelName);
        }

        // Check if label has a specific color assigned
        const state = window.AnnotationState;
        if (state?.labels) {
            const label = state.labels.find(l => l.name === labelName);
            if (label?.color) return label.color;
        }

        // Fallback
        return '#ff0000';
    },

    /**
     * Calculate distance between two points
     * @private
     * @param {{x: number, y: number}} p1 - First point
     * @param {{x: number, y: number}} p2 - Second point
     * @returns {number} Distance
     */
    _distance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    },

    /**
     * Trigger a render of the annotations
     * Uses the central rendering pipeline to ensure visibility filters and
     * consistent colors are applied
     * @private
     */
    _triggerRender() {
        // Use the central render pipeline to ensure visibility filtering and colors
        if (typeof window.forceRender === 'function') {
            window.forceRender();
        } else if (typeof window.scheduleRender === 'function') {
            window.scheduleRender(true);
        } else if (typeof window.renderAnnotations === 'function') {
            window.renderAnnotations(true);
        }
    },

    /**
     * Get current pending state for preview rendering
     * @returns {{tool: string, points: Array, previewPoint: Object|null, label: string|null}}
     */
    getPendingState() {
        const state = window.AnnotationState;
        return {
            tool: state?.pendingType || state?.currentTool,
            points: state?.pendingPoints || [],
            previewPoint: this.previewPoint,
            label: state?.selectedLabel
        };
    },

    /**
     * Check if drawing is in progress
     * @returns {boolean}
     */
    isDrawingInProgress() {
        const state = window.AnnotationState;
        return this.isActive && state && state.pendingPoints.length > 0;
    }
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.DrawingHandler = DrawingHandler;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => DrawingHandler.init());
    } else {
        DrawingHandler.init();
    }
}
