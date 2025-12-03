// Figure drawing and manipulation operations

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
        // For lines, use polygon-like two-point system
        if (!STATE.linePoints) {
            STATE.linePoints = [];
        }
        
        STATE.linePoints.push({ x: coords.x, y: coords.y });
        
        if (STATE.linePoints.length === 1) {
            // First point - create preview
            STATE.figurePreview = document.createElement('div');
            STATE.figurePreview.className = 'line-preview';
            STATE.figurePreview.style.position = 'absolute';
            STATE.figurePreview.style.pointerEvents = 'none';
            STATE.figurePreview.style.zIndex = '15';
            DOM.imageContainer.appendChild(STATE.figurePreview);
        } else if (STATE.linePoints.length === 2) {
            // Second point - complete the line
            completeLineDrawing();
            return;
        }
    } else {
        // For circles and rectangles, use center-based drawing
        STATE.figureDrawing = true;
        STATE.figureStartX = coords.x;
        STATE.figureStartY = coords.y;
        
        // Create preview element
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

    if (STATE.figureShape === 'line') {
        // For lines, show preview from first point to current mouse position
        if (STATE.linePoints.length === 1) {
            const startPoint = STATE.linePoints[0];
            const endPoint = coords;
            
            // Calculate line properties
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            // Calculate center point
            const centerX = (startPoint.x + endPoint.x) / 2;
            const centerY = (startPoint.y + endPoint.y) / 2;
            
            // Convert to display coordinates
            const displayCenter = imageToDisplayCoords(centerX, centerY);
            const displayLength = length * STATE.currentZoom;
            
            // Position and style the line preview
            STATE.figurePreview.style.left = `${displayCenter.x - displayLength / 2}px`;
            STATE.figurePreview.style.top = `${displayCenter.y - 1.5}px`;
            STATE.figurePreview.style.width = `${displayLength}px`;
            STATE.figurePreview.style.height = '3px';
            STATE.figurePreview.style.background = '#7950f2';
            STATE.figurePreview.style.border = 'none';
            STATE.figurePreview.style.transform = `rotate(${angle}deg)`;
            STATE.figurePreview.style.transformOrigin = '50% 50%';
        }
    } else {
        // For circles and rectangles, use center-based sizing
        const centerX = STATE.figureStartX;
        const centerY = STATE.figureStartY;
        
        // Calculate size based on distance from center
        const dx = coords.x - centerX;
        const dy = coords.y - centerY;
        const size = Math.sqrt(dx * dx + dy * dy) * 2;
        
        const displayCenter = imageToDisplayCoords(centerX, centerY);
        const displaySize = size * STATE.currentZoom;
        
        STATE.figurePreview.style.left = `${displayCenter.x - displaySize / 2}px`;
        STATE.figurePreview.style.top = `${displayCenter.y - displaySize / 2}px`;
        STATE.figurePreview.style.width = `${displaySize}px`;
        STATE.figurePreview.style.height = `${displaySize}px`;
        STATE.figurePreview.style.transform = 'none';
    }
}

async function completeLineDrawing() {
    if (STATE.linePoints.length !== 2) return;
    
    const startPoint = STATE.linePoints[0];
    const endPoint = STATE.linePoints[1];
    
    // Calculate line properties
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Minimum length check
    if (length < 10) {
        showMessage('Line too short, draw longer', 'warning');
        STATE.linePoints = [];
        if (STATE.figurePreview) {
            STATE.figurePreview.remove();
            STATE.figurePreview = null;
        }
        return;
    }
    
    // Calculate center point
    const centerX = (startPoint.x + endPoint.x) / 2;
    const centerY = (startPoint.y + endPoint.y) / 2;
    
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${STATE.selectedLabel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'figure',
                x: centerX,
                y: centerY,
                shape: 'line',
                size: Math.round(length),
                startX: startPoint.x,
                startY: startPoint.y,
                endX: endPoint.x,
                endY: endPoint.y
            })
        });
        
        const data = await response.json();
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
                timestamp: new Date().toISOString()
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
        // Clean up
        STATE.linePoints = [];
        if (STATE.figurePreview) {
            STATE.figurePreview.remove();
            STATE.figurePreview = null;
        }
    }
}

