/**
 * Figure drawing and manipulation operations
 * @module figures
 * 
 * REWRITTEN: Multi-click drawing system
 * - Rectangles/Ellipses: First click = center, Second click = size
 * - Lines: First click = start, Second click = end
 * - No minimum size restriction (uses default if clicks too close)
 * - Figures editable in annotation mode (not just pan mode)
 * - Mobile and automation friendly
 * 
 * Dependencies: utilities.js (calculateLineProperties, getServerErrorMessage, formatErrorMessage, formatSuccessMessage)
 */

// Constants for figure size constraints
const DEFAULT_FIGURE_SIZE = 20; // Default size if clicks are too close
const MIN_FIGURE_SIZE = 5;      // Minimum figure size in pixels
const MIN_LINE_LENGTH = 5;      // Minimum line length in pixels

/**
 * Clean up and remove the figure preview element
 */
function cleanupFigurePreview() {
    if (!STATE.figurePreview) return;
    STATE.figurePreview.remove();
    STATE.figurePreview = null;
}

/**
 * Save a figure annotation to the server
 * @async
 * @param {Object} figureData - The figure data to save
 * @param {string} labelName - The label name (defaults to STATE.selectedLabel)
 * @returns {Promise<Object>} Server response data
 */
async function saveFigureToServer(figureData, labelName = null) {
    const label = labelName || STATE.selectedLabel;
    const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${label}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'figure', ...figureData })
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Check if a line drawing is in progress
 * @returns {boolean} True if line points exist
 */
function hasLinePointsInProgress() {
    return STATE.linePoints?.length > 0;
}

/**
 * Select the figure shape for drawing
 * @param {'circle'|'rectangle'|'line'} shape - The shape to select
 */
function selectFigureShape(shape) {
    STATE.figureShape = shape;
    DOM.circleBtn.classList.toggle('active', shape === 'circle');
    DOM.rectangleBtn.classList.toggle('active', shape === 'rectangle');
    DOM.lineBtn.classList.toggle('active', shape === 'line');

    // Cancel any in-progress drawing when changing shape
    if (STATE.figureDrawing || hasLinePointsInProgress()) {
        cancelFigureDrawing();
    }
}

/**
 * Start drawing a new figure at the given coordinates (multi-click system)
 * First click: set center point (or start point for lines)
 * @param {{x: number, y: number}} coords - Starting coordinates in image space
 */
function startFigureDrawing(coords) {
    if (!STATE.selectedLabel) {
        showMessage('Please select a label first', 'warning');
        return;
    }

    if (STATE.figureShape === 'line') {
        // Line drawing: collect two points
        if (!STATE.linePoints) STATE.linePoints = [];

        STATE.linePoints.push({ x: coords.x, y: coords.y });

        if (STATE.linePoints.length === 1) {
            // First click - create preview
            STATE.figurePreview = document.createElement('div');
            STATE.figurePreview.className = 'line-preview';
            STATE.figurePreview.setAttribute('data-preview', 'line');
            Object.assign(STATE.figurePreview.style, {
                position: 'absolute',
                pointerEvents: 'none',
                zIndex: '15'
            });
            DOM.imageContainer.appendChild(STATE.figurePreview);
            showMessage('Click second point to complete line');
        } else if (STATE.linePoints.length === 2) {
            // Second click - complete line
            completeLineDrawing();
        }
    } else {
        // Circle/Rectangle: first click sets center, second click sets size
        if (!STATE.figureDrawing) {
            // First click - set center
            STATE.figureDrawing = true;
            STATE.figureStartX = coords.x;
            STATE.figureStartY = coords.y;

            // Create preview
            STATE.figurePreview = document.createElement('div');
            STATE.figurePreview.className = `figure-shape figure-${STATE.figureShape}`;
            STATE.figurePreview.setAttribute('data-preview', STATE.figureShape);
            Object.assign(STATE.figurePreview.style, {
                borderColor: '#7950f2',
                background: 'rgba(121, 80, 242, 0.2)',
                borderWidth: '3px',
                borderStyle: 'dashed',
                pointerEvents: 'none'
            });
            DOM.imageContainer.appendChild(STATE.figurePreview);
            
            showMessage('Click to set size');
        } else {
            // Second click - complete figure
            completeFigureDrawing(coords);
        }
    }
}

