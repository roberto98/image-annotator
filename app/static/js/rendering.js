// Rendering functions for annotations and UI elements
// Reactive rendering: canvas auto-updates when Store state changes (US-003)

const RENDER_STATE = {
    annotationsHash: '',
    labelListHash: ''
};

let _renderPending = false;
let _forceNextRender = false;

/**
 * Schedule a batched render via microtask.
 * Multiple state changes within the same synchronous block produce a single render.
 * Microtasks fire before the browser repaints, so there is no visual lag.
 * @param {boolean} force - Force full re-render (bypass dirty checking)
 */
function scheduleRender(force = false) {
    if (force) _forceNextRender = true;
    if (_renderPending) return;
    _renderPending = true;
    queueMicrotask(() => {
        _renderPending = false;
        const shouldForce = _forceNextRender;
        _forceNextRender = false;
        renderLabelList();
        renderAnnotations(shouldForce);
    });
}

/**
 * Force a full re-render on the next microtask (bypasses dirty checking).
 * Used by undo/redo to ensure canvas reflects the restored state.
 */
function forceRender() {
    scheduleRender(true);
}

/**
 * Set up reactive rendering by subscribing to Store state changes.
 * Once active, the canvas and label list update automatically — no manual
 * renderAnnotations() or renderLabelList() calls are needed.
 */
function setupReactiveRendering() {
    window.AppStore.subscribe(() => {
        scheduleRender();
    });
}

/** Generate a hash of current render-relevant state for dirty tracking */
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

    if (!force && currentHash === RENDER_STATE.annotationsHash) return;
    RENDER_STATE.annotationsHash = currentHash;

    document.querySelectorAll('.annotation-point, .annotation-label, .polygon-shape, .figure-shape').forEach(el => el.remove());

    Object.entries(STATE.annotations).forEach(([name, data], index) => {
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

    if (STATE.currentTool === 'polygon' && STATE.activePolygonPoints.length > 0) {
        renderActivePolygon();
    }

    if (STATE.figurePreview) {
        DOM.imageContainer.appendChild(STATE.figurePreview);
    }
}

function renderLandmarkPoint(name, coords, color) {
    if (!viewport.isWithinBounds(coords.x, coords.y)) return;

    const { x, y } = viewport.imageToDisplay(coords.x, coords.y);

    const point = document.createElement('div');
    point.className = 'annotation-point';
    point.style.left = `${x}px`;
    point.style.top = `${y}px`;
    point.style.backgroundColor = color;

    const label = document.createElement('div');
    label.className = 'annotation-label';
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
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
        const display = viewport.imageToDisplay(p.x, p.y);
        return `${display.x},${display.y}`;
    }).join(' ');
    
    polygon.setAttribute('points', pointsStr);
    polygon.setAttribute('fill', `${color}33`);
    polygon.setAttribute('stroke', color);
    polygon.setAttribute('stroke-width', '2');
    
    svg.appendChild(polygon);

    const firstPoint = viewport.imageToDisplay(points[0].x, points[0].y);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', firstPoint.x + 10);
    text.setAttribute('y', firstPoint.y - 10);
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.textContent = name;
    svg.appendChild(text);
    
    DOM.imageContainer.appendChild(svg);
}

function renderFigure(data, color, name) {
    const displayCoords = viewport.imageToDisplay(data.x, data.y);
    const displaySize = data.size * STATE.currentZoom;

    const figure = document.createElement('div');
    figure.className = `figure-shape figure-${data.shape}`;
    figure.dataset.figureName = name;

    const isFigureTool = STATE.currentTool === 'figure';
    const isLabelSelected = STATE.selectedLabel === name;
    const isInteractive = isFigureTool && isLabelSelected;

    if (data.shape === 'line') {
        renderLineShape(figure, data, name, isInteractive);
    } else {
        figure.style.left = `${displayCoords.x - displaySize / 2}px`;
        figure.style.top = `${displayCoords.y - displaySize / 2}px`;
        figure.style.width = `${displaySize}px`;
        figure.style.height = `${displaySize}px`;
        figure.style.borderColor = color;
        figure.style.background = `${color}33`;

        addResizeHandles(figure, isInteractive);
    }

    figure.classList.add(isInteractive ? 'interactive' : 'non-interactive');
    addCenterIndicator(figure);

    figure.addEventListener('mousedown', handleFigureMouseDown);
    figure.addEventListener('click', handleFigureClick);
    if (data.shape === 'line') {
        figure.addEventListener('mousedown', handleLineMouseDown);
    }

    DOM.imageContainer.appendChild(figure);

    const label = document.createElement('div');
    label.className = 'annotation-label';
    label.style.left = `${displayCoords.x + displaySize / 2}px`;
    label.style.top = `${displayCoords.y}px`;
    label.style.borderLeft = `3px solid ${color}`;
    label.textContent = name;
    DOM.imageContainer.appendChild(label);
}

