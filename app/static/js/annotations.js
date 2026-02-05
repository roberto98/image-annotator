/**
 * Annotation operations for points, polygons, and figures
 * @module annotations
 * 
 * REWRITTEN: New direct annotation workflow
 * - Tool buttons show label popup immediately
 * - Selected label persists across annotations
 * - Pan mode freezes all interactions
 * 
 * Dependencies: utilities.js (validateCoordinates, formatErrorMessage, formatSuccessMessage)
 */

// Loading state flag to prevent double submissions during save operations
let _isSaving = false;

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

    // Check for potentially malicious content:
    // - No HTML/script tags
    // - No path traversal characters
    // - Only allow alphanumeric, spaces, underscores, hyphens, and common punctuation
    const dangerousPatterns = [
        /<[^>]*>/,           // HTML tags
        /[<>]/,              // Angle brackets
        /\.\.\//,            // Path traversal
        /[\x00-\x1f]/,       // Control characters
        /javascript:/i,      // JavaScript protocol
        /data:/i,            // Data protocol
        /vbscript:/i         // VBScript protocol
    ];

    if (dangerousPatterns.some(pattern => pattern.test(name))) {
        return { valid: false, error: 'Label name contains invalid characters' };
    }

    // Allow alphanumeric, spaces, underscores, hyphens, periods, and parentheses
    const allowedPattern = /^[\w\s\-\.\(\)]+$/;
    if (!allowedPattern.test(name)) {
        return { valid: false, error: 'Label name contains disallowed characters' };
    }

    return { valid: true };
}

/**
 * Switch the current annotation tool
 * Shows label popup for direct annotation workflow
 * @param {string} tool - Tool name: 'landmark', 'polygon', or 'figure'
 * @param {boolean} showPopup - Whether to show the label popup (default: true)
 */
function switchTool(tool, showPopup = true) {
    console.log('[annotations.js] switchTool:', tool);
    STATE.currentTool = tool;

    // Update tool button active states
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Update sidebar title
    const modeNames = {
        point: 'Point', landmark: 'Point', polygon: 'Polygon',
        line: 'Line', circle: 'Circle', rectangle: 'Rectangle',
        angle: 'Angle'
    };
    if (DOM.sidebarTitle) {
        DOM.sidebarTitle.textContent = `Labels (${modeNames[tool] || tool} Mode)`;
    }

    // Show/hide tool-specific panels
    if (DOM.figureConfig) DOM.figureConfig.classList.toggle('active', false);
    if (DOM.polygonTools) DOM.polygonTools.classList.toggle('active', tool === 'polygon');

    // Ensure we're in annotation mode when switching tools
    if (!STATE.isAnnotationMode) {
        STATE.isAnnotationMode = true;
        if (typeof updateModeDisplay === 'function') updateModeDisplay();
    }

    // Activate the new DrawingHandler if available
    if (window.DrawingHandler) {
        window.DrawingHandler.activate(tool);
    }

    showMessage(`Switched to ${tool} mode`);
}

/**
 * Select a label for annotation
 * @param {string} name - The label name to select
 */
function selectLabel(name) {
    console.log('[annotations.js] selectLabel:', name);
    STATE.selectedLabel = name;

    // Sync with new AnnotationState if available
    if (window.AnnotationState) {
        window.AnnotationState.selectedAnnotation = name;
    }

    // Ensure annotation mode is active
    if (!STATE.isAnnotationMode) {
        STATE.isAnnotationMode = true;
        if (typeof updateModeDisplay === 'function') updateModeDisplay();
    }

    showMessage(`Selected: ${name} (${STATE.currentTool} mode)`);
}

/**
 * Deselect current label
 */
function deselectLabel() {
    STATE.selectedLabel = null;
    if (window.AnnotationState) {
        window.AnnotationState.selectedAnnotation = null;
    }
}

function toggleVisibility(name) {
    STATE.visibilityToggles = {
        ...STATE.visibilityToggles,
        [name]: !STATE.visibilityToggles[name]
    };
}

