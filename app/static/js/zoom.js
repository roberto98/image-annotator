/**
 * Zoom and view manipulation operations
 * @module zoom
 * 
 * Handles zoom in/out, reset view, and mouse wheel zoom.
 * Syncs with both legacy STATE and the new Viewport service.
 */

const ZOOM_FACTOR = 1.5;
const MIN_ZOOM = 0.1;  // 10%
const MAX_ZOOM = 5.0;  // 500%

/**
 * Sync zoom state with the viewport service
 * Called after any zoom operation to keep viewport in sync
 */
function syncViewport() {
    if (window.viewport && typeof window.viewport.setState === 'function') {
        window.viewport.setState(STATE.currentZoom, STATE.translateX, STATE.translateY);
    }
}

/**
 * Zoom in by ZOOM_FACTOR (max zoom: 500%)
 */
function zoomIn() {
    STATE.currentZoom = Math.min(MAX_ZOOM, STATE.currentZoom * ZOOM_FACTOR);
    applyZoom();
}

/**
 * Zoom out by ZOOM_FACTOR (min zoom: 10%)
 */
function zoomOut() {
    STATE.currentZoom = Math.max(MIN_ZOOM, STATE.currentZoom / ZOOM_FACTOR);
    applyZoom();
}

/**
 * Reset view to fit the image in the container and center it
 */
function resetView() {
    const containerRect = DOM.imageContainer.getBoundingClientRect();
    const imageWidth = STATE.naturalWidth;
    const imageHeight = STATE.naturalHeight;

    if (imageWidth <= 0 || imageHeight <= 0 || containerRect.width <= 0 || containerRect.height <= 0) {
        // Fallback to simple reset if dimensions are not available
        STATE.currentZoom = 1;
        STATE.translateX = 0;
        STATE.translateY = 0;
        applyZoom();
        return;
    }

    // Calculate scale to fit image in container
    const scaleX = containerRect.width / imageWidth;
    const scaleY = containerRect.height / imageHeight;
    const fitScale = Math.min(scaleX, scaleY);

    // Clamp to zoom limits
    STATE.currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitScale));

    // Center the image
    const scaledWidth = imageWidth * STATE.currentZoom;
    const scaledHeight = imageHeight * STATE.currentZoom;
    STATE.translateX = (containerRect.width - scaledWidth) / 2;
    STATE.translateY = (containerRect.height - scaledHeight) / 2;

    applyZoom();
}

/**
 * Apply current zoom level and translation to the image
 * Updates the zoom display, transforms the image, and syncs with viewport
 */
function applyZoom() {
    // Apply CSS transform to image wrapper
    DOM.imageWrapper.style.transform = `translate(${STATE.translateX}px, ${STATE.translateY}px) scale(${STATE.currentZoom})`;
    
    // Update zoom level display
    DOM.zoomLevel.textContent = `${Math.round(STATE.currentZoom * 100)}%`;
    
    // Sync with viewport service for coordinate transformations
    syncViewport();
    
    // Trigger re-render of annotations (they subscribe to viewport changes)
    // The viewport.setState call above will notify subscribers
}

/**
 * Handle mouse wheel events for zoom
 * Zooms centered on cursor position for natural interaction
 * @param {WheelEvent} e - The wheel event
 */
function handleWheel(e) {
    e.preventDefault();

    // Calculate zoom delta (scroll down = zoom out, scroll up = zoom in)
    const delta = e.deltaY > 0 ? 0.8 : 1.25;
    const oldZoom = STATE.currentZoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, STATE.currentZoom * delta));
    
    // If zoom didn't change (at limits), do nothing
    if (newZoom === oldZoom) return;
    
    STATE.currentZoom = newZoom;

    // Get mouse position relative to container
    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate the point under the cursor in image space (before zoom)
    const mouseRelX = (mouseX - STATE.translateX) / oldZoom;
    const mouseRelY = (mouseY - STATE.translateY) / oldZoom;

    // Adjust translation so the cursor stays over the same image point
    STATE.translateX = mouseX - mouseRelX * STATE.currentZoom;
    STATE.translateY = mouseY - mouseRelY * STATE.currentZoom;

    applyZoom();
}

// Export functions for global access
if (typeof window !== 'undefined') {
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetView = resetView;
    window.applyZoom = applyZoom;
    window.handleWheel = handleWheel;
    window.MIN_ZOOM = MIN_ZOOM;
    window.MAX_ZOOM = MAX_ZOOM;
}

console.log('[zoom.js] Zoom module loaded - ZOOM_FACTOR:', ZOOM_FACTOR, 'MIN_ZOOM:', MIN_ZOOM, 'MAX_ZOOM:', MAX_ZOOM);