function renderLineShape(figure, data, name, isInteractive) {
    const displayStart = viewport.imageToDisplay(data.startX, data.startY);
    const displayEnd = viewport.imageToDisplay(data.endX, data.endY);

    const dx = displayEnd.x - displayStart.x;
    const dy = displayEnd.y - displayStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const centerX = (displayStart.x + displayEnd.x) / 2;
    const centerY = (displayStart.y + displayEnd.y) / 2;

    figure.style.left = `${centerX - length / 2}px`;
    figure.style.top = `${centerY - 1.5}px`;
    figure.style.width = `${length}px`;
    figure.style.height = '3px';
    figure.style.transform = `rotate(${angle}deg)`;
    figure.style.transformOrigin = '50% 50%';

    if (isInteractive) {
        ['start', 'end'].forEach(pointType => {
            const point = document.createElement('div');
            point.className = `line-point line-${pointType}`;
            point.dataset.pointType = pointType;
            point.dataset.figureName = name;
            point.addEventListener('mousedown', handleLinePointMouseDown);
            point.style.left = pointType === 'start' ? '0px' : '100%';
            point.style.top = '50%';
            figure.appendChild(point);
        });
    }
}

function addResizeHandles(figure, isInteractive) {
    ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(handle => {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = `resize-handle ${handle}`;
        resizeHandle.dataset.handle = handle;
        if (!isInteractive) resizeHandle.style.display = 'none';
        figure.appendChild(resizeHandle);
    });
}

function addCenterIndicator(figure) {
    const centerIndicator = document.createElement('div');
    centerIndicator.className = 'center-indicator';
    centerIndicator.style.cssText = 'left: 50%; top: 50%; transform: translate(-50%, -50%)';
    if (STATE.showCenterIndicators) {
        centerIndicator.classList.add('always-visible');
    }
    figure.appendChild(centerIndicator);
}

/** Generate a hash of label-list-relevant state for dirty tracking */
function getLabelListHash() {
    return JSON.stringify({
        labels: STATE.allLabels.map(l => l.name),
        selected: STATE.selectedLabel,
        visibility: STATE.visibilityToggles,
        annotationKeys: Object.keys(STATE.annotations),
        annotationMeta: Object.fromEntries(
            Object.entries(STATE.annotations).map(([k, v]) => [k, { s: v.status, t: v.type }])
        )
    });
}

function renderLabelList() {
    const currentHash = getLabelListHash();
    if (currentHash === RENDER_STATE.labelListHash) return;
    RENDER_STATE.labelListHash = currentHash;

    const fragment = document.createDocumentFragment();

    STATE.allLabels.forEach((label) => {
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
            const typeMap = {
                polygon: '<span class="type-badge badge-polygon">Polygon</span>',
                figure: '<span class="type-badge badge-figure">Figure</span>'
            };
            typeBadge = typeMap[annotation.type] || '<span class="type-badge badge-landmark">Point</span>';

            if (annotation.status === 'ok') {
                statusBadge = '<span class="status-badge status-ok">Marked</span>';

                if (annotation.coordinates) {
                    infoText = `x: ${Math.round(annotation.coordinates.x)}, y: ${Math.round(annotation.coordinates.y)}`;
                } else if (annotation.points) {
                    infoText = `${annotation.points.length} points`;
                } else if (annotation.shape) {
                    infoText = `${annotation.shape} (${annotation.size}px)`;
                }
            } else if (annotation.status === 'occluded/missing') {
                statusBadge = '<span class="status-badge status-occluded">Occluded</span>';
            }
        }

        const visibilityIcon = isVisible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

        const showOccludedBtn = !annotation || !annotation.type || (annotation.type !== 'polygon' && annotation.type !== 'figure');

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
                        ${visibilityIcon}
                    </button>
                    ${statusBadge}
                </div>
            </div>
            ${infoText ? `<div class="label-info">${infoText}</div>` : ''}
            <div class="label-actions">
                <button class="action-btn btn-annotate" onclick="selectLabel('${label.name}')">Select</button>
                ${showOccludedBtn ? '<button class="action-btn btn-occluded" onclick="markOccluded(\'' + label.name + '\')">Occluded</button>' : ''}
                <button class="action-btn btn-delete" onclick="deleteAnnotation('${label.name}')">Delete</button>
            </div>
        `;

        fragment.appendChild(labelDiv);
    });

    DOM.labelList.innerHTML = '';
    DOM.labelList.appendChild(fragment);
}

function renderActivePolygon() {
    clearPolygonElements();

    if (STATE.activePolygonPoints.length === 0) return;

    STATE.activePolygonPoints.forEach((point, index) => {
        const { x, y } = viewport.imageToDisplay(point.x, point.y);

        const pointEl = document.createElement('div');
        pointEl.className = 'polygon-point';
        if (index === 0) pointEl.classList.add('start-point');
        pointEl.style.left = `${x}px`;
        pointEl.style.top = `${y}px`;

        DOM.imageContainer.appendChild(pointEl);
        STATE.activePolygonElements.points.push(pointEl);
    });

    for (let i = 0; i < STATE.activePolygonPoints.length; i++) {
        const p1 = STATE.activePolygonPoints[i];
        const p2 = STATE.activePolygonPoints[(i + 1) % STATE.activePolygonPoints.length];
        
        if (i < STATE.activePolygonPoints.length - 1 || STATE.activePolygonPoints.length >= 3) {
            drawPolygonLine(p1, p2);
        }
    }
}

function drawPolygonLine(p1, p2) {
    const display1 = viewport.imageToDisplay(p1.x, p1.y);
    const display2 = viewport.imageToDisplay(p2.x, p2.y);
    
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