async function markOccluded(name) {
    if (_isSaving) {
        showMessage('Save operation in progress...', 'info');
        return;
    }

    // Validate label name before sending to server
    const labelValidation = validateLabelName(name);
    if (!labelValidation.valid) {
        showMessage(labelValidation.error, 'error');
        return;
    }

    _isSaving = true;
    try {
        const response = await fetch(`/api/landmarks/${window.patientId}/${window.imageName}/${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'occluded' })
        });

        const data = await response.json();
        if (data.status === 'success') {
            STATE.annotations = {
                ...STATE.annotations,
                [name]: {
                    status: 'occluded/missing',
                    timestamp: createTimestamp()
                }
            };
            saveToHistory();
            showMessage(formatSuccessMessage('Marked', name, 'occluded'), 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(formatErrorMessage('mark', 'annotation as occluded', error), 'error');
    } finally {
        _isSaving = false;
    }
}


/**
 * Delete an annotation after user confirmation
 * @async
 * @param {string} name - The label name to delete
 * @returns {Promise<void>}
 */
async function deleteAnnotation(name) {
    if (_isSaving) {
        showMessage('Save operation in progress...', 'info');
        return;
    }

    // Validate label name before sending to server
    const labelValidation = validateLabelName(name);
    if (!labelValidation.valid) {
        showMessage(labelValidation.error, 'error');
        return;
    }

    // No confirmation dialog - undo is available via Ctrl+Z (US-020)

    _isSaving = true;
    try {
        // Use v2 API for deletion
        if (window.AnnotationAPI?.deleteAnnotation) {
            await window.AnnotationAPI.deleteAnnotation(
                window.patientId,
                window.imageName,
                name
            );
        } else {
            throw new Error('AnnotationAPI not available');
        }

        // Update both state systems
        const { [name]: _, ...rest } = STATE.annotations;
        STATE.annotations = rest;
        if (STATE.selectedLabel === name) {
            STATE.selectedLabel = null;
        }

        // Sync with AnnotationState
        if (window.AnnotationState?.removeAnnotation) {
            window.AnnotationState.removeAnnotation(name);
        }

        saveToHistory();
        showMessage(formatSuccessMessage('Deleted', `annotation for ${name}`), 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage(formatErrorMessage('delete', 'annotation', error), 'error');
    } finally {
        _isSaving = false;
    }
}

/**
 * Create a timestamp string in ISO format
 * @returns {string} ISO timestamp
 */
function createTimestamp() {
    return new Date().toISOString();
}

/**
 * Save a landmark point annotation
 * @async
 * @param {{x: number, y: number}} coords - Image coordinates
 * @returns {Promise<void>}
 */
async function annotateLandmark(coords) {
    if (_isSaving) {
        showMessage('Save operation in progress...', 'info');
        return;
    }

    if (!STATE.selectedLabel) {
        showMessage('Please select a label first', 'warning');
        return;
    }

    // Validate label name before sending to server
    const labelValidation = validateLabelName(STATE.selectedLabel);
    if (!labelValidation.valid) {
        showMessage(labelValidation.error, 'error');
        return;
    }

    // Validate coordinates before processing
    const validation = validateCoordinates(coords);
    if (!validation.valid) {
        showMessage(validation.error, 'error');
        return;
    }

    _isSaving = true;
    try {
        const response = await fetch(`/api/landmarks/${window.patientId}/${window.imageName}/${encodeURIComponent(STATE.selectedLabel)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'coordinates',
                x: coords.x,
                y: coords.y
            })
        });

        const data = await response.json();
        if (data.status === 'success') {
            STATE.annotations = {
                ...STATE.annotations,
                [STATE.selectedLabel]: {
                    status: 'ok',
                    coordinates: { x: coords.x, y: coords.y },
                    timestamp: createTimestamp()
                }
            };
            saveToHistory();
            showMessage(formatSuccessMessage('Annotated', STATE.selectedLabel), 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(formatErrorMessage('save', 'annotation', error), 'error');
    } finally {
        _isSaving = false;
    }
}

async function propagateAnnotations() {
    // Validate required state
    if (!window.patientId || typeof window.patientId !== 'string') {
        showMessage('Invalid patient ID', 'error');
        return;
    }
    if (!window.imageName || typeof window.imageName !== 'string') {
        showMessage('Invalid image name', 'error');
        return;
    }
    if (!STATE.annotations || typeof STATE.annotations !== 'object') {
        showMessage('Invalid annotations data', 'error');
        return;
    }

    const annotationCount = Object.keys(STATE.annotations).length;
    if (annotationCount === 0) {
        showMessage('No annotations to propagate', 'warning');
        return;
    }

    if (!confirm(`Propagate ${annotationCount} annotations to the next unannotated image?`)) {
        return;
    }

    try {
        showMessage('Propagating annotations...', 'info');

        const response = await fetch('/api/propagate-annotations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_patient: window.patientId,
                current_image: window.imageName,
                annotations: STATE.annotations
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showMessage(`Annotations propagated to ${data.target_patient}/${data.target_image}`, 'success');

            if (data.target_patient && data.target_image && confirm('Navigate to the target image?')) {
                window.location.href = `/annotate/${encodeURIComponent(data.target_patient)}/${encodeURIComponent(data.target_image)}`;
            }
        } else {
            showMessage(data.message || 'Failed to propagate annotations', 'error');
        }
    } catch (error) {
        console.error('Error propagating annotations:', error);
        showMessage(formatErrorMessage('propagate', 'annotations', error), 'error');
    }
}

async function nextUnannotatedImage() {
    try {
        // Use URLSearchParams for safe query string construction (prevents injection)
        const params = new URLSearchParams({
            current_patient: window.patientId,
            current_image: window.imageName
        });
        const response = await fetch(`/api/next-unannotated?${params.toString()}`);
        const data = await response.json();
        
        if (data.patient && data.image) {
            window.location.href = `/annotate/${encodeURIComponent(data.patient)}/${encodeURIComponent(data.image)}`;
        } else {
            showMessage('No more unannotated images found', 'info');
        }
    } catch (error) {
        console.error('Error finding next unannotated image:', error);
        showMessage(formatErrorMessage('find', 'next image', error), 'error');
    }
}
