// Toast messages, undo/redo, and UI utility functions
// Coordinate transformations are handled by viewport (services/viewport.js)

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
