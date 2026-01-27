/**
 * Zoom and view manipulation operations
 */

const ZOOM_FACTOR = 1.5;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1000;

/**
 * Zoom in by 1.5x (max zoom: 1000x)
 */
function zoomIn() {
    STATE.currentZoom = Math.min(MAX_ZOOM, STATE.currentZoom * ZOOM_FACTOR);
    applyZoom();
}

/**
 * Zoom out by 1.5x (min zoom: 0.1x)
 */
function zoomOut() {
    STATE.currentZoom = Math.max(MIN_ZOOM, STATE.currentZoom / ZOOM_FACTOR);
    applyZoom();
}

/**
 * Reset view to default zoom (100%) and center the image
 */
function resetView() {
    STATE.currentZoom = 1;
    STATE.translateX = 0;
    STATE.translateY = 0;

    const containerRect = DOM.imageContainer.getBoundingClientRect();
    const scaledWidth = STATE.naturalWidth;
    const scaledHeight = STATE.naturalHeight;

    if (scaledWidth < containerRect.width) {
        STATE.translateX = (containerRect.width - scaledWidth) / 2;
    }
    if (scaledHeight < containerRect.height) {
        STATE.translateY = (containerRect.height - scaledHeight) / 2;
    }

    applyZoom();
}

/**
 * Apply current zoom level and translation to the image
 * Updates the zoom display and re-renders annotations
 */
function applyZoom() {
    DOM.imageWrapper.style.transform = `translate(${STATE.translateX}px, ${STATE.translateY}px) scale(${STATE.currentZoom})`;
    DOM.zoomLevel.textContent = `${Math.round(STATE.currentZoom * 100)}%`;
    renderAnnotations();
}

/**
 * Handle mouse wheel events for zoom
 * Zooms centered on mouse position
 * @param {WheelEvent} e - The wheel event
 */
function handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.8 : 1.25;
    const oldZoom = STATE.currentZoom;
    STATE.currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, STATE.currentZoom * delta));

    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mouseRelX = (mouseX - STATE.translateX) / oldZoom;
    const mouseRelY = (mouseY - STATE.translateY) / oldZoom;

    STATE.translateX = mouseX - mouseRelX * STATE.currentZoom;
    STATE.translateY = mouseY - mouseRelY * STATE.currentZoom;

    applyZoom();
}
