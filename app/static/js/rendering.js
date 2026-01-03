// Rendering functions for annotations and UI elements

// Render state cache for dirty tracking
const RENDER_STATE = {
    annotationsHash: '',
    zoomLevel: 1,
    visibilityHash: ''
};

/**
 * Generate a hash of current annotation state to detect changes
 * Includes zoom, translation, and full annotation data so updates are detected
 */
function getAnnotationsHash() {
    return JSON.stringify({
        annotations: STATE.annotations, // Include full annotation data, not just keys
        visibility: STATE.visibilityToggles,
        zoom: STATE.currentZoom,
        translateX: STATE.translateX,
        translateY: STATE.translateY,
        selectedLabel: STATE.selectedLabel
    });
}

/**
 * Render all annotations on the image canvas
 * Uses dirty checking to avoid unnecessary re-renders
 * @param {boolean} force - Force full re-render even if state unchanged
 */
function renderAnnotations(force = false) {
    const currentHash = getAnnotationsHash();
    
    // Skip re-render if nothing changed (unless forced)
    if (!force && currentHash === RENDER_STATE.annotationsHash) {
        return;
    }
    RENDER_STATE.annotationsHash = currentHash;
    
    // Use DocumentFragment for batched DOM operations
    const fragment = document.createDocumentFragment();
    
    // Clear existing annotations
    document.querySelectorAll('.annotation-point, .annotation-label, .polygon-shape, .figure-shape').forEach(el => el.remove());
    
    // Render all annotations simultaneously
    Object.entries(STATE.annotations).forEach(([name, data], index) => {
        // Check visibility
        if (STATE.visibilityToggles[name] === false) return;
        
        const color = COLORS[index % COLORS.length];
        
        if (data.type === 'polygon' && data.points) {
            renderPolygonShape(data.points, color, name);
        } else if (data.type === 'figure') {
            renderFigure(data, color, name);
        } else if (data.status === 'ok' && data.coordinates) {
            renderLandmarkPoint(name, data.coordinates, color);
        }
    });
    
    // Render active polygon if in polygon mode
    if (STATE.currentTool === 'polygon' && STATE.activePolygonPoints.length > 0) {
        renderActivePolygon();
    }
    
    // Render figure preview if drawing
    if (STATE.figurePreview) {
        DOM.imageContainer.appendChild(STATE.figurePreview);
    }
}

function renderLandmarkPoint(name, coords, color) {
    if (!isWithinImageBounds(coords.x, coords.y)) return;
    
    const displayCoords = imageToDisplayCoords(coords.x, coords.y);
    
    // Create point
    const point = document.createElement('div');
    point.className = 'annotation-point';
    point.style.left = `${displayCoords.x}px`;
    point.style.top = `${displayCoords.y}px`;
    point.style.backgroundColor = color;
    
    // Create label
    const label = document.createElement('div');
    label.className = 'annotation-label';
    label.style.left = `${displayCoords.x}px`;
    label.style.top = `${displayCoords.y}px`;
    label.style.borderLeft = `3px solid ${color}`;
    label.textContent = name;
    
    DOM.imageContainer.appendChild(point);
    DOM.imageContainer.appendChild(label);
}

/**
 * Render a polygon shape annotation
 * @param {Array} points - Array of {x, y} point objects
 * @param {string} color - CSS color for the polygon
 * @param {string} name - Label name for the polygon
 */
function renderPolygonShape(points, color, name) {
    if (!points || points.length < 3) return;
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'polygon-shape');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    
    const pointsStr = points.map(p => {
        const display = imageToDisplayCoords(p.x, p.y);
        return `${display.x},${display.y}`;
    }).join(' ');
    
    polygon.setAttribute('points', pointsStr);
    polygon.setAttribute('fill', `${color}33`);
    polygon.setAttribute('stroke', color);
    polygon.setAttribute('stroke-width', '2');
    
    svg.appendChild(polygon);
    
    // Add label
    if (points.length > 0) {
        const firstPoint = imageToDisplayCoords(points[0].x, points[0].y);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', firstPoint.x + 10);
        text.setAttribute('y', firstPoint.y - 10);
        text.setAttribute('fill', color);
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', 'bold');
        text.textContent = name;
        svg.appendChild(text);
    }
    
    DOM.imageContainer.appendChild(svg);
}

