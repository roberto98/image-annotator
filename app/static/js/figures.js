// Figure drawing and manipulation operations

/**
 * Clean up and remove the figure preview element
 */
function cleanupFigurePreview() {
    if (STATE.figurePreview) {
        STATE.figurePreview.remove();
        STATE.figurePreview = null;
    }
}

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

/**
 * Save a figure annotation to the server
 * @async
 * @param {Object} figureData - The figure data to save
 * @returns {Promise<Object>} Server response data
 */
async function saveFigureToServer(figureData) {
    const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${STATE.selectedLabel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'figure', ...figureData })
    });
    return response.json();
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
}

/**
 * Start drawing a new figure at the given coordinates
 * @param {{x: number, y: number}} coords - Starting coordinates in image space
 */
function startFigureDrawing(coords) {
    if (STATE.figureShape === 'line') {
        if (!STATE.linePoints) STATE.linePoints = [];

        STATE.linePoints.push({ x: coords.x, y: coords.y });

        if (STATE.linePoints.length === 1) {
            STATE.figurePreview = document.createElement('div');
            STATE.figurePreview.className = 'line-preview';
            STATE.figurePreview.style.position = 'absolute';
            STATE.figurePreview.style.pointerEvents = 'none';
            STATE.figurePreview.style.zIndex = '15';
            DOM.imageContainer.appendChild(STATE.figurePreview);
        } else if (STATE.linePoints.length === 2) {
            completeLineDrawing();
            return;
        }
    } else {
        STATE.figureDrawing = true;
        STATE.figureStartX = coords.x;
        STATE.figureStartY = coords.y;

        STATE.figurePreview = document.createElement('div');
        STATE.figurePreview.className = `figure-shape figure-${STATE.figureShape}`;
        STATE.figurePreview.style.borderColor = '#7950f2';
        STATE.figurePreview.style.background = 'rgba(121, 80, 242, 0.2)';
        STATE.figurePreview.style.borderWidth = '3px';
        STATE.figurePreview.style.borderStyle = 'dashed';
        
        DOM.imageContainer.appendChild(STATE.figurePreview);
    }
}

/**
 * Update the figure preview during drawing
 * @param {{x: number, y: number}} coords - Current mouse coordinates in image space
 */
function updateFigurePreview(coords) {
    if (!STATE.figurePreview) return;

    if (STATE.figureShape === 'line' && STATE.linePoints.length === 1) {
        const { length, angle, centerX, centerY } = calculateLineProperties(STATE.linePoints[0], coords);
        const displayCenter = viewport.imageToDisplay(centerX, centerY);
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
    } else if (STATE.figureShape !== 'line') {
        const dx = coords.x - STATE.figureStartX;
        const dy = coords.y - STATE.figureStartY;
        const size = Math.sqrt(dx * dx + dy * dy) * 2;

        const displayCenter = viewport.imageToDisplay(STATE.figureStartX, STATE.figureStartY);
        const displaySize = size * STATE.currentZoom;

        Object.assign(STATE.figurePreview.style, {
            left: `${displayCenter.x - displaySize / 2}px`,
            top: `${displayCenter.y - displaySize / 2}px`,
            width: `${displaySize}px`,
            height: `${displaySize}px`,
            transform: 'none'
        });
    }
}

