/**
 * Mouse, touch, and keyboard interaction handlers
 * @module interactions
 * 
 * REWRITTEN: New interaction model
 * - Pan mode freezes all annotation interactions
 * - Click events used where possible (mobile/automation friendly)
 * - Figure editing enabled in annotation mode
 * - Touch event support
 */

// Zoom limits for pinch zoom (get from zoom.js if available, otherwise use defaults)
// Use function to avoid redeclaration errors
function getMinZoom() { return typeof window !== 'undefined' && window.MIN_ZOOM ? window.MIN_ZOOM : 0.1; }
function getMaxZoom() { return typeof window !== 'undefined' && window.MAX_ZOOM ? window.MAX_ZOOM : 5.0; }

/**
 * Calculate distance between two touch points
 * Used for pinch-to-zoom gesture detection
 * @param {TouchList} touches - Touch list from touch event
 * @returns {number} Distance between the two touch points in pixels
 */
function getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the center point between two touches
 * Used for pinch-to-zoom to zoom toward the pinch center
 * @param {TouchList} touches - Touch list from touch event
 * @returns {{x: number, y: number}} Center point coordinates
 */
function getTouchCenter(touches) {
    if (touches.length < 2) {
        return { x: touches[0]?.clientX || 0, y: touches[0]?.clientY || 0 };
    }
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

let lastMouseUpdateTime = 0;
const MOUSE_UPDATE_INTERVAL = 16; // ~60fps

// Pan drag state (local — no longer stored in STATE)
let _isDragging = false;
let _dragStartX = 0;
let _dragStartY = 0;

// Touch state for gesture handling
let touchState = {
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startDistance: 0,
    isPinching: false,
    isTouchDragging: false,
    // Pinch zoom state
    pinchCenterX: 0,
    pinchCenterY: 0,
    pinchStartZoom: 1
};

/**
 * Update the mouse position display in the UI
 * Throttled to ~60fps for performance
 * @param {{x: number, y: number}} coords - Image coordinates
 */
function updateMousePositionDisplay(coords) {
    const now = performance.now();
    if (now - lastMouseUpdateTime >= MOUSE_UPDATE_INTERVAL) {
        lastMouseUpdateTime = now;

        // Safety check for viewport and DOM
        if (!viewport || !DOM || !DOM.mousePosition) return;

        const inBounds = typeof viewport.isWithinBounds === 'function'
            ? viewport.isWithinBounds(coords.x, coords.y)
            : coords.x >= 0 && coords.y >= 0;

        DOM.mousePosition.textContent = `X: ${Math.round(coords.x)}, Y: ${Math.round(coords.y)}`;
        DOM.mousePosition.style.color = inBounds ? 'white' : '#ff6b6b';
    }
}

/**
 * Handle panning drag movement
 * Uses viewport.pan() for consistent coordinate transformation
 * @param {number} mouseX - Current mouse X position relative to container
 * @param {number} mouseY - Current mouse Y position relative to container
 */
function handlePanDrag(mouseX, mouseY) {
    const deltaX = mouseX - _dragStartX;
    const deltaY = mouseY - _dragStartY;
    window.viewport?.pan(deltaX, deltaY);
    _dragStartX = mouseX;
    _dragStartY = mouseY;
}

/**
 * Handle mouse down event on the image container
 * Routes to appropriate handler based on current tool and mode
 * @param {MouseEvent} e - The mouse event
 */

/**
 * Handle mouse down event on the image container
 * Routes to appropriate handler based on current tool and mode
 * @param {MouseEvent} e - The mouse event
 */

function handleMouseDown(e) {
    const isAnnotationMode = window.AnnotationState?.isAnnotationMode ?? true;

    // If the new DrawingHandler is active AND we're in annotation mode, yield control to it completely.
    if (window.DrawingHandler && window.DrawingHandler.isActive && isAnnotationMode) {
        return;
    }

    // Ignore if popup is open
    if (typeof LabelPopup !== 'undefined' && LabelPopup.isOpen) return;
    if (window.LabelSelector && window.LabelSelector.isOpen) return;

    // Safety check for viewport
    if (!viewport || typeof viewport.eventToImage !== 'function') return;

    const rect = DOM.imageContainer.getBoundingClientRect();
    _dragStartX = e.clientX - rect.left;
    _dragStartY = e.clientY - rect.top;

    // Pan mode - only allow panning, freeze all annotation interactions
    if (!isAnnotationMode) {
        _isDragging = true;
        DOM.imageContainer.style.cursor = 'grabbing';
        return;
    }

    // Drawing and editing is handled by DrawingHandler and EditingHandler.
}

/**
 * Handle mouse move event for dragging, drawing, and coordinate display
 * @param {MouseEvent} e - The mouse event
 */

function handleMouseMove(e) {
    // Always update coordinate display regardless of mode
    if (viewport && typeof viewport.eventToImage === 'function') {
        updateMousePositionDisplay(viewport.eventToImage(e));
    }

    const isAnnotationMode = window.AnnotationState?.isAnnotationMode ?? true;

    // If the new DrawingHandler is active AND we're in annotation mode, yield control to it completely.
    if (window.DrawingHandler && window.DrawingHandler.isActive && isAnnotationMode) {
        return;
    }

    // Safety check for viewport
    if (!viewport || typeof viewport.eventToImage !== 'function') return;

    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Pan mode dragging
    if (_isDragging && !isAnnotationMode) {
        handlePanDrag(mouseX, mouseY);
        return;
    }
}

/**
 * Handle mouse up event
 * @param {MouseEvent} e - The mouse event
 */

function handleMouseUp(e) {
    const isAnnotationMode = window.AnnotationState?.isAnnotationMode ?? true;

    if (window.DrawingHandler && window.DrawingHandler.isActive && isAnnotationMode) {
        return;
    }

    _isDragging = false;

    // Set appropriate cursor based on mode
    DOM.imageContainer.style.cursor = isAnnotationMode ? 'crosshair' : 'grab';
}

// Mobile/Touch handlers (Pan/Zoom only)

function handleTouchStart(e) {
    if (typeof LabelPopup !== 'undefined' && LabelPopup.isOpen) return;

    // Only handle pinch zoom or pan
    if (e.touches.length === 2) {
        e.preventDefault();
        touchState.isPinching = true;
        touchState.startDistance = getTouchDistance(e.touches);
        touchState.pinchStartZoom = window.viewport?.scale || 1;

        // Store the pinch center relative to container
        const center = getTouchCenter(e.touches);
        const rect = DOM.imageContainer.getBoundingClientRect();
        touchState.pinchCenterX = center.x - rect.left;
        touchState.pinchCenterY = center.y - rect.top;
    } else if (e.touches.length === 1 && !(window.AnnotationState?.isAnnotationMode ?? true)) {
        // Pan mode
        e.preventDefault();
        const touch = e.touches[0];
        touchState.startX = touch.clientX;
        touchState.startY = touch.clientY;
        touchState.lastX = touch.clientX;
        touchState.lastY = touch.clientY;
        touchState.isTouchDragging = true;

        // Pass to mouse down for logic reuse
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
        });
        handleMouseDown(mouseEvent);
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 2 && touchState.isPinching) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scaleRatio = currentDistance / touchState.startDistance;

        // Calculate new zoom based on the initial pinch zoom
        const newZoom = Math.max(getMinZoom(), Math.min(getMaxZoom(), touchState.pinchStartZoom * scaleRatio));

        // Zoom centered on the initial pinch center — viewport handles translate math
        window.viewport?.setScale(newZoom, touchState.pinchCenterX, touchState.pinchCenterY);
        
        // Note: We don't update startDistance here because we want to track
        // the total scale change from the initial pinch, not incremental changes
    } else if (e.touches.length === 1 && touchState.isTouchDragging) {
        const touch = e.touches[0];

        // Simulate mouse move for pan
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
        });
        handleMouseMove(mouseEvent);

        touchState.lastX = touch.clientX;
        touchState.lastY = touch.clientY;
    }
}

