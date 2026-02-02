// Toast messages, undo/redo, and UI utility functions
// Coordinate transformations are handled by viewport (core/Viewport.js)

// ============================================================================
// Shared Validation Utilities
// ============================================================================

/**
 * Validate coordinate object for annotation operations
 * @param {Object} coords - Coordinates object to validate
 * @param {number} coords.x - X coordinate
 * @param {number} coords.y - Y coordinate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateCoordinates(coords) {
    if (!coords || typeof coords !== 'object') {
        return { valid: false, error: 'Coordinates must be an object' };
    }

    if (typeof coords.x !== 'number' || typeof coords.y !== 'number') {
        return { valid: false, error: 'Coordinates x and y must be numbers' };
    }

    if (!Number.isFinite(coords.x) || !Number.isFinite(coords.y)) {
        return { valid: false, error: 'Coordinates must be finite numbers' };
    }

    if (coords.x < 0 || coords.y < 0) {
        return { valid: false, error: 'Coordinates cannot be negative' };
    }

    // Check against image bounds if available
    if (STATE.naturalWidth && STATE.naturalHeight) {
        if (coords.x > STATE.naturalWidth || coords.y > STATE.naturalHeight) {
            return { valid: false, error: 'Coordinates exceed image bounds' };
        }
    }

    return { valid: true };
}

// ============================================================================
// Shared Error Handling Utilities
// ============================================================================

/**
 * Extract error message from server response data
 * @param {Object} data - Server response data
 * @returns {string} Error message
 */
function getServerErrorMessage(data) {
    return data?.message || data?.error || 'Server returned non-success status';
}

/**
 * Format a standardized error message for operations
 * @param {string} operation - The operation that failed (e.g., 'save', 'delete', 'update')
 * @param {string} target - What the operation was performed on (e.g., 'figure', 'polygon', 'landmark')
 * @param {string|Error} [reason] - Optional error reason or Error object
 * @returns {string} Formatted error message
 */
function formatErrorMessage(operation, target, reason = null) {
    const base = `Failed to ${operation} ${target}`;
    if (!reason) return base;
    const reasonStr = reason instanceof Error ? reason.message : String(reason);
    return `${base}: ${reasonStr}`;
}

/**
 * Format a standardized success message for operations
 * @param {string} operation - The operation that succeeded (e.g., 'Created', 'Deleted', 'Updated')
 * @param {string} target - What the operation was performed on
 * @param {string} [details] - Optional additional details
 * @returns {string} Formatted success message
 */
function formatSuccessMessage(operation, target, details = null) {
    const base = `${operation} ${target}`;
    return details ? `${base} (${details})` : base;
}

// ============================================================================
// Shared HTML Utilities
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML injection
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, c => escapeMap[c]);
}

// ============================================================================
// Shared Geometry Utilities
// ============================================================================

/**
 * Calculate line properties from two points
 * @param {{x: number, y: number}} start - Start point
 * @param {{x: number, y: number}} end - End point
 * @returns {{dx: number, dy: number, length: number, angle: number, centerX: number, centerY: number}}
 */
function calculateLineProperties(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    return { dx, dy, length, angle, centerX, centerY };
}

// ============================================================================
// Toast Messages
// ============================================================================

/**
 * Display a toast message to the user
 * @param {string} text
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} duration - Milliseconds
 */
let _messageTimeout = null;
function showMessage(text, type = 'info', duration = 3000) {
    if (_messageTimeout) clearTimeout(_messageTimeout);

    DOM.messageToast.textContent = text;
    DOM.messageToast.className = `message-toast ${type}`;
    DOM.messageToast.style.display = 'block';
    _messageTimeout = setTimeout(() => {
        DOM.messageToast.style.display = 'none';
        _messageTimeout = null;
    }, duration);
}

function saveToHistory() {
    window.AppStore.saveToHistory();
    updateUndoRedoButtons();
}

function undo() {
    if (window.AppStore.undo()) {
        forceRender();
        updateUndoRedoButtons();
        showMessage('Undo successful', 'success');
    }
}

function redo() {
    if (window.AppStore.redo()) {
        forceRender();
        updateUndoRedoButtons();
        showMessage('Redo successful', 'success');
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn && redoBtn) {
        undoBtn.disabled = !window.AppStore.canUndo();
        redoBtn.disabled = !window.AppStore.canRedo();
    }
}

function updateImageAdjustments() {
    DOM.img.style.filter = `brightness(${STATE.brightness}%) contrast(${STATE.contrast}%)`;
}

function resetImageAdjustments() {
    STATE.brightness = 100;
    STATE.contrast = 100;

    const brightnessSlider = document.getElementById('brightnessSlider');
    const contrastSlider = document.getElementById('contrastSlider');

    brightnessSlider.value = 100;
    contrastSlider.value = 100;
    document.getElementById('brightnessValue').textContent = '100%';
    document.getElementById('contrastValue').textContent = '100%';
    updateImageAdjustments();
}

function toggleMode() {
    STATE.isAnnotationMode = !STATE.isAnnotationMode;
    updateModeDisplay();
    
    // Update figure interactivity when mode changes
    // Pan mode freezes all figure interactions
    if (typeof updateFigureInteractivity === 'function') {
        updateFigureInteractivity();
    }
    
    showMessage(STATE.isAnnotationMode ? 'Annotation Mode - Click to annotate' : 'Panning Mode - Drag to move');
}

function updateModeDisplay() {
    const isPanning = !STATE.isAnnotationMode;
    DOM.modeIndicator.classList.toggle('panning', isPanning);
    DOM.modeIndicator.querySelector('span').textContent =
        STATE.isAnnotationMode ? 'Annotation Mode' : 'Panning Mode';
    DOM.imageContainer.style.cursor = STATE.isAnnotationMode ? 'crosshair' : 'grab';
    
    // Update data attribute for automation
    DOM.modeIndicator.setAttribute('data-mode', STATE.isAnnotationMode ? 'annotation' : 'panning');
}

function toggleCenterIndicators() {
    STATE.showCenterIndicators = !STATE.showCenterIndicators;

    document.querySelectorAll('.center-indicator').forEach(indicator => {
        indicator.classList.toggle('always-visible', STATE.showCenterIndicators);
    });

    DOM.toggleCenters.style.background = STATE.showCenterIndicators ? '#5a3db8' : '#667eea';
    DOM.toggleCenters.style.opacity = STATE.showCenterIndicators ? '1' : '0.7';

    showMessage(`Center indicators ${STATE.showCenterIndicators ? 'enabled' : 'disabled'}`, 'info', 1000);
}
