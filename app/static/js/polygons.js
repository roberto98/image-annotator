// Polygon drawing and manipulation operations

/**
 * Handle click events during polygon drawing/editing
 * @param {{x: number, y: number}} coords - Click coordinates in image space
 */
function handlePolygonClick(coords) {
    if (STATE.polygonTool === 'draw') {
        STATE.activePolygonPoints.push({ x: coords.x, y: coords.y });
        renderActivePolygon();
        DOM.completePolyBtn.disabled = STATE.activePolygonPoints.length < 3;
    } else if (STATE.polygonTool === 'edit') {
        STATE.selectedPointIndex = findNearestPointIndex(coords);
        if (STATE.selectedPointIndex !== -1) {
            STATE.polygonDragging = true;
        }
    } else if (STATE.polygonTool === 'move') {
        STATE.polygonDragging = true;
        STATE.polygonMoveStart = { x: coords.x, y: coords.y };
    }
}

/**
 * Handle drag events during polygon editing/moving
 * @param {{x: number, y: number}} coords - Current mouse coordinates in image space
 */
function handlePolygonDrag(coords) {
    if (STATE.polygonTool === 'edit' && STATE.selectedPointIndex !== -1) {
        STATE.activePolygonPoints[STATE.selectedPointIndex] = { x: coords.x, y: coords.y };
        renderActivePolygon();
    } else if (STATE.polygonTool === 'move' && STATE.polygonDragging && STATE.polygonMoveStart) {
        // Calculate delta from last position
        const deltaX = coords.x - STATE.polygonMoveStart.x;
        const deltaY = coords.y - STATE.polygonMoveStart.y;
        
        // Move all points by delta
        STATE.activePolygonPoints = STATE.activePolygonPoints.map(point => ({
            x: point.x + deltaX,
            y: point.y + deltaY
        }));
        
        // Update start position for next drag event
        STATE.polygonMoveStart = { x: coords.x, y: coords.y };
        
        renderActivePolygon();
    }
}

function clearPolygonElements() {
    STATE.activePolygonElements.points.forEach(el => el.remove());
    STATE.activePolygonElements.lines.forEach(el => el.remove());
    STATE.activePolygonElements = { points: [], lines: [] };
}

/**
 * Complete polygon drawing and save to server
 * Requires at least 3 points
 */
async function completePolygon() {
    if (STATE.activePolygonPoints.length < 3) {
        showMessage('Need at least 3 points', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`/api/segments/${window.patientId}/${window.imageName}/${STATE.selectedLabel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'polygon',
                points: STATE.activePolygonPoints
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            STATE.annotations[STATE.selectedLabel] = {
                type: 'polygon',
                status: 'ok',
                points: STATE.activePolygonPoints,
                timestamp: new Date().toISOString()
            };
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage('Polygon saved', 'success');
            setPolygonTool('edit');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to save polygon', 'error');
    }
}

function cancelPolygon() {
    clearPolygonElements();
    STATE.activePolygonPoints = [];
    DOM.completePolyBtn.disabled = true;
    setPolygonTool('draw');
}

function setPolygonTool(tool) {
    STATE.polygonTool = tool;
    DOM.drawPolyBtn.classList.toggle('active', tool === 'draw');
    DOM.editPolyBtn.classList.toggle('active', tool === 'edit');
    DOM.movePolyBtn.classList.toggle('active', tool === 'move');
}

/**
 * Find the index of the polygon point nearest to the given coordinates
 * @param {{x: number, y: number}} coords - Coordinates to search near
 * @returns {number} Index of nearest point, or -1 if none within threshold
 */
function findNearestPointIndex(coords) {
    const threshold = 10 / STATE.currentZoom;
    let closestIndex = -1;
    let closestDistance = Infinity;
    
    STATE.activePolygonPoints.forEach((point, index) => {
        const distance = Math.sqrt(
            Math.pow(point.x - coords.x, 2) + Math.pow(point.y - coords.y, 2)
        );
        if (distance < threshold && distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });
    
    return closestIndex;
}
