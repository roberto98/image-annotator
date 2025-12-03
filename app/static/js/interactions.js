/**
 * Mouse and keyboard interaction handlers
 * @module interactions
 */

// Throttle helper for mouse position updates (improves performance)
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
    
    // Deselect figures if clicking on empty space
    if (!e.target.classList.contains('figure-shape') && !e.target.classList.contains('resize-handle') && !e.target.classList.contains('line-point')) {
        deselectAllFigures();
    }
    
    // Check if clicking on existing line elements
    const clickedOnLine = e.target.classList.contains('figure-line') || 
                        e.target.classList.contains('line-point') ||
                        e.target.closest('.figure-line');
    
    if (STATE.isAnnotationMode) {
        if (!STATE.selectedLabel) {
            showMessage('Please select a label first', 'warning');
            return;
        }
        
        const coords = eventToImageCoords(e);
        if (!isWithinImageBounds(coords.x, coords.y)) {
            showMessage('Click within image bounds', 'warning');
            return;
        }
        
        if (STATE.currentTool === 'landmark') {
            annotateLandmark(coords);
        } else if (STATE.currentTool === 'polygon') {
            handlePolygonClick(coords);
        } else if (STATE.currentTool === 'figure') {
            // Don't start drawing if clicking on existing line elements
            if (clickedOnLine && STATE.figureShape === 'line') {
                return; // Let the line's own event handlers deal with it
            }
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
    
    // Throttle mouse position display updates for better performance
    const now = performance.now();
    const coords = eventToImageCoords(e);
    if (now - lastMouseUpdateTime >= MOUSE_UPDATE_INTERVAL) {
        lastMouseUpdateTime = now;
        const inBounds = isWithinImageBounds(coords.x, coords.y);
        DOM.mousePosition.textContent = `X: ${Math.round(coords.x)}, Y: ${Math.round(coords.y)}`;
        DOM.mousePosition.style.color = inBounds ? 'white' : '#ff6b6b';
    }
    
    // Handle dragging
    if (STATE.isDragging && !STATE.isAnnotationMode) {
        const deltaX = mouseX - STATE.startDragX;
        const deltaY = mouseY - STATE.startDragY;
        STATE.translateX += deltaX;
        STATE.translateY += deltaY;
        applyZoom();
        STATE.startDragX = mouseX;
        STATE.startDragY = mouseY;
    }
    
    // Handle polygon dragging
    if (STATE.polygonDragging && STATE.currentTool === 'polygon') {
        handlePolygonDrag(coords);
    }
    
    // Handle figure drawing
    if (STATE.figureDrawing && STATE.currentTool === 'figure') {
        updateFigurePreview(coords);
    }
    
    // Handle line drawing preview
    if (STATE.currentTool === 'figure' && STATE.figureShape === 'line' && STATE.linePoints.length === 1) {
        updateFigurePreview(coords);
    }
    
    // Handle figure dragging
    if (STATE.figureDragging && STATE.selectedFigure) {
        // Calculate the new position based on mouse position and offset
        const newDisplayX = mouseX + STATE.figureDragOffsetX;
        const newDisplayY = mouseY + STATE.figureDragOffsetY;
        
        // Convert display coordinates to image coordinates
        const newImageCoords = displayToImageCoords(newDisplayX, newDisplayY);
        
        const figureData = STATE.annotations[STATE.selectedFigure];
        
        if (figureData.shape === 'line') {
            // For lines, move both start and end points together
            const deltaX = newImageCoords.x - STATE.figureOriginalX;
            const deltaY = newImageCoords.y - STATE.figureOriginalY;
            
            figureData.startX = STATE.figureOriginalStartX + deltaX;
            figureData.startY = STATE.figureOriginalStartY + deltaY;
            figureData.endX = STATE.figureOriginalEndX + deltaX;
            figureData.endY = STATE.figureOriginalEndY + deltaY;
            figureData.x = newImageCoords.x;
            figureData.y = newImageCoords.y;
            
            // Update the line element directly
            updateLineElement(STATE.selectedFigure, figureData);
        } else {
            // For circles and rectangles, use normal position update
            updateFigurePosition(STATE.selectedFigure, newImageCoords.x, newImageCoords.y);
        }
    }
    
    // Handle figure resizing
    if (STATE.figureResizing && STATE.selectedFigure && STATE.resizeHandle) {
        const deltaX = mouseX - STATE.figureDragStartX;
        const deltaY = mouseY - STATE.figureDragStartY;
        
        // Calculate size change based on handle direction
        let sizeChange = 0;
        const handle = STATE.resizeHandle;
        
        if (handle.includes('e')) sizeChange += deltaX / STATE.currentZoom;
        if (handle.includes('w')) sizeChange -= deltaX / STATE.currentZoom;
        if (handle.includes('s')) sizeChange += deltaY / STATE.currentZoom;
        if (handle.includes('n')) sizeChange -= deltaY / STATE.currentZoom;
        
        const newSize = STATE.figureOriginalSize + sizeChange;
        updateFigureSize(STATE.selectedFigure, newSize);
    }
    
    // Handle line point dragging
    if (STATE.linePointDragging && STATE.linePointDraggedFigure) {
        const figureData = STATE.annotations[STATE.linePointDraggedFigure];
        
        // Use the same coordinate conversion as polygon dragging
        if (STATE.linePointDraggedType === 'start') {
            // Update start point directly to mouse position
            figureData.startX = coords.x;
            figureData.startY = coords.y;
        } else if (STATE.linePointDraggedType === 'end') {
            // Update end point directly to mouse position
            figureData.endX = coords.x;
            figureData.endY = coords.y;
        }
        
        // Update center point and size
        figureData.x = (figureData.startX + figureData.endX) / 2;
        figureData.y = (figureData.startY + figureData.endY) / 2;
        
        const dx = figureData.endX - figureData.startX;
        const dy = figureData.endY - figureData.startY;
        figureData.size = Math.sqrt(dx * dx + dy * dy);
        
        // Update the line element directly
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
    
    // Complete figure drawing
    if (STATE.figureDrawing && STATE.currentTool === 'figure') {
        const coords = eventToImageCoords(e);
        completeFigureDrawing(coords);
    }
    
    // Complete figure dragging/resizing
    if (STATE.figureDragging || STATE.figureResizing) {
        completeFigureInteraction();
    }
    
    // Complete line point dragging
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
    
    // Delete selected figure with Delete or Backspace key
    if ((e.key === 'Delete' || e.key === 'Backspace') && STATE.selectedFigure) {
        e.preventDefault();
        deleteSelectedFigure();
    }
    
    // Escape key to deselect
    if (e.key === 'Escape') {
        if (STATE.currentTool === 'polygon') {
            cancelPolygon();
        } else {
            deselectAllFigures();
            STATE.selectedLabel = null;
            renderLabelList();
        }
    }
    
    // Arrow keys for figure positioning
    if (STATE.selectedFigure && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        moveFigureWithArrow(e.key);
    }
    
    // Toggle center indicators with 'C' key
    if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleCenterIndicators();
    }
    
    // Space bar to toggle mode
    if (e.key === ' ') {
        e.preventDefault();
        toggleMode();
    }
    
    // Keyboard shortcuts for view
    if (e.key === 'r') {
        resetView();
    } else if (e.key === '+' || e.key === '=') {
        zoomIn();
    } else if (e.key === '-') {
        zoomOut();
    } else if (e.key === 'Enter' && STATE.currentTool === 'polygon') {
        completePolygon();
    }
}
