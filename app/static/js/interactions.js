/**
 * Mouse and keyboard interaction handlers
 * @module interactions
 */

let lastMouseUpdateTime = 0;
const MOUSE_UPDATE_INTERVAL = 16; // ~60fps

/**
 * Handle mouse down event on the image container
 * Routes to appropriate handler based on current tool and mode
 * @param {MouseEvent} e - The mouse event
 */
function handleMouseDown(e) {
    const rect = DOM.imageContainer.getBoundingClientRect();
    STATE.startDragX = e.clientX - rect.left;
    STATE.startDragY = e.clientY - rect.top;

    const isInteractiveElement = e.target.classList.contains('figure-shape') ||
                                 e.target.classList.contains('resize-handle') ||
                                 e.target.classList.contains('line-point');

    if (!isInteractiveElement) deselectAllFigures();

    const clickedOnLine = e.target.classList.contains('figure-line') ||
                         e.target.classList.contains('line-point') ||
                         e.target.closest('.figure-line');

    if (STATE.isAnnotationMode) {
        if (!STATE.selectedLabel) {
            showMessage('Please select a label first', 'warning');
            return;
        }

        const coords = viewport.eventToImage(e);
        if (!viewport.isWithinBounds(coords.x, coords.y)) {
            showMessage('Click within image bounds', 'warning');
            return;
        }

        if (STATE.currentTool === 'landmark') {
            annotateLandmark(coords);
        } else if (STATE.currentTool === 'polygon') {
            handlePolygonClick(coords);
        } else if (STATE.currentTool === 'figure') {
            if (clickedOnLine && STATE.figureShape === 'line') return;
            startFigureDrawing(coords);
        }
    } else {
        STATE.isDragging = true;
        DOM.imageContainer.style.cursor = 'grabbing';
    }
}

/**
 * Handle mouse move event for dragging, drawing, and coordinate display
 * Throttled for performance optimization
 * @param {MouseEvent} e - The mouse event
 */
function handleMouseMove(e) {
    if (!STATE.imageLoaded) return;

    const rect = DOM.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const coords = viewport.eventToImage(e);

    const now = performance.now();
    if (now - lastMouseUpdateTime >= MOUSE_UPDATE_INTERVAL) {
        lastMouseUpdateTime = now;
        const inBounds = viewport.isWithinBounds(coords.x, coords.y);
        DOM.mousePosition.textContent = `X: ${Math.round(coords.x)}, Y: ${Math.round(coords.y)}`;
        DOM.mousePosition.style.color = inBounds ? 'white' : '#ff6b6b';
    }

    if (STATE.isDragging && !STATE.isAnnotationMode) {
        STATE.translateX += mouseX - STATE.startDragX;
        STATE.translateY += mouseY - STATE.startDragY;
        applyZoom();
        STATE.startDragX = mouseX;
        STATE.startDragY = mouseY;
    }

    if (STATE.polygonDragging && STATE.currentTool === 'polygon') {
        handlePolygonDrag(coords);
    }

    if (STATE.figureDrawing && STATE.currentTool === 'figure') {
        updateFigurePreview(coords);
    }

    if (STATE.currentTool === 'figure' && STATE.figureShape === 'line' && STATE.linePoints.length === 1) {
        updateFigurePreview(coords);
    }

    if (STATE.figureDragging && STATE.selectedFigure) {
        const newImageCoords = viewport.displayToImage(mouseX + STATE.figureDragOffsetX, mouseY + STATE.figureDragOffsetY);
        const figureData = STATE.annotations[STATE.selectedFigure];

        if (figureData.shape === 'line') {
            const deltaX = newImageCoords.x - STATE.figureOriginalX;
            const deltaY = newImageCoords.y - STATE.figureOriginalY;

            figureData.startX = STATE.figureOriginalStartX + deltaX;
            figureData.startY = STATE.figureOriginalStartY + deltaY;
            figureData.endX = STATE.figureOriginalEndX + deltaX;
            figureData.endY = STATE.figureOriginalEndY + deltaY;
            figureData.x = newImageCoords.x;
            figureData.y = newImageCoords.y;

            updateLineElement(STATE.selectedFigure, figureData);
        } else {
            updateFigurePosition(STATE.selectedFigure, newImageCoords.x, newImageCoords.y);
        }
    }

    if (STATE.figureResizing && STATE.selectedFigure && STATE.resizeHandle) {
        const handle = STATE.resizeHandle;
        let sizeChange = 0;

        const deltaX = (mouseX - STATE.figureDragStartX) / STATE.currentZoom;
        const deltaY = (mouseY - STATE.figureDragStartY) / STATE.currentZoom;

        if (handle.includes('e')) sizeChange += deltaX;
        if (handle.includes('w')) sizeChange -= deltaX;
        if (handle.includes('s')) sizeChange += deltaY;
        if (handle.includes('n')) sizeChange -= deltaY;

        updateFigureSize(STATE.selectedFigure, STATE.figureOriginalSize + sizeChange);
    }

    if (STATE.linePointDragging && STATE.linePointDraggedFigure) {
        const figureData = STATE.annotations[STATE.linePointDraggedFigure];

        if (STATE.linePointDraggedType === 'start') {
            figureData.startX = coords.x;
            figureData.startY = coords.y;
        } else if (STATE.linePointDraggedType === 'end') {
            figureData.endX = coords.x;
            figureData.endY = coords.y;
        }

        figureData.x = (figureData.startX + figureData.endX) / 2;
        figureData.y = (figureData.startY + figureData.endY) / 2;

        const dx = figureData.endX - figureData.startX;
        const dy = figureData.endY - figureData.startY;
        figureData.size = Math.sqrt(dx * dx + dy * dy);

        updateLineElement(STATE.linePointDraggedFigure, figureData);
    }
}

/**
 * Handle mouse up event to complete dragging/drawing operations
 * @param {MouseEvent} e - The mouse event
 */
function handleMouseUp(e) {
    STATE.isDragging = false;
    STATE.polygonDragging = false;
    STATE.selectedPointIndex = -1;

    if (STATE.figureDrawing && STATE.currentTool === 'figure') {
        completeFigureDrawing(viewport.eventToImage(e));
    }

    if (STATE.figureDragging || STATE.figureResizing) {
        completeFigureInteraction();
    }

    if (STATE.linePointDragging) {
        completeLinePointInteraction();
    }
    
    DOM.imageContainer.style.cursor = STATE.isAnnotationMode ? 'crosshair' : 'grab';
}

/**
 * Handle keyboard shortcuts for tools and navigation
 * @param {KeyboardEvent} e - The keyboard event
 */
function handleKeyDown(e) {
    if (e.target === DOM.labelInput) return;

    const keyHandlers = {
        'Delete': () => STATE.selectedFigure && deleteSelectedFigure(),
        'Backspace': () => STATE.selectedFigure && deleteSelectedFigure(),
        'Escape': () => {
            if (STATE.currentTool === 'polygon') {
                cancelPolygon();
            } else {
                deselectAllFigures();
                STATE.selectedLabel = null;
                renderLabelList();
            }
        },
        'c': toggleCenterIndicators,
        'C': toggleCenterIndicators,
        ' ': toggleMode,
        'r': resetView,
        '+': zoomIn,
        '=': zoomIn,
        '-': zoomOut,
        'Enter': () => STATE.currentTool === 'polygon' && completePolygon()
    };

    if (STATE.selectedFigure && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        moveFigureWithArrow(e.key, e);
        return;
    }

    const handler = keyHandlers[e.key];
    if (handler) {
        e.preventDefault();
        handler();
    }
}