function renderFigure(data, color, name) {
    const displayCoords = imageToDisplayCoords(data.x, data.y);
    const displaySize = data.size * STATE.currentZoom;
    
    const figure = document.createElement('div');
    figure.className = `figure-shape figure-${data.shape}`;
    figure.dataset.figureName = name;
    
    if (data.shape === 'line') {
        // For lines, render with start and end points
        const startX = data.startX;
        const startY = data.startY;
        const endX = data.endX;
        const endY = data.endY;
        
        // Convert to display coordinates
        const displayStart = imageToDisplayCoords(startX, startY);
        const displayEnd = imageToDisplayCoords(endX, endY);
        
        // Calculate line properties
        const dx = displayEnd.x - displayStart.x;
        const dy = displayEnd.y - displayStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Calculate center point
        const centerX = (displayStart.x + displayEnd.x) / 2;
        const centerY = (displayStart.y + displayEnd.y) / 2;
        
        // Create line element
        figure.style.left = `${centerX - length / 2}px`;
        figure.style.top = `${centerY - 1.5}px`;
        figure.style.width = `${length}px`;
        figure.style.height = '3px';
        figure.style.transform = `rotate(${angle}deg)`;
        figure.style.transformOrigin = '50% 50%';
        
        // Add start and end point markers when interactive
        const isPanningMode = !STATE.isAnnotationMode;
        const isLabelSelected = STATE.selectedLabel === name;
        const isInteractive = isPanningMode && isLabelSelected;
        
        if (isInteractive) {
            // Add start point
            const startPoint = document.createElement('div');
            startPoint.className = 'line-point line-start';
            startPoint.dataset.pointType = 'start';
            startPoint.dataset.figureName = name;
            startPoint.addEventListener('mousedown', handleLinePointMouseDown);
            
            // Position at start of line
            startPoint.style.left = '0px';
            startPoint.style.top = '50%';
            figure.appendChild(startPoint);
            
            // Add end point
            const endPoint = document.createElement('div');
            endPoint.className = 'line-point line-end';
            endPoint.dataset.pointType = 'end';
            endPoint.dataset.figureName = name;
            endPoint.addEventListener('mousedown', handleLinePointMouseDown);
            
            // Position at end of line
            endPoint.style.left = '100%';
            endPoint.style.top = '50%';
            figure.appendChild(endPoint);
        }
    } else {
        // For circles and rectangles
        figure.style.left = `${displayCoords.x - displaySize / 2}px`;
        figure.style.top = `${displayCoords.y - displaySize / 2}px`;
        figure.style.width = `${displaySize}px`;
        figure.style.height = `${displaySize}px`;
        figure.style.borderColor = color;
        figure.style.background = `${color}33`;
    }
    
    // Determine if this figure is interactive based on tool and label selection
    const isFigureTool = STATE.currentTool === 'figure';
    const isLabelSelected = STATE.selectedLabel === name;
    const isInteractive = isFigureTool && isLabelSelected;
    figure.classList.add(isInteractive ? 'interactive' : 'non-interactive');
    
    // Add resize handles (only for circles and rectangles)
    if (data.shape !== 'line') {
        const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
        handles.forEach(handle => {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = `resize-handle ${handle}`;
            resizeHandle.dataset.handle = handle;
            
            // Only show resize handles for interactive figures
            if (!isInteractive) {
                resizeHandle.style.display = 'none';
            }
            
            figure.appendChild(resizeHandle);
        });
    }
    
    // Add center indicator
    const centerIndicator = document.createElement('div');
    centerIndicator.className = 'center-indicator';
    centerIndicator.style.left = '50%';
    centerIndicator.style.top = '50%';
    centerIndicator.style.transform = 'translate(-50%, -50%)';
    
    // Show center indicator based on toggle state
    if (STATE.showCenterIndicators) {
        centerIndicator.classList.add('always-visible');
    }
    
    figure.appendChild(centerIndicator);
    
    // Add event listeners for figure interaction
    figure.addEventListener('mousedown', handleFigureMouseDown);
    figure.addEventListener('click', handleFigureClick);
    
    // Add specific handler for line elements
    if (data.shape === 'line') {
        figure.addEventListener('mousedown', handleLineMouseDown);
    }
    
    DOM.imageContainer.appendChild(figure);
    
    // Add label
    const label = document.createElement('div');
    label.className = 'annotation-label';
    label.style.left = `${displayCoords.x + displaySize / 2}px`;
    label.style.top = `${displayCoords.y}px`;
    label.style.borderLeft = `3px solid ${color}`;
    label.textContent = name;
    DOM.imageContainer.appendChild(label);
}

