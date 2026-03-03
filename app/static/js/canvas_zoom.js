/**
 * Zoom and view manipulation operations
 * @module zoom
 *
 * Handles zoom in/out, reset view, and mouse wheel zoom.
 * Viewport is the single source of truth for pan/zoom state.
 * All DOM transforms are applied by subscribing to viewport changes.
 */

const ZOOM_FACTOR = 1.5;
const MIN_ZOOM = 0.1;  // 10%
const MAX_ZOOM = 5.0;  // 500%

/**
 * Apply viewport state to the DOM — called whenever viewport changes.
 */
function _applyViewportTransform() {
    const vp = window.viewport;
    if (!vp || !DOM.imageWrapper) return;
    DOM.imageWrapper.style.transform =
        `translate(${vp.offsetX}px, ${vp.offsetY}px) scale(${vp.scale})`;
    if (DOM.zoomLevel) {
        DOM.zoomLevel.textContent = `${Math.round(vp.scale * 100)}%`;
    }
}

// Subscribe to viewport changes once the module loads
if (window.viewport?.subscribe) {
    window.viewport.subscribe(_applyViewportTransform);
}

/**
 * Zoom in by ZOOM_FACTOR (max zoom: 500%), centered on the container.
 */
function zoomIn() {
    const vp = window.viewport;
    if (!vp) return;
    const container = DOM.imageContainer;
    const cx = container ? container.clientWidth / 2 : 0;
    const cy = container ? container.clientHeight / 2 : 0;
    vp.setScale(vp.scale * ZOOM_FACTOR, cx, cy);
}

/**
 * Zoom out by ZOOM_FACTOR (min zoom: 10%), centered on the container.
 */
function zoomOut() {
    const vp = window.viewport;
    if (!vp) return;
    const container = DOM.imageContainer;
    const cx = container ? container.clientWidth / 2 : 0;
    const cy = container ? container.clientHeight / 2 : 0;
    vp.setScale(vp.scale / ZOOM_FACTOR, cx, cy);
}

/**
 * Reset view to fit the image in the container and center it.
 */
function resetView() {
    const vp = window.viewport;
    const img = DOM.img;
    const container = DOM.imageContainer;
    if (!vp || !img || !container) return;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    if (imgW > 0 && imgH > 0 && containerW > 0 && containerH > 0) {
        vp.fitToContainer(imgW, imgH, containerW, containerH, 20);
    } else {
        vp.setScale(1, 0, 0);
    }
}

/**
 * Handle mouse wheel events for zoom centered on cursor position.
 * @param {WheelEvent} e - The wheel event
 */
function handleWheel(e) {
    e.preventDefault();
    const vp = window.viewport;
    if (!vp) return;

    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    vp.setScale(vp.scale * factor, mouseX, mouseY);
}

// Export functions for global access
if (typeof window !== 'undefined') {
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetView = resetView;
    window.handleWheel = handleWheel;
    window.MIN_ZOOM = MIN_ZOOM;
    window.MAX_ZOOM = MAX_ZOOM;
}
