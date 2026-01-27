// Coordinate conversion, toast messages, and UI utility functions

/**
 * Convert mouse event coordinates to image coordinates
 * @param {MouseEvent} e
 * @returns {{x: number, y: number}}
 */
function eventToImageCoords(e) {
    const rect = DOM.imageContainer.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - STATE.translateX) / STATE.currentZoom,
        y: (e.clientY - rect.top - STATE.translateY) / STATE.currentZoom
    };
}

/**
 * Convert image coordinates to display (screen) coordinates
 * @param {number} imageX
 * @param {number} imageY
 * @returns {{x: number, y: number}}
 */
function imageToDisplayCoords(imageX, imageY) {
    return {
        x: imageX * STATE.currentZoom + STATE.translateX,
        y: imageY * STATE.currentZoom + STATE.translateY
    };
}

/**
 * Convert display (screen) coordinates to image coordinates
 * @param {number} displayX
 * @param {number} displayY
 * @returns {{x: number, y: number}}
 */
function displayToImageCoords(displayX, displayY) {
    return {
        x: (displayX - STATE.translateX) / STATE.currentZoom,
        y: (displayY - STATE.translateY) / STATE.currentZoom
    };
}

/**
 * @param {number} x - X coordinate in image space
 * @param {number} y - Y coordinate in image space
 * @returns {boolean}
 */
function isWithinImageBounds(x, y) {
    return x >= 0 && y >= 0 && x < STATE.naturalWidth && y < STATE.naturalHeight;
}

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
        renderLabelList();
        renderAnnotations(true);
        updateUndoRedoButtons();
        showMessage('Undo successful', 'success');
    }
}

function redo() {
    if (window.AppStore.redo()) {
        renderLabelList();
        renderAnnotations(true);
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
    showMessage(STATE.isAnnotationMode ? 'Annotation Mode' : 'Panning Mode');
}

function updateModeDisplay() {
    const isPanning = !STATE.isAnnotationMode;
    DOM.modeIndicator.classList.toggle('panning', isPanning);
    DOM.modeIndicator.querySelector('span').textContent =
        STATE.isAnnotationMode ? 'Annotation Mode' : 'Panning Mode';
    DOM.imageContainer.style.cursor = STATE.isAnnotationMode ? 'crosshair' : 'grab';
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