function renderLabelList() {
    // Use DocumentFragment for better performance (batch DOM updates)
    const fragment = document.createDocumentFragment();
    
    STATE.allLabels.forEach((label, index) => {
        const annotation = STATE.annotations[label.name];
        const isAnnotated = !!annotation;
        const isVisible = STATE.visibilityToggles[label.name] !== false;
        const isSelected = STATE.selectedLabel === label.name;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label-item';
        if (isSelected) labelDiv.classList.add('selected');
        if (isAnnotated) labelDiv.classList.add('annotated');
        
        let statusBadge = '';
        let infoText = '';
        let typeBadge = '';
        
        if (isAnnotated) {
            const data = annotation;
            
            // Show type badge
            if (data.type === 'polygon') {
                typeBadge = '<span class="type-badge badge-polygon">Polygon</span>';
            } else if (data.type === 'figure') {
                typeBadge = '<span class="type-badge badge-figure">Figure</span>';
            } else {
                typeBadge = '<span class="type-badge badge-landmark">Point</span>';
            }
            
            if (data.status === 'ok') {
                statusBadge = '<span class="status-badge status-ok">Marked</span>';
                
                if (data.coordinates) {
                    infoText = `x: ${Math.round(data.coordinates.x)}, y: ${Math.round(data.coordinates.y)}`;
                } else if (data.points) {
                    infoText = `${data.points.length} points`;
                } else if (data.shape) {
                    infoText = `${data.shape} (${data.size}px)`;
                }
            } else if (data.status === 'occluded/missing') {
                statusBadge = '<span class="status-badge status-occluded">Occluded</span>';
            }
        }
        
        labelDiv.innerHTML = `
            <div class="label-header">
                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                    <span class="label-name">${label.name}</span>
                    ${typeBadge}
                </div>
                <div class="label-controls">
                    <button class="toggle-btn ${isVisible ? 'active' : ''}" 
                            onclick="toggleVisibility('${label.name}')" 
                            title="${isVisible ? 'Hide annotation' : 'Show annotation'}">
                        ${isVisible ? 
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' : 
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                        }
                    </button>
                    ${statusBadge}
                </div>
            </div>
            ${infoText ? `<div class="label-info">${infoText}</div>` : ''}
            <div class="label-actions">
                <button class="action-btn btn-annotate" onclick="selectLabel('${label.name}')">
                    Select
                </button>
                ${(!annotation || !annotation.type || annotation.type !== 'polygon' && annotation.type !== 'figure') ? `
                <button class="action-btn btn-occluded" onclick="markOccluded('${label.name}')">
                    Occluded
                </button>
                ` : ''}
                <button class="action-btn btn-delete" onclick="deleteAnnotation('${label.name}')">
                    Delete
                </button>
            </div>
        `;
        
        fragment.appendChild(labelDiv);
    });
    
    // Clear and append all at once (single reflow)
    DOM.labelList.innerHTML = '';
    DOM.labelList.appendChild(fragment);
}

function renderActivePolygon() {
    clearPolygonElements();
    
    if (STATE.activePolygonPoints.length === 0) return;
    
    // Draw points and lines
    STATE.activePolygonPoints.forEach((point, index) => {
        const display = imageToDisplayCoords(point.x, point.y);
        
        const pointEl = document.createElement('div');
        pointEl.className = 'polygon-point';
        if (index === 0) pointEl.classList.add('start-point');
        pointEl.style.left = `${display.x}px`;
        pointEl.style.top = `${display.y}px`;
        
        DOM.imageContainer.appendChild(pointEl);
        STATE.activePolygonElements.points.push(pointEl);
    });
    
    // Draw lines
    for (let i = 0; i < STATE.activePolygonPoints.length; i++) {
        const p1 = STATE.activePolygonPoints[i];
        const p2 = STATE.activePolygonPoints[(i + 1) % STATE.activePolygonPoints.length];
        
        if (i < STATE.activePolygonPoints.length - 1 || STATE.activePolygonPoints.length >= 3) {
            drawPolygonLine(p1, p2);
        }
    }
}

function drawPolygonLine(p1, p2) {
    const display1 = imageToDisplayCoords(p1.x, p1.y);
    const display2 = imageToDisplayCoords(p2.x, p2.y);
    
    const dx = display2.x - display1.x;
    const dy = display2.y - display1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    const line = document.createElement('div');
    line.className = 'polygon-line';
    line.style.left = `${display1.x}px`;
    line.style.top = `${display1.y}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${angle}deg)`;
    
    DOM.imageContainer.appendChild(line);
    STATE.activePolygonElements.lines.push(line);
}