async function completeLineDrawing() {
    if (STATE.linePoints.length !== 2) return;

    const [startPoint, endPoint] = STATE.linePoints;
    const { length, centerX, centerY } = calculateLineProperties(startPoint, endPoint);

    if (length < 10) {
        showMessage('Line too short, draw longer', 'warning');
        STATE.linePoints = [];
        cleanupFigurePreview();
        return;
    }

    try {
        const data = await saveFigureToServer({
            x: centerX,
            y: centerY,
            shape: 'line',
            size: Math.round(length),
            startX: startPoint.x,
            startY: startPoint.y,
            endX: endPoint.x,
            endY: endPoint.y
        });

        if (data.status === 'success') {
            STATE.annotations[STATE.selectedLabel] = {
                type: 'figure',
                status: 'ok',
                x: centerX,
                y: centerY,
                shape: 'line',
                size: Math.round(length),
                startX: startPoint.x,
                startY: startPoint.y,
                endX: endPoint.x,
                endY: endPoint.y,
                timestamp: createTimestamp()
            };

            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage(`Created line (${Math.round(length)}px)`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to save line', 'error');
    } finally {
        STATE.linePoints = [];
        cleanupFigurePreview();
    }
}

async function completeFigureDrawing(coords) {
    if (!STATE.figureDrawing) return;

    const dx = coords.x - STATE.figureStartX;
    const dy = coords.y - STATE.figureStartY;
    const size = Math.round(Math.sqrt(dx * dx + dy * dy) * 2);

    if (size < 10) {
        showMessage('Figure too small, draw larger', 'warning');
        cleanupFigurePreview();
        STATE.figureDrawing = false;
        return;
    }

    try {
        const data = await saveFigureToServer({
            x: STATE.figureStartX,
            y: STATE.figureStartY,
            shape: STATE.figureShape,
            size
        });

        if (data.status === 'success') {
            STATE.annotations[STATE.selectedLabel] = {
                type: 'figure',
                status: 'ok',
                x: STATE.figureStartX,
                y: STATE.figureStartY,
                shape: STATE.figureShape,
                size,
                timestamp: createTimestamp()
            };
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage(`Created ${STATE.figureShape} (${size}px)`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to save figure', 'error');
    } finally {
        cleanupFigurePreview();
        STATE.figureDrawing = false;
    }
}

function updateFigureInteractivity() {
    document.querySelectorAll('.figure-shape').forEach(figure => {
        const isInteractive = !STATE.isAnnotationMode && STATE.selectedLabel === figure.dataset.figureName;

        figure.classList.remove('interactive', 'non-interactive');
        figure.classList.add(isInteractive ? 'interactive' : 'non-interactive');

        const displayValue = isInteractive ? 'block' : 'none';
        figure.querySelectorAll('.resize-handle, .line-point').forEach(el => {
            el.style.display = displayValue;
        });
    });
}

function handleFigureClick(e) {
    e.stopPropagation();
    if (STATE.isAnnotationMode) return;
    selectFigure(e.target.dataset.figureName);
}

function handleFigureMouseDown(e) {
    e.stopPropagation();

    if (STATE.isAnnotationMode) return;

    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.target.classList.contains('resize-handle')) {
        STATE.figureResizing = true;
        STATE.resizeHandle = e.target.dataset.handle;
        STATE.figureOriginalSize = STATE.annotations[e.target.closest('.figure-shape').dataset.figureName].size;
        STATE.figureDragStartX = mouseX;
        STATE.figureDragStartY = mouseY;
    } else {
        STATE.figureDragging = true;
        STATE.selectedFigure = e.target.dataset.figureName;
        STATE.figureDragStartX = mouseX;
        STATE.figureDragStartY = mouseY;

        const figureData = STATE.annotations[STATE.selectedFigure];
        STATE.figureOriginalX = figureData.x;
        STATE.figureOriginalY = figureData.y;

        const figureElement = e.target.closest('.figure-shape');
        const figureRect = figureElement.getBoundingClientRect();

        STATE.figureDragOffsetX = (figureRect.left + figureRect.width / 2) - e.clientX;
        STATE.figureDragOffsetY = (figureRect.top + figureRect.height / 2) - e.clientY;
    }
}

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

function deselectAllFigures() {
    document.querySelectorAll('.figure-shape').forEach(fig => {
        fig.classList.remove('selected');
    });
    STATE.selectedFigure = null;
}

/**
 * Update label position next to a figure element
 * @param {HTMLElement} figureElement - The figure DOM element
 * @param {{x: number, y: number}} displayCoords - Display coordinates
 * @param {number} displaySize - Display size
 */
function updateFigureLabel(figureElement, displayCoords, displaySize) {
    const label = figureElement.nextElementSibling;
    if (label && label.classList.contains('annotation-label')) {
        label.style.left = `${displayCoords.x + displaySize / 2}px`;
        label.style.top = `${displayCoords.y}px`;
    }
}

function updateFigurePosition(figureName, newX, newY) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;

    figureData.x = newX;
    figureData.y = newY;

    const displayCoords = viewport.imageToDisplay(newX, newY);
    const displaySize = figureData.size * STATE.currentZoom;
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);

    if (figureElement) {
        figureElement.style.left = `${displayCoords.x - displaySize / 2}px`;
        figureElement.style.top = `${displayCoords.y - displaySize / 2}px`;
        updateFigureLabel(figureElement, displayCoords, displaySize);
    }
}

function updateFigureSize(figureName, newSize) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;

    figureData.size = Math.max(10, newSize);

    const displayCoords = viewport.imageToDisplay(figureData.x, figureData.y);
    const displaySize = figureData.size * STATE.currentZoom;
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);

    if (figureElement) {
        Object.assign(figureElement.style, {
            left: `${displayCoords.x - displaySize / 2}px`,
            top: `${displayCoords.y - displaySize / 2}px`,
            width: `${displaySize}px`,
            height: `${displaySize}px`
        });
        updateFigureLabel(figureElement, displayCoords, displaySize);
    }
}

async function completeFigureInteraction() {
    if ((STATE.figureDragging || STATE.figureResizing) && STATE.selectedFigure) {
        const figureData = STATE.annotations[STATE.selectedFigure];
        await saveFigureUpdate(STATE.selectedFigure, figureData.x, figureData.y, figureData.shape, figureData.size);
    }

    STATE.figureDragging = false;
    STATE.figureResizing = false;
    STATE.resizeHandle = null;
}