async function completeFigureDrawing(coords) {
    if (!STATE.figureDrawing) return;
    
    const centerX = STATE.figureStartX;
    const centerY = STATE.figureStartY;
    
    // Calculate final size
    const dx = coords.x - centerX;
    const dy = coords.y - centerY;
    const size = Math.round(Math.sqrt(dx * dx + dy * dy) * 2);
    
    // Minimum size check
    if (size < 10) {
        showMessage('Figure too small, draw larger', 'warning');
        if (STATE.figurePreview) {
            STATE.figurePreview.remove();
            STATE.figurePreview = null;
        }
        STATE.figureDrawing = false;
        return;
    }
    
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${STATE.selectedLabel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'figure',
                x: centerX,
                y: centerY,
                shape: STATE.figureShape,
                size: size
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            STATE.annotations[STATE.selectedLabel] = {
                type: 'figure',
                status: 'ok',
                x: centerX,
                y: centerY,
                shape: STATE.figureShape,
                size: size,
                timestamp: new Date().toISOString()
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
        // Clean up
        if (STATE.figurePreview) {
            STATE.figurePreview.remove();
            STATE.figurePreview = null;
        }
        STATE.figureDrawing = false;
    }
}

function updateFigureInteractivity() {
    // Update all figures based on current mode and label selection
    document.querySelectorAll('.figure-shape').forEach(figure => {
        const figureName = figure.dataset.figureName;
        const isPanningMode = !STATE.isAnnotationMode;
        const isLabelSelected = STATE.selectedLabel === figureName;
        const isInteractive = isPanningMode && isLabelSelected;
        
        // Update interaction classes
        figure.classList.remove('interactive', 'non-interactive');
        figure.classList.add(isInteractive ? 'interactive' : 'non-interactive');
        
        // Update resize handles visibility (only for circles and rectangles)
        const resizeHandles = figure.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.style.display = isInteractive ? 'block' : 'none';
        });
        
        // Update line point markers visibility
        const linePoints = figure.querySelectorAll('.line-point');
        linePoints.forEach(point => {
            point.style.display = isInteractive ? 'block' : 'none';
        });
    });
}

function handleFigureClick(e) {
    e.stopPropagation();
    
    // Only allow figure selection in panning mode
    if (STATE.isAnnotationMode) {
        return;
    }
    
    const figureName = e.target.dataset.figureName;
    selectFigure(figureName);
}

function handleFigureMouseDown(e) {
    e.stopPropagation();
    
    // Only allow figure interaction in panning mode
    if (STATE.isAnnotationMode) {
        return;
    }
    
    // Check if clicking on a resize handle
    if (e.target.classList.contains('resize-handle')) {
        STATE.figureResizing = true;
        STATE.resizeHandle = e.target.dataset.handle;
        STATE.figureOriginalSize = STATE.annotations[e.target.closest('.figure-shape').dataset.figureName].size;
        
        // Store initial mouse position for resize
        const rect = DOM.imageContainer.getBoundingClientRect();
        STATE.figureDragStartX = e.clientX - rect.left;
        STATE.figureDragStartY = e.clientY - rect.top;
    } else {
        // Start dragging the figure
        STATE.figureDragging = true;
        STATE.selectedFigure = e.target.dataset.figureName;
        
        // Store initial mouse position relative to image container
        const rect = DOM.imageContainer.getBoundingClientRect();
        STATE.figureDragStartX = e.clientX - rect.left;
        STATE.figureDragStartY = e.clientY - rect.top;
        
        const figureData = STATE.annotations[STATE.selectedFigure];
        STATE.figureOriginalX = figureData.x;
        STATE.figureOriginalY = figureData.y;
        
        // Calculate offset from figure center for smoother dragging
        const figureElement = e.target.closest('.figure-shape');
        const figureRect = figureElement.getBoundingClientRect();
        
        STATE.figureDragOffsetX = (figureRect.left + figureRect.width / 2) - e.clientX;
        STATE.figureDragOffsetY = (figureRect.top + figureRect.height / 2) - e.clientY;
    }
}

