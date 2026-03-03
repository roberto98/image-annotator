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
    const imgW = window.AnnotationState?.imageWidth;
    const imgH = window.AnnotationState?.imageHeight;
    if (imgW && imgH) {
        if (coords.x > imgW || coords.y > imgH) {
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
    // Use AnnotationState if available, fall back to AppStore for legacy compatibility
    if (window.AnnotationState?.saveToHistory) {
        window.AnnotationState.saveToHistory();
    } else if (window.AppStore?.saveToHistory) {
        window.AppStore.saveToHistory();
    }
    updateUndoRedoButtons();
}

function undo() {
    // Use AnnotationState if available, fall back to AppStore for legacy compatibility
    if (window.AnnotationState?.undo) {
        if (window.AnnotationState.undo()) {
            forceRender();
            updateUndoRedoButtons();
            showMessage('Undo successful', 'success');
        }
    } else if (window.AppStore?.undo) {
        if (window.AppStore.undo()) {
            forceRender();
            updateUndoRedoButtons();
            showMessage('Undo successful', 'success');
        }
    }
}

function redo() {
    // Use AnnotationState if available, fall back to AppStore for legacy compatibility
    if (window.AnnotationState?.redo) {
        if (window.AnnotationState.redo()) {
            forceRender();
            updateUndoRedoButtons();
            showMessage('Redo successful', 'success');
        }
    } else if (window.AppStore?.redo) {
        if (window.AppStore.redo()) {
            forceRender();
            updateUndoRedoButtons();
            showMessage('Redo successful', 'success');
        }
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn && redoBtn) {
        // Use AnnotationState if available, fall back to AppStore
        const canUndo = window.AnnotationState?.canUndo
            ? window.AnnotationState.canUndo()
            : (window.AppStore?.canUndo() ?? false);
        const canRedo = window.AnnotationState?.canRedo
            ? window.AnnotationState.canRedo()
            : (window.AppStore?.canRedo() ?? false);

        undoBtn.disabled = !canUndo;
        redoBtn.disabled = !canRedo;
    }
}

let _brightness = 100;
let _contrast = 100;

function updateImageAdjustments() {
    DOM.img.style.filter = `brightness(${_brightness}%) contrast(${_contrast}%)`;
}

function setBrightness(value) {
    _brightness = value;
    updateImageAdjustments();
}

function setContrast(value) {
    _contrast = value;
    updateImageAdjustments();
}

function resetImageAdjustments() {
    _brightness = 100;
    _contrast = 100;

    const brightnessSlider = document.getElementById('brightnessSlider');
    const contrastSlider = document.getElementById('contrastSlider');

    brightnessSlider.value = 100;
    contrastSlider.value = 100;
    document.getElementById('brightnessValue').textContent = '100%';
    document.getElementById('contrastValue').textContent = '100%';
    updateImageAdjustments();
}

function toggleMode() {
    // Don't toggle if drawing is in progress
    if (window.DrawingHandler?.isDrawingInProgress?.()) {
        showMessage('Cannot switch modes while drawing', 'warning');
        return;
    }

    if (window.AnnotationState) {
        window.AnnotationState.isAnnotationMode = !window.AnnotationState.isAnnotationMode;
    }

    const isAnnotationMode = window.AnnotationState?.isAnnotationMode ?? true;

    // Deactivate DrawingHandler when switching to Navigation mode
    if (!isAnnotationMode) {
        window.DrawingHandler?.deactivate?.();
    }

    updateModeDisplay();
    showMessage(isAnnotationMode ? 'Annotation Mode - Click to annotate' : 'Navigation Mode - Drag to pan, scroll to zoom');
}

function updateModeDisplay() {
    const isAnnotationMode = window.AnnotationState?.isAnnotationMode ?? true;
    DOM.modeIndicator.classList.toggle('panning', !isAnnotationMode);
    DOM.modeIndicator.querySelector('span').textContent =
        isAnnotationMode ? 'Annotation Mode' : 'Navigation Mode';
    DOM.imageContainer.style.cursor = isAnnotationMode ? 'crosshair' : 'grab';
    DOM.modeIndicator.setAttribute('data-mode', isAnnotationMode ? 'annotation' : 'panning');
}

// ============================================================================
// Image Adjustment Exposed Setters
// ============================================================================

window.setBrightness = setBrightness;
window.setContrast = setContrast;

// ============================================================================
// Color Management
// ============================================================================

/**
 * Fixed color palette for annotations - 30 distinct, visually distinguishable colors.
 */
const COLORS = Object.freeze([
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894', '#e17055'
]);

const COLOR_STORAGE_KEY = 'annotation_label_colors';

function loadColorAssignments() {
    try {
        const stored = localStorage.getItem(COLOR_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.warn('[utilities.js] Failed to load color assignments:', e);
    }
    return {};
}

function saveColorAssignments(assignments) {
    try {
        localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(assignments));
    } catch (e) {
        console.warn('[utilities.js] Failed to save color assignments:', e);
    }
}

function getNextColorIndex() {
    const usedColors = Object.values(window._labelColorAssignments);
    let maxIndex = -1;
    usedColors.forEach(color => {
        const index = COLORS.indexOf(color);
        if (index > maxIndex) maxIndex = index;
    });
    return (maxIndex + 1) % COLORS.length;
}

function getColorForLabel(labelName) {
    if (!labelName) return COLORS[0];
    if (window._labelColorAssignments[labelName]) {
        return window._labelColorAssignments[labelName];
    }
    const color = COLORS[window._nextColorIndex];
    window._labelColorAssignments[labelName] = color;
    window._nextColorIndex = (window._nextColorIndex + 1) % COLORS.length;
    saveColorAssignments(window._labelColorAssignments);
    return color;
}

function setColorForLabel(labelName, color) {
    if (!labelName || !color) return;
    window._labelColorAssignments[labelName] = color;
    saveColorAssignments(window._labelColorAssignments);
    if (typeof window.forceRender === 'function') window.forceRender();
}

function getAllColorAssignments() {
    return { ...window._labelColorAssignments };
}

window._labelColorAssignments = loadColorAssignments();
window._nextColorIndex = getNextColorIndex();
window.COLORS = COLORS;
window.getColorForLabel = getColorForLabel;
window.setColorForLabel = setColorForLabel;
window.getAllColorAssignments = getAllColorAssignments;

// ============================================================================
// Label Validation
// ============================================================================

/**
 * Validate label name for security and correctness
 * @param {string} name - Label name to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateLabelName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Label name must be a non-empty string' };
    }

    if (name.length > 100) {
        return { valid: false, error: 'Label name is too long (max 100 characters)' };
    }

    const dangerousPatterns = [
        /<[^>]*>/,
        /[<>]/,
        /\.\.\//,
        /[\x00-\x1f]/,
        /javascript:/i,
        /data:/i,
        /vbscript:/i
    ];

    if (dangerousPatterns.some(pattern => pattern.test(name))) {
        return { valid: false, error: 'Label name contains invalid characters' };
    }

    const allowedPattern = /^[\w\s\-\.\(\)]+$/;
    if (!allowedPattern.test(name)) {
        return { valid: false, error: 'Label name contains disallowed characters' };
    }

    return { valid: true };
}

window.validateLabelName = validateLabelName;