async function saveFigureUpdate(figureName, x, y, shape, size) {
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', x, y, shape, size })
        });

        const data = await response.json();
        if (data.status === 'success') {
            saveToHistory();
            showMessage(`Updated ${figureName}`, 'success');
        }
    } catch (error) {
        console.error('Error updating figure:', error);
        showMessage('Failed to update figure', 'error');
    }
}

async function deleteSelectedFigure() {
    if (!STATE.selectedFigure) return;
    
    const figureName = STATE.selectedFigure;
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove' })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            delete STATE.annotations[figureName];
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            deselectAllFigures();
            showMessage(`Deleted ${figureName}`, 'success');
        }
    } catch (error) {
        console.error('Error deleting figure:', error);
        showMessage('Failed to delete figure', 'error');
    }
}

function handleLineMouseDown(e) {
    e.stopPropagation();

    if (STATE.isAnnotationMode) return;

    const figureElement = e.target.closest('.figure-shape');
    if (!figureElement.classList.contains('interactive')) return;

    const figureName = figureElement.dataset.figureName;
    const figureData = STATE.annotations[figureName];

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

function handleLinePointMouseDown(e) {
    e.stopPropagation();

    if (STATE.isAnnotationMode) return;

    STATE.linePointDragging = true;
    STATE.linePointDraggedFigure = e.target.dataset.figureName;
    STATE.linePointDraggedType = e.target.dataset.pointType;
}

function updateLineElement(figureName, figureData) {
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);
    if (!figureElement) return;

    const displayStart = viewport.imageToDisplay(figureData.startX, figureData.startY);
    const displayEnd = viewport.imageToDisplay(figureData.endX, figureData.endY);
    const { length, angle } = calculateLineProperties(displayStart, displayEnd);

    const centerX = (displayStart.x + displayEnd.x) / 2;
    const centerY = (displayStart.y + displayEnd.y) / 2;

    Object.assign(figureElement.style, {
        left: `${centerX - length / 2}px`,
        top: `${centerY - 1.5}px`,
        width: `${length}px`,
        height: '3px',
        transform: `rotate(${angle}deg)`
    });

    const label = figureElement.nextElementSibling;
    if (label && label.classList.contains('annotation-label')) {
        const displayCoords = viewport.imageToDisplay(figureData.x, figureData.y);
        label.style.left = `${displayCoords.x + length / 2}px`;
        label.style.top = `${displayCoords.y}px`;
    }

    const startPoint = figureElement.querySelector('.line-start');
    const endPoint = figureElement.querySelector('.line-end');

    if (startPoint) {
        startPoint.style.left = '0px';
        startPoint.style.top = '50%';
    }

    if (endPoint) {
        endPoint.style.left = '100%';
        endPoint.style.top = '50%';
    }
}

async function completeLinePointInteraction() {
    if (STATE.linePointDragging && STATE.linePointDraggedFigure) {
        const figureName = STATE.linePointDraggedFigure;
        const figureData = STATE.annotations[figureName];
        
        try {
            const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    x: figureData.x,
                    y: figureData.y,
                    shape: 'line',
                    size: figureData.size,
                    startX: figureData.startX,
                    startY: figureData.startY,
                    endX: figureData.endX,
                    endY: figureData.endY
                })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                saveToHistory();
                showMessage('Line updated', 'success');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Failed to update line', 'error');
        }

        STATE.linePointDragging = false;
        STATE.linePointDraggedFigure = null;
        STATE.linePointDraggedType = null;
    }
}

/**
 * Move the selected figure using arrow keys
 * Step size: 1px (normal), 10px (Shift), 0.5px (Ctrl/Cmd)
 * @param {'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight'} direction - Arrow key direction
 * @param {KeyboardEvent} e - The keyboard event
 */
function moveFigureWithArrow(direction, e) {
    if (!STATE.selectedFigure) return;

    const figureData = STATE.annotations[STATE.selectedFigure];

    let stepSize = 1;
    if (e.shiftKey) {
        stepSize = 10;
    } else if (e.ctrlKey || e.metaKey) {
        stepSize = 0.5;
    }

    const deltas = {
        ArrowUp: { x: 0, y: -stepSize },
        ArrowDown: { x: 0, y: stepSize },
        ArrowLeft: { x: -stepSize, y: 0 },
        ArrowRight: { x: stepSize, y: 0 }
    };

    const delta = deltas[direction];
    if (!delta) return;

    const newX = Math.max(0, Math.min(STATE.naturalWidth, figureData.x + delta.x));
    const newY = Math.max(0, Math.min(STATE.naturalHeight, figureData.y + delta.y));

    updateFigurePosition(STATE.selectedFigure, newX, newY);
    saveFigureUpdate(STATE.selectedFigure, newX, newY, figureData.shape, figureData.size);

    let modifier = '';
    if (e.shiftKey) modifier = ' (Shift)';
    else if (e.ctrlKey || e.metaKey) modifier = ' (Ctrl)';
    showMessage(`Moved ${stepSize}px${modifier}`, 'info', 500);
}