function selectFigure(figureName) {
    // Deselect all figures
    document.querySelectorAll('.figure-shape').forEach(fig => {
        fig.classList.remove('selected');
    });
    
    // Select the clicked figure
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

function updateFigurePosition(figureName, newX, newY) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;
    
    figureData.x = newX;
    figureData.y = newY;
    
    // Update the visual representation
    const displayCoords = imageToDisplayCoords(newX, newY);
    const displaySize = figureData.size * STATE.currentZoom;
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);
    
    if (figureElement) {
        figureElement.style.left = `${displayCoords.x - displaySize / 2}px`;
        figureElement.style.top = `${displayCoords.y - displaySize / 2}px`;
        
        // Update label position
        const label = figureElement.nextElementSibling;
        if (label && label.classList.contains('annotation-label')) {
            label.style.left = `${displayCoords.x + displaySize / 2}px`;
            label.style.top = `${displayCoords.y}px`;
        }
    }
}

function updateFigureSize(figureName, newSize) {
    const figureData = STATE.annotations[figureName];
    if (!figureData) return;
    
    figureData.size = Math.max(10, newSize); // Minimum size of 10px
    
    // Update the visual representation
    const displayCoords = imageToDisplayCoords(figureData.x, figureData.y);
    const displaySize = figureData.size * STATE.currentZoom;
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);
    
    if (figureElement) {
        figureElement.style.left = `${displayCoords.x - displaySize / 2}px`;
        figureElement.style.top = `${displayCoords.y - displaySize / 2}px`;
        figureElement.style.width = `${displaySize}px`;
        figureElement.style.height = `${displaySize}px`;
        
        // Update label position
        const label = figureElement.nextElementSibling;
        if (label && label.classList.contains('annotation-label')) {
            label.style.left = `${displayCoords.x + displaySize / 2}px`;
            label.style.top = `${displayCoords.y}px`;
        }
    }
}

async function completeFigureInteraction() {
    if (STATE.figureDragging && STATE.selectedFigure) {
        // Save the new position
        const figureData = STATE.annotations[STATE.selectedFigure];
        await saveFigureUpdate(STATE.selectedFigure, figureData.x, figureData.y, figureData.shape, figureData.size);
    } else if (STATE.figureResizing && STATE.selectedFigure) {
        // Save the new size
        const figureData = STATE.annotations[STATE.selectedFigure];
        await saveFigureUpdate(STATE.selectedFigure, figureData.x, figureData.y, figureData.shape, figureData.size);
    }
    
    // Reset interaction state but keep selection
    STATE.figureDragging = false;
    STATE.figureResizing = false;
    STATE.resizeHandle = null;
}

