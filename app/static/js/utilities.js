// Utility functions for coordinate conversion and validation

/**
 * Convert mouse event coordinates to image coordinates
 * Takes into account current zoom level and pan offset
 * @param {MouseEvent} e - The mouse event
 * @returns {{x: number, y: number}} Image coordinates
 */
function eventToImageCoords(e) {
    const rect = DOM.imageContainer.getBoundingClientRect();
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;
    const imageX = (containerX - STATE.translateX) / STATE.currentZoom;
    const imageY = (containerY - STATE.translateY) / STATE.currentZoom;
    return { x: imageX, y: imageY };
}

/**
 * Convert image coordinates to display (screen) coordinates
 * @param {number} imageX - X coordinate in image space
 * @param {number} imageY - Y coordinate in image space
 * @returns {{x: number, y: number}} Display coordinates
 */
function imageToDisplayCoords(imageX, imageY) {
    return {
        x: imageX * STATE.currentZoom + STATE.translateX,
        y: imageY * STATE.currentZoom + STATE.translateY
    };
}

/**
 * Convert display (screen) coordinates to image coordinates
 * @param {number} displayX - X coordinate on screen
 * @param {number} displayY - Y coordinate on screen
 * @returns {{x: number, y: number}} Image coordinates
 */
function displayToImageCoords(displayX, displayY) {
    return {
        x: (displayX - STATE.translateX) / STATE.currentZoom,
        y: (displayY - STATE.translateY) / STATE.currentZoom
    };
}

/**
 * Check if coordinates are within the image bounds
 * @param {number} x - X coordinate in image space
 * @param {number} y - Y coordinate in image space
 * @returns {boolean} True if coordinates are within bounds
 */
function isWithinImageBounds(x, y) {
    return x >= 0 && y >= 0 && x < STATE.naturalWidth && y < STATE.naturalHeight;
}

/**
 * Display a toast message to the user
 * @param {string} text - Message text to display
 * @param {string} type - Message type: 'info', 'success', 'warning', 'error'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
let _messageTimeout = null;
function showMessage(text, type = 'info', duration = 3000) {
    // Clear any existing timeout to prevent stacking
    if (_messageTimeout) clearTimeout(_messageTimeout);
    
    DOM.messageToast.textContent = text;
    DOM.messageToast.className = `message-toast ${type}`;
    DOM.messageToast.style.display = 'block';
    _messageTimeout = setTimeout(() => {
        DOM.messageToast.style.display = 'none';
        _messageTimeout = null;
    }, duration);
}

// Undo/Redo functionality

/**
 * Fast deep clone using structuredClone (modern) or JSON fallback
 * @param {*} obj - Object to clone
 * @returns {*} Deep cloned object
 */
function deepClone(obj) {
    // Use structuredClone if available (faster, handles more types)
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    // Fallback for older browsers
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Save the current state to history for undo/redo
 * Trims history if we're not at the end and limits total history size
 */
function saveToHistory() {
    // Remove any states after current index (if we're not at the end)
    if (STATE.historyIndex < STATE.history.length - 1) {
        STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
    }
    
    // Save current state with timestamp
    const state = {
        annotations: deepClone(STATE.annotations),
        timestamp: new Date().toISOString()
    };
    STATE.history.push(state);
    
    // Limit history size
    if (STATE.history.length > STATE.maxHistorySize) {
        STATE.history.shift();
    } else {
        STATE.historyIndex++;
    }
    
    updateUndoRedoButtons();
}

/**
 * Undo the last action by restoring the previous state
 */
function undo() {
    if (STATE.historyIndex > 0) {
        STATE.historyIndex--;
        STATE.annotations = deepClone(STATE.history[STATE.historyIndex].annotations);
        renderLabelList();
        renderAnnotations(true); // Force render
        updateUndoRedoButtons();
        showMessage('Undo successful', 'success');
    }
}

/**
 * Redo a previously undone action
 */
function redo() {
    if (STATE.historyIndex < STATE.history.length - 1) {
        STATE.historyIndex++;
        STATE.annotations = deepClone(STATE.history[STATE.historyIndex].annotations);
        renderLabelList();
        renderAnnotations(true); // Force render
        updateUndoRedoButtons();
        showMessage('Redo successful', 'success');
    }
}

/**
 * Update the enabled/disabled state of undo/redo buttons
 */
function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = STATE.historyIndex <= 0;
    document.getElementById('redoBtn').disabled = STATE.historyIndex >= STATE.history.length - 1;
}

// Image adjustments

/**
 * Apply brightness and contrast adjustments to the image
 */
function updateImageAdjustments() {
    const img = DOM.img;
    img.style.filter = `brightness(${STATE.brightness}%) contrast(${STATE.contrast}%)`;
}

/**
 * Reset brightness and contrast to default values (100%)
 */
function resetImageAdjustments() {
    STATE.brightness = 100;
    STATE.contrast = 100;
    document.getElementById('brightnessSlider').value = 100;
    document.getElementById('contrastSlider').value = 100;
    document.getElementById('brightnessValue').textContent = '100%';
    document.getElementById('contrastValue').textContent = '100%';
    updateImageAdjustments();
}

// Mode toggle

/**
 * Toggle between annotation mode and panning mode
 */
function toggleMode() {
    STATE.isAnnotationMode = !STATE.isAnnotationMode;
    updateModeDisplay();
    showMessage(STATE.isAnnotationMode ? 'Annotation Mode' : 'Panning Mode');
}

/**
 * Update the UI to reflect the current mode
 */
function updateModeDisplay() {
    DOM.modeIndicator.classList.toggle('panning', !STATE.isAnnotationMode);
    DOM.modeIndicator.querySelector('span').textContent = 
        STATE.isAnnotationMode ? 'Annotation Mode' : 'Panning Mode';
    DOM.imageContainer.style.cursor = STATE.isAnnotationMode ? 'crosshair' : 'grab';
}

/**
 * Toggle visibility of center indicators on figures
 */
function toggleCenterIndicators() {
    STATE.showCenterIndicators = !STATE.showCenterIndicators;
    
    // Update all existing center indicators
    document.querySelectorAll('.center-indicator').forEach(indicator => {
        indicator.classList.toggle('always-visible', STATE.showCenterIndicators);
    });
    
    // Update button appearance
    DOM.toggleCenters.style.background = STATE.showCenterIndicators ? '#5a3db8' : '#667eea';
    DOM.toggleCenters.style.opacity = STATE.showCenterIndicators ? '1' : '0.7';
    
    const status = STATE.showCenterIndicators ? 'enabled' : 'disabled';
    showMessage(`Center indicators ${status}`, 'info', 1000);
}