/**
 * Update the figure preview during drawing (follows mouse)
 * @param {{x: number, y: number}} coords - Current mouse coordinates in image space
 */
function updateFigurePreview(coords) {
    if (!STATE.figurePreview) return;

    if (STATE.figureShape === 'line' && STATE.linePoints.length === 1) {
        // Line preview
        const { length, angle, centerX, centerY } = calculateLineProperties(STATE.linePoints[0], coords);
        const displayCenter = viewport.imageToScreen(centerX, centerY);
        const displayLength = length * STATE.currentZoom;

        Object.assign(STATE.figurePreview.style, {
            left: `${displayCenter.x - displayLength / 2}px`,
            top: `${displayCenter.y - 1.5}px`,
            width: `${displayLength}px`,
            height: '3px',
            background: '#7950f2',
            border: 'none',
            transform: `rotate(${angle}deg)`,
            transformOrigin: '50% 50%'
        });
    } else if (STATE.figureShape !== 'line' && STATE.figureDrawing) {
        // Circle/Rectangle preview - size based on distance from center
        const dx = coords.x - STATE.figureStartX;
        const dy = coords.y - STATE.figureStartY;
        const size = Math.sqrt(dx * dx + dy * dy) * 2;

        const displayCenter = viewport.imageToScreen(STATE.figureStartX, STATE.figureStartY);
        const displaySize = Math.max(size, DEFAULT_FIGURE_SIZE) * STATE.currentZoom;

        Object.assign(STATE.figurePreview.style, {
            left: `${displayCenter.x - displaySize / 2}px`,
            top: `${displayCenter.y - displaySize / 2}px`,
            width: `${displaySize}px`,
            height: `${displaySize}px`,
            transform: 'none'
        });
    }
}

/**
 * Complete line drawing (second click)
 * @async
 * @returns {Promise<void>}
 */