async function saveFigureUpdate(figureName, x, y, shape, size) {
    try {
        const response = await fetch(`/api/figures/${window.patientId}/${window.imageName}/${figureName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                x: x,
                y: y,
                shape: shape,
                size: size
            })
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
    
    // Only allow line interaction in panning mode
    if (STATE.isAnnotationMode) {
        return;
    }
    
    // Only handle if the line is interactive
    const figureElement = e.target.closest('.figure-shape');
    if (!figureElement.classList.contains('interactive')) {
        return;
    }
    
    const figureName = figureElement.dataset.figureName;
    const figureData = STATE.annotations[figureName];
    
    // Start dragging the entire line
    STATE.figureDragging = true;
    STATE.selectedFigure = figureName;
    
    // Store initial mouse position
    const rect = DOM.imageContainer.getBoundingClientRect();
    STATE.figureDragStartX = e.clientX - rect.left;
    STATE.figureDragStartY = e.clientY - rect.top;
    
    // Store original coordinates
    STATE.figureOriginalX = figureData.x;
    STATE.figureOriginalY = figureData.y;
    STATE.figureOriginalStartX = figureData.startX;
    STATE.figureOriginalStartY = figureData.startY;
    STATE.figureOriginalEndX = figureData.endX;
    STATE.figureOriginalEndY = figureData.endY;
    
    // Calculate offset from line center for smoother dragging
    const figureRect = figureElement.getBoundingClientRect();
    STATE.figureDragOffsetX = (figureRect.left + figureRect.width / 2) - e.clientX;
    STATE.figureDragOffsetY = (figureRect.top + figureRect.height / 2) - e.clientY;
}

function handleLinePointMouseDown(e) {
    e.stopPropagation();
    
    // Only allow line point interaction in panning mode
    if (STATE.isAnnotationMode) {
        return;
    }
    
    const pointElement = e.target;
    const figureName = pointElement.dataset.figureName;
    const pointType = pointElement.dataset.pointType;
    
    STATE.linePointDragging = true;
    STATE.linePointDraggedFigure = figureName;
    STATE.linePointDraggedType = pointType;
}

function updateLineElement(figureName, figureData) {
    const figureElement = document.querySelector(`[data-figure-name="${figureName}"]`);
    if (!figureElement) return;
    
    // Convert to display coordinates
    const displayStart = imageToDisplayCoords(figureData.startX, figureData.startY);
    const displayEnd = imageToDisplayCoords(figureData.endX, figureData.endY);
    
    // Calculate line properties
    const dx = displayEnd.x - displayStart.x;
    const dy = displayEnd.y - displayStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Calculate center point
    const centerX = (displayStart.x + displayEnd.x) / 2;
    const centerY = (displayStart.y + displayEnd.y) / 2;
    
    // Update line element
    figureElement.style.left = `${centerX - length / 2}px`;
    figureElement.style.top = `${centerY - 1.5}px`;
    figureElement.style.width = `${length}px`;
    figureElement.style.height = '3px';
    figureElement.style.transform = `rotate(${angle}deg)`;
    
    // Update label position
    const label = figureElement.nextElementSibling;
    if (label && label.classList.contains('annotation-label')) {
        const displayCoords = imageToDisplayCoords(figureData.x, figureData.y);
        label.style.left = `${displayCoords.x + length / 2}px`;
        label.style.top = `${displayCoords.y}px`;
    }
    
    // Update line point positions
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
        
        // Reset line point dragging state
        STATE.linePointDragging = false;
        STATE.linePointDraggedFigure = null;
        STATE.linePointDraggedType = null;
    }
}

/**
 * Move the selected figure using arrow keys
 * Step size: 1px (normal), 10px (Shift), 0.5px (Ctrl/Cmd)
 * @param {'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight'} direction - Arrow key direction
 */
function moveFigureWithArrow(direction) {
    if (!STATE.selectedFigure) return;
    
    const figureData = STATE.annotations[STATE.selectedFigure];
    let stepSize = 1; // Default: Move 1 pixel at a time
    
    // Adjust step size based on modifier keys
    if (event.shiftKey) {
        stepSize = 10; // Shift: Move 10 pixels at a time
    } else if (event.ctrlKey || event.metaKey) {
        stepSize = 0.5; // Ctrl/Cmd: Move 0.5 pixels at a time for fine adjustment
    }
    
    let newX = figureData.x;
    let newY = figureData.y;
    
    switch (direction) {
        case 'ArrowUp':
            newY -= stepSize;
            break;
        case 'ArrowDown':
            newY += stepSize;
            break;
        case 'ArrowLeft':
            newX -= stepSize;
            break;
        case 'ArrowRight':
            newX += stepSize;
            break;
    }
    
    // Ensure coordinates are within image bounds
    const imageWidth = STATE.naturalWidth;
    const imageHeight = STATE.naturalHeight;
    newX = Math.max(0, Math.min(imageWidth, newX));
    newY = Math.max(0, Math.min(imageHeight, newY));
    
    updateFigurePosition(STATE.selectedFigure, newX, newY);
    
    // Save the change
    saveFigureUpdate(STATE.selectedFigure, newX, newY, figureData.shape, figureData.size);
    
    // Show step size feedback
    let stepText = `${stepSize}px`;
    if (event.shiftKey) {
        stepText = `${stepSize}px (Shift)`;
    } else if (event.ctrlKey || event.metaKey) {
        stepText = `${stepSize}px (Ctrl)`;
    }
    showMessage(`Moved ${stepText}`, 'info', 500);
}