function handleTouchEnd(e) {
    if (touchState.isTouchDragging && e.touches.length === 0) {
        // Simulate mouse up
        const mouseEvent = new MouseEvent('mouseup', {
            clientX: touchState.lastX,
            clientY: touchState.lastY,
            bubbles: true
        });
        handleMouseUp(mouseEvent);
    }

    touchState.isTouchDragging = false;
    touchState.isPinching = false;
}

/**
 * Handle keyboard shortcuts for tools and navigation
 * @param {KeyboardEvent} e - The keyboard event
 */
function handleKeyDown(e) {
    // Skip if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Arrow keys for Pan/Zoom or other interaction could go here
    // But EditingHandler handles arrow keys for annotations.

    // Special handling for spacebar - check if drawing in progress
    if (e.key === ' ') {
        // Don't toggle mode while drawing
        if (window.DrawingHandler?.isDrawingInProgress?.()) {
            return;
        }
        e.preventDefault();
        toggleMode();
        return;
    }

    const keyHandlers = {
        'r': resetView,
        '+': zoomIn,
        '=': zoomIn,
        '-': zoomOut
    };

    const handler = keyHandlers[e.key];
    if (handler) {
        e.preventDefault();
        handler();
    }
}

console.log('[interactions.js] Interaction handlers loaded');