async function completeLineDrawing() {
    if (STATE.linePoints.length !== 2) return;

    const [startPoint, endPoint] = STATE.linePoints;
    const { length, centerX, centerY } = calculateLineProperties(startPoint, endPoint);

    // Use default size if line is too short
    const finalLength = length < MIN_LINE_LENGTH ? DEFAULT_FIGURE_SIZE : length;

    try {
        const data = await saveFigureToServer({
            x: centerX,
            y: centerY,
            shape: 'line',
            size: Math.round(finalLength),
            startX: startPoint.x,
            startY: startPoint.y,
            endX: endPoint.x,
            endY: endPoint.y
        });

        if (data.status !== 'success') {
            throw new Error(getServerErrorMessage(data));
        }

        STATE.annotations = {
            ...STATE.annotations,
            [STATE.selectedLabel]: {
                type: 'figure',
                status: 'ok',
                x: centerX,
                y: centerY,
                shape: 'line',
                size: Math.round(finalLength),
                startX: startPoint.x,
                startY: startPoint.y,
                endX: endPoint.x,
                endY: endPoint.y,
                timestamp: createTimestamp()
            }
        };

        saveToHistory();
        showMessage(formatSuccessMessage('Created', 'line', `${Math.round(finalLength)}px`), 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage(formatErrorMessage('save', 'line', error), 'error');
    } finally {
        STATE.linePoints = [];
        cleanupFigurePreview();
    }
}

/**
 * Complete figure drawing (second click for circles/rectangles)
 * @async
 * @param {{x: number, y: number}} coords - Second click coordinates
 * @returns {Promise<void>}
 */
async function completeFigureDrawing(coords) {
    if (!STATE.figureDrawing) return;

    const dx = coords.x - STATE.figureStartX;
    const dy = coords.y - STATE.figureStartY;
    const rawSize = Math.sqrt(dx * dx + dy * dy) * 2;
    
    // Use default size if too small
    const size = Math.round(rawSize < MIN_FIGURE_SIZE ? DEFAULT_FIGURE_SIZE : rawSize);

    try {
        const data = await saveFigureToServer({
            x: STATE.figureStartX,
            y: STATE.figureStartY,
            shape: STATE.figureShape,
            size
        });

        if (data.status !== 'success') {
            throw new Error(getServerErrorMessage(data));
        }

        STATE.annotations = {
            ...STATE.annotations,
            [STATE.selectedLabel]: {
                type: 'figure',
                status: 'ok',
                x: STATE.figureStartX,
                y: STATE.figureStartY,
                shape: STATE.figureShape,
                size,
                timestamp: createTimestamp()
            }
        };
        saveToHistory();
        showMessage(formatSuccessMessage('Created', STATE.figureShape, `${size}px`), 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage(formatErrorMessage('save', 'figure', error), 'error');
    } finally {
        cleanupFigurePreview();
        STATE.figureDrawing = false;
    }
}

/**
 * Cancel in-progress figure drawing
 */
function cancelFigureDrawing() {
    STATE.figureDrawing = false;
    STATE.linePoints = [];
    cleanupFigurePreview();
    showMessage('Drawing cancelled');
}

/**
 * Update figure interactivity based on current state
 * REWRITTEN: Figures are now interactive in annotation mode when their label is selected
 */
function updateFigureInteractivity() {
    document.querySelectorAll('.figure-shape').forEach(figure => {
        const figureName = figure.dataset.figureName;
        
        // Figures are interactive when:
        // 1. In annotation mode (not pan mode)
        // 2. Using figure tool
        // 3. This figure's label is selected
        const isInteractive = STATE.isAnnotationMode && 
                             STATE.currentTool === 'figure' && 
                             STATE.selectedLabel === figureName;

        figure.classList.toggle('interactive', isInteractive);
        figure.classList.toggle('non-interactive', !isInteractive);

        // Show/hide handles
        const displayValue = isInteractive ? 'block' : 'none';
        figure.querySelectorAll('.resize-handle, .line-point').forEach(el => {
            el.style.display = displayValue;
        });
    });
}

/**
 * Handle click on a figure element
 * @param {Event} e - Click event
 */
function handleFigureClick(e) {
    e.stopPropagation();
    
    // In pan mode, ignore clicks
    if (!STATE.isAnnotationMode) return;
    
    const figureName = e.target.dataset.figureName || e.target.closest('.figure-shape')?.dataset.figureName;
    if (!figureName) return;

    // In annotation mode, clicking a figure selects its label
    if (STATE.currentTool === 'figure') {
        STATE.selectedLabel = figureName;
        selectFigure(figureName);
        updateFigureInteractivity();
        showMessage(`Selected: ${figureName}`);
    }
}

/**
 * Handle mouse down on a figure element
 * @param {Event} e - Mouse event
 */
function handleFigureMouseDown(e) {
    e.stopPropagation();

    // In pan mode, ignore
    if (!STATE.isAnnotationMode) return;

    const figureElement = e.target.closest('.figure-shape');
    if (!figureElement || !figureElement.classList.contains('interactive')) return;

    const figureName = figureElement.dataset.figureName;
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;

    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.target.classList.contains('resize-handle')) {
        // Start resize
        STATE.figureResizing = true;
        STATE.resizeHandle = e.target.dataset.handle;
        STATE.selectedFigure = figureName;
        STATE.figureOriginalSize = figureData.size;
        STATE.figureDragStartX = mouseX;
        STATE.figureDragStartY = mouseY;
    } else {
        // Start drag
        STATE.figureDragging = true;
        STATE.selectedFigure = figureName;
        STATE.figureDragStartX = mouseX;
        STATE.figureDragStartY = mouseY;
        STATE.figureOriginalX = figureData.x;
        STATE.figureOriginalY = figureData.y;

        const figureRect = figureElement.getBoundingClientRect();
        STATE.figureDragOffsetX = (figureRect.left + figureRect.width / 2) - e.clientX;
        STATE.figureDragOffsetY = (figureRect.top + figureRect.height / 2) - e.clientY;
    }
}

/**
 * Select a figure for editing
 * @param {string} figureName - Name of the figure to select
 */
function selectFigure(figureName) {
    document.querySelectorAll('.figure-shape').forEach(fig => {
        fig.classList.remove('selected');
    });

    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);
    if (figureElement) {
        figureElement.classList.add('selected');
        STATE.selectedFigure = figureName;
    }
}

/**
 * Deselect all figures
 */
function deselectAllFigures() {
    document.querySelectorAll('.figure-shape').forEach(fig => {
        fig.classList.remove('selected');
    });
    STATE.selectedFigure = null;
}

/**
 * Update figure position
 * @param {string} figureName - Name of the figure
 * @param {number} newX - New X coordinate
 * @param {number} newY - New Y coordinate
 */
function updateFigurePosition(figureName, newX, newY) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;

    STATE.annotations = {
        ...STATE.annotations,
        [figureName]: {
            ...figureData,
            x: newX,
            y: newY
        }
    };
}

/**
 * Update figure size
 * @param {string} figureName - Name of the figure
 * @param {number} newSize - New size
 */
function updateFigureSize(figureName, newSize) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;

    STATE.annotations = {
        ...STATE.annotations,
        [figureName]: {
            ...figureData,
            size: Math.max(MIN_FIGURE_SIZE, newSize)
        }
    };
}

/**
 * Save figure update to server
 * @async
 * @param {string} figureName - Name of the figure to update
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} shape - Figure shape type
 * @param {number} size - Figure size
 * @returns {Promise<void>}
 */
async function saveFigureUpdate(figureName, x, y, shape, size) {
    try {
        const figureData = STATE.annotations[figureName];
        const requestBody = { action: 'update', x, y, shape, size };
        
        // Include line-specific data
        if (shape === 'line' && figureData) {
            requestBody.startX = figureData.startX;
            requestBody.startY = figureData.startY;
            requestBody.endX = figureData.endX;
            requestBody.endY = figureData.endY;
        }

        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(getServerErrorMessage(data));
        }

        saveToHistory();
        showMessage(formatSuccessMessage('Updated', figureName), 'success');
    } catch (error) {
        console.error('Error updating figure:', error);
        showMessage(formatErrorMessage('update', 'figure', error), 'error');
    }
}

/**
 * Delete the currently selected figure
 */
async function deleteSelectedFigure() {
    if (!STATE.selectedFigure) return;
    
    const figureName = STATE.selectedFigure;
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove' })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.status === 'success') {
            const { [figureName]: _, ...rest } = STATE.annotations;
            STATE.annotations = rest;
            saveToHistory();
            deselectAllFigures();
            showMessage(formatSuccessMessage('Deleted', figureName), 'success');
        }
    } catch (error) {
        console.error('Error deleting figure:', error);
        showMessage(formatErrorMessage('delete', 'figure', error), 'error');
    }
}

/**
 * Handle mouse down on line element
 */
function handleLineMouseDown(e) {
    e.stopPropagation();

    if (!STATE.isAnnotationMode) return;

    const figureElement = e.target.closest('.figure-shape');
    if (!figureElement.classList.contains('interactive')) return;

    const figureName = figureElement.dataset.figureName;
    const figureData = STATE.annotations[figureName];

    // Guard against deleted annotations
    if (!figureData) return;

    STATE.figureDragging = true;
    STATE.selectedFigure = figureName;

    const rect = DOM.imageContainer.getBoundingClientRect();
    STATE.figureDragStartX = e.clientX - rect.left;
    STATE.figureDragStartY = e.clientY - rect.top;

    STATE.figureOriginalX = figureData.x;
    STATE.figureOriginalY = figureData.y;
    STATE.figureOriginalStartX = figureData.startX;
    STATE.figureOriginalStartY = figureData.startY;
    STATE.figureOriginalEndX = figureData.endX;
    STATE.figureOriginalEndY = figureData.endY;

    const figureRect = figureElement.getBoundingClientRect();
    STATE.figureDragOffsetX = (figureRect.left + figureRect.width / 2) - e.clientX;
    STATE.figureDragOffsetY = (figureRect.top + figureRect.height / 2) - e.clientY;
}

/**
 * Handle mouse down on line endpoint
 */
function handleLinePointMouseDown(e) {
    e.stopPropagation();

    if (!STATE.isAnnotationMode) return;

    STATE.linePointDragging = true;
    STATE.linePointDraggedFigure = e.target.dataset.figureName;
    STATE.linePointDraggedType = e.target.dataset.pointType;
}

