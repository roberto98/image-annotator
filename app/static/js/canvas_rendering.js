// Rendering functions for annotations and UI elements
// Reactive rendering: canvas auto-updates when Store state changes (US-003)
// Dependencies: utilities.js (calculateLineProperties, escapeHtml)
//
// NOTE: This file now delegates annotation rendering to the new SVG-based
// AnnotationRenderer (core/AnnotationRenderer.js). The old DOM-based
// renderAnnotations() has been replaced with delegation to window.annotationRenderer.
// Legacy preview rendering is retained for DrawingHandler compatibility.

const RENDER_STATE = {
    annotationsHash: '',
    labelListHash: ''
};

let _renderPending = false;
let _forceNextRender = false;
let _renderingUnsubscribe = null;

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
        renderLabelList(shouldForce);
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
 * Once active, the canvas and label list update automatically - no manual
 * renderAnnotations() or renderLabelList() calls are needed.
 */
function setupReactiveRendering() {
    // Clean up existing subscription if present (prevents memory leak on re-init)
    if (_renderingUnsubscribe) {
        _renderingUnsubscribe();
    }

    if (!window.AnnotationState?.subscribe) {
        console.error('[rendering.js] window.AnnotationState.subscribe not available');
        return;
    }

    const RENDER_EVENTS = [
        'annotationSet', 'annotationRemoved', 'annotationsLoaded',
        'visibilityToggled', 'visibilitySet', 'visibilityShowAll', 'visibilityHideAll',
        'undo', 'redo', 'pendingCleared', 'drawingStarted'
    ];

    _renderingUnsubscribe = window.AnnotationState.subscribe((event) => {
        if (RENDER_EVENTS.includes(event)) scheduleRender();
    });
}

/**
 * Clean up reactive rendering subscription (for SPA navigation or component unmount)
 */
function teardownReactiveRendering() {
    if (_renderingUnsubscribe) {
        _renderingUnsubscribe();
        _renderingUnsubscribe = null;
    }
}

/** Generate a hash of current render-relevant state for dirty tracking */
function getAnnotationsHash() {
    const as = window.AnnotationState;
    const vp = window.viewport;
    return JSON.stringify({
        annotations: as?.annotations,
        visibility: as?.visibilityToggles,
        zoom: vp?.scale,
        translateX: vp?.offsetX,
        translateY: vp?.offsetY,
        selectedLabel: as?.selectedAnnotation
    });
}

// ============================================================================
// Annotation Rendering - Delegated to SVG Renderer
// ============================================================================

/**
 * Render all annotations on the image canvas.
 * This function now delegates to the SVG-based AnnotationRenderer for the main
 * rendering work, while still handling legacy drawing previews.
 * 
 * @param {boolean} force - Force full re-render even if state unchanged
 */
function renderAnnotations(force = false) {
    const currentHash = getAnnotationsHash();

    if (!force && currentHash === RENDER_STATE.annotationsHash) return;
    RENDER_STATE.annotationsHash = currentHash;

    const as = window.AnnotationState;

    // Use new SVG-based AnnotationRenderer if available
    if (window.annotationRenderer && window.annotationRenderer._svg) {
        const annotations = as?.annotations || {};
        const visibilityToggles = as?.visibilityToggles || {};

        // Build annotations object with visibility filtering
        const visibleAnnotations = {};
        Object.entries(annotations).forEach(([name, data]) => {
            if (visibilityToggles[name] === false) return;
            const color = window.getColorForLabel?.(name) || '#ff0000';
            visibleAnnotations[name] = { ...data, color };
        });

        // Delegate to new renderer
        window.annotationRenderer.setSelected(as?.selectedAnnotation ?? null);
        window.annotationRenderer.render(visibleAnnotations, as?.calibration?.pixelsPerMm || null);

        // Render DrawingHandler preview if active
        if (window.DrawingHandler?.isActive) {
            renderDrawingPreview();
        }

        return;
    }

}

// ============================================================================
// Label List Rendering (unchanged - not part of SVG layer)
// ============================================================================

/** Generate a hash of label-list-relevant state for dirty tracking */
function getLabelListHash() {
    const as = window.AnnotationState;
    const labels = as?.labels || [];
    const annotations = as?.annotations || {};
    return JSON.stringify({
        labels: labels.map(l => l.name),
        selected: as?.selectedAnnotation,
        visibility: as?.visibilityToggles,
        annotationKeys: Object.keys(annotations),
        annotationMeta: Object.fromEntries(
            Object.entries(annotations).map(([k, v]) => [k, { s: v.status, t: v.type }])
        )
    });
}

/**
 * Generate type badge HTML for an annotation
 * @param {string} type - Annotation type
 * @returns {string} HTML string for type badge
 */
function getTypeBadgeHtml(type) {
    const badges = {
        polygon: '<span class="type-badge badge-polygon">Polygon</span>',
        figure: '<span class="type-badge badge-figure">Figure</span>',
        line: '<span class="type-badge badge-line">Line</span>',
        circle: '<span class="type-badge badge-circle">Circle</span>',
        rectangle: '<span class="type-badge badge-rect">Rectangle</span>',
        angle: '<span class="type-badge badge-angle">Angle</span>'
    };
    return badges[type] || '<span class="type-badge badge-landmark">Point</span>';
}

/**
 * Generate info text for an annotation
 * @param {Object} annotation - Annotation data
 * @returns {string} Info text describing the annotation
 */
function getAnnotationInfoText(annotation) {
    if (annotation.coordinates) {
        return `x: ${Math.round(annotation.coordinates.x)}, y: ${Math.round(annotation.coordinates.y)}`;
    }
    if (annotation.points) {
        return `${annotation.points.length} points`;
    }
    if (annotation.shape) {
        return `${annotation.shape} (${annotation.size}px)`;
    }
    // New annotation types
    if (annotation.type === 'line' && annotation.data) {
        const d = annotation.data;
        const length = Math.sqrt(Math.pow(d.end.x - d.start.x, 2) + Math.pow(d.end.y - d.start.y, 2));
        return `length: ${Math.round(length)}px`;
    }
    if (annotation.type === 'circle' && annotation.data) {
        return `r: ${Math.round(annotation.data.radius)}px`;
    }
    if (annotation.type === 'rectangle' && annotation.data) {
        const d = annotation.data;
        const w = Math.abs(d.bottomRight.x - d.topLeft.x);
        const h = Math.abs(d.bottomRight.y - d.topLeft.y);
        return `${Math.round(w)} x ${Math.round(h)}px`;
    }
    if (annotation.type === 'angle' && annotation.data) {
        // Calculate angle if Measurements module is available
        if (window.Measurements) {
            const m = window.Measurements.measureAngle(annotation.data);
            return m.formatted?.angle || '';
        }
    }
    return '';
}

function renderLabelList(force = false) {
    const currentHash = getLabelListHash();
    if (!force && currentHash === RENDER_STATE.labelListHash) return;
    RENDER_STATE.labelListHash = currentHash;

    const fragment = document.createDocumentFragment();

    const as = window.AnnotationState;
    const allLabels = as?.labels || [];
    const annotations = as?.annotations || {};
    const visibilityToggles = as?.visibilityToggles || {};
    const selectedAnnotation = as?.selectedAnnotation;

    // Only show labels that have annotations for the current image
    const annotatedLabels = allLabels.filter(label => annotations[label.name]);
    const annotatedCount = annotatedLabels.length;
    const totalLabels = allLabels.length;

    // Add annotation count summary at the top
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'annotation-summary';
    summaryDiv.innerHTML = `
        <div class="summary-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <span><strong>${annotatedCount}</strong> of <strong>${totalLabels}</strong> labels annotated</span>
        </div>
    `;
    fragment.appendChild(summaryDiv);

    // Only render cards for labels that have annotations
    annotatedLabels.forEach((label) => {
        const annotation = annotations[label.name];
        const isVisible = visibilityToggles[label.name] !== false;
        const isSelected = selectedAnnotation === label.name;

        const labelDiv = document.createElement('div');
        labelDiv.className = 'label-item annotated';
        if (isSelected) labelDiv.classList.add('selected');

        const typeBadge = getTypeBadgeHtml(annotation.type);
        let statusBadge = '';
        let infoText = '';

        if (annotation.status === 'ok') {
            statusBadge = '<span class="status-badge status-ok">Marked</span>';
            infoText = getAnnotationInfoText(annotation);
        } else if (annotation.status === 'occluded/missing') {
            statusBadge = '<span class="status-badge status-occluded">Occluded</span>';
        }

        const visibilityIcon = isVisible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

        // Use data attributes instead of inline onclick handlers (XSS prevention)
        // Event delegation handles clicks on the label list container
        labelDiv.dataset.label = label.name;
        
        // Escape label names to prevent XSS attacks (user-controllable input)
        const safeName = escapeHtml(label.name);
        const safeInfoText = escapeHtml(infoText);
        
        labelDiv.innerHTML = `
            <div class="label-header">
                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                    <span class="label-name">${safeName}</span>
                    ${typeBadge}
                </div>
                <div class="label-controls">
                    <button class="toggle-btn ${isVisible ? 'active' : ''}"
                            data-action="toggle-visibility"
                            data-label="${label.name}"
                            title="${isVisible ? 'Hide annotation' : 'Show annotation'}">
                        ${visibilityIcon}
                    </button>
                    ${statusBadge}
                </div>
            </div>
            ${safeInfoText ? `<div class="label-info">${safeInfoText}</div>` : ''}
            <div class="label-actions">
                <button class="action-btn btn-delete" data-action="delete" data-label="${label.name}">Delete</button>
            </div>
        `;

        fragment.appendChild(labelDiv);
    });

    DOM.labelList.innerHTML = '';
    DOM.labelList.appendChild(fragment);
}

let _labelListEventDelegationSetup = false;

/**
 * Set up event delegation for label list actions.
 * Uses delegation instead of inline onclick handlers to prevent XSS vulnerabilities.
 * Should be called once during initialization.
 */
function setupLabelListEventDelegation() {
    if (_labelListEventDelegationSetup) return;
    if (!DOM.labelList) {
        console.warn('setupLabelListEventDelegation: DOM.labelList not found');
        return;
    }
    _labelListEventDelegationSetup = true;

    DOM.labelList.addEventListener('click', (e) => {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const label = button.dataset.label;

        if (!label) return;

        switch (action) {
            case 'toggle-visibility':
                window.AnnotationState?.toggleVisibility(label);
                break;
            case 'delete':
                window.deleteAnnotation?.(label);
                break;
        }
    });
}

// ============================================================================
// DrawingHandler Preview Rendering
// ============================================================================

/**
 * Clear existing drawing preview elements
 */
function clearDrawingPreview() {
    document.querySelectorAll('.drawing-preview-point, .drawing-preview-line, .drawing-preview-circle, .drawing-preview-rectangle, .drawing-preview-polygon, .drawing-preview-freehand, .drawing-preview-marker, .drawing-preview-ghost, .drawing-instruction').forEach(el => el.remove());
}

/**
 * Render preview for DrawingHandler's in-progress annotation
 * Called from renderAnnotations when DrawingHandler is active
 */
function renderDrawingPreview() {
    clearDrawingPreview();
    
    const state = window.DrawingHandler?.getPendingState();
    if (!state || state.points.length === 0) return;
    
    const { tool, points, previewPoint, label } = state;
    
    // Get color for this label
    const color = window.DrawingHandler?.getColorForLabel(label) || '#7950f2';
    
    // Render based on tool type
    switch (tool) {
        case 'point':
            renderPointPreview(points, color);
            break;
        case 'line':
            renderLinePreview(points, previewPoint, color);
            break;
        case 'circle':
            renderCirclePreview(points, previewPoint, color);
            break;
        case 'rectangle':
            renderRectanglePreview(points, previewPoint, color);
            break;
        case 'angle':
            renderAnglePreview(points, previewPoint, color);
            break;
        case 'polygon':
            renderPolygonPreview(points, previewPoint, color);
            break;
    }
    
    // Show instruction tooltip
    renderDrawingInstruction(tool, points.length, previewPoint);
}

/**
 * Render a single preview point marker
 * @param {{x: number, y: number}} point - Image coordinates
 * @param {string} color - Marker color
 * @param {boolean} [isStart=false] - Whether this is the start point
 */
function renderPreviewMarker(point, color, isStart = false) {
    const display = viewport.imageToScreen(point.x, point.y);
    
    const marker = document.createElement('div');
    marker.className = 'drawing-preview-marker';
    if (isStart) marker.classList.add('first');
    marker.style.left = `${display.x}px`;
    marker.style.top = `${display.y}px`;
    marker.style.borderColor = color;
    marker.style.backgroundColor = isStart ? color : 'white';
    
    DOM.imageContainer.appendChild(marker);
    return marker;
}

/**
 * Render point annotation preview
 */
function renderPointPreview(points, color) {
    if (points.length === 0) return;
    renderPreviewMarker(points[0], color, true);
}

/**
 * Render line annotation preview
 */
function renderLinePreview(points, previewPoint, color) {
    // Render first point marker
    if (points.length >= 1) {
        renderPreviewMarker(points[0], color, true);
    }
    
    // Render ghost line to cursor
    if (points.length === 1 && previewPoint) {
        const start = viewport.imageToScreen(points[0].x, points[0].y);
        const end = viewport.imageToScreen(previewPoint.x, previewPoint.y);
        
        const { length, angle } = calculateLineProperties(start, end);
        
        const ghost = document.createElement('div');
        ghost.className = 'drawing-preview-ghost drawing-preview-line';
        ghost.style.left = `${start.x}px`;
        ghost.style.top = `${start.y}px`;
        ghost.style.width = `${length}px`;
        ghost.style.transform = `rotate(${angle}deg)`;
        ghost.style.transformOrigin = '0 50%';
        ghost.style.borderColor = color;
        
        DOM.imageContainer.appendChild(ghost);
    }
    
    // Render second point marker if present
    if (points.length >= 2) {
        renderPreviewMarker(points[1], color, false);
        
        // Render solid line
        const start = viewport.imageToScreen(points[0].x, points[0].y);
        const end = viewport.imageToScreen(points[1].x, points[1].y);
        
        const { length, angle } = calculateLineProperties(start, end);
        
        const line = document.createElement('div');
        line.className = 'drawing-preview-line';
        line.style.left = `${start.x}px`;
        line.style.top = `${start.y}px`;
        line.style.width = `${length}px`;
        line.style.transform = `rotate(${angle}deg)`;
        line.style.transformOrigin = '0 50%';
        line.style.backgroundColor = color;
        
        DOM.imageContainer.appendChild(line);
    }
}

/**
 * Render circle annotation preview
 */
function renderCirclePreview(points, previewPoint, color) {
    if (points.length === 0) return;
    
    // Render center marker
    renderPreviewMarker(points[0], color, true);
    
    // Calculate radius from second point or preview
    const edgePoint = points.length >= 2 ? points[1] : previewPoint;
    if (!edgePoint) return;
    
    const center = viewport.imageToScreen(points[0].x, points[0].y);
    const edge = viewport.imageToScreen(edgePoint.x, edgePoint.y);
    
    const dx = edge.x - center.x;
    const dy = edge.y - center.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    const circle = document.createElement('div');
    circle.className = 'drawing-preview-circle';
    if (points.length < 2) circle.classList.add('drawing-preview-ghost');
    circle.style.left = `${center.x - radius}px`;
    circle.style.top = `${center.y - radius}px`;
    circle.style.width = `${radius * 2}px`;
    circle.style.height = `${radius * 2}px`;
    circle.style.borderColor = color;
    
    DOM.imageContainer.appendChild(circle);
    
    // Render edge marker if second point placed
    if (points.length >= 2) {
        renderPreviewMarker(points[1], color, false);
    }
}

/**
 * Render rectangle annotation preview
 */
function renderRectanglePreview(points, previewPoint, color) {
    if (points.length === 0) return;
    
    // Render first corner marker
    renderPreviewMarker(points[0], color, true);
    
    // Calculate bounds from second point or preview
    const corner2 = points.length >= 2 ? points[1] : previewPoint;
    if (!corner2) return;
    
    const p1 = viewport.imageToScreen(points[0].x, points[0].y);
    const p2 = viewport.imageToScreen(corner2.x, corner2.y);
    
    const left = Math.min(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);
    
    const rect = document.createElement('div');
    rect.className = 'drawing-preview-rectangle';
    if (points.length < 2) rect.classList.add('drawing-preview-ghost');
    rect.style.left = `${left}px`;
    rect.style.top = `${top}px`;
    rect.style.width = `${width}px`;
    rect.style.height = `${height}px`;
    rect.style.borderColor = color;
    
    DOM.imageContainer.appendChild(rect);
    
    // Render second corner marker if placed
    if (points.length >= 2) {
        renderPreviewMarker(points[1], color, false);
    }
}

/**
 * Render angle annotation preview
 */
function renderAnglePreview(points, previewPoint, color) {
    // Render existing point markers
    points.forEach((point, index) => {
        renderPreviewMarker(point, color, index === 1); // Vertex is highlighted
    });
    
    // Draw lines between points
    const allPoints = [...points];
    if (points.length < 3 && previewPoint) {
        allPoints.push(previewPoint);
    }
    
    // Line from point1 to vertex
    if (allPoints.length >= 2) {
        const start = viewport.imageToScreen(allPoints[0].x, allPoints[0].y);
        const end = viewport.imageToScreen(allPoints[1].x, allPoints[1].y);
        
        const { length, angle } = calculateLineProperties(start, end);
        
        const line1 = document.createElement('div');
        line1.className = 'drawing-preview-line';
        if (points.length < 2) line1.classList.add('drawing-preview-ghost');
        line1.style.left = `${start.x}px`;
        line1.style.top = `${start.y}px`;
        line1.style.width = `${length}px`;
        line1.style.transform = `rotate(${angle}deg)`;
        line1.style.transformOrigin = '0 50%';
        line1.style.backgroundColor = color;
        
        DOM.imageContainer.appendChild(line1);
    }
    
    // Line from vertex to point2
    if (allPoints.length >= 3) {
        const start = viewport.imageToScreen(allPoints[1].x, allPoints[1].y);
        const end = viewport.imageToScreen(allPoints[2].x, allPoints[2].y);
        
        const { length, angle } = calculateLineProperties(start, end);
        
        const line2 = document.createElement('div');
        line2.className = 'drawing-preview-line';
        if (points.length < 3) line2.classList.add('drawing-preview-ghost');
        line2.style.left = `${start.x}px`;
        line2.style.top = `${start.y}px`;
        line2.style.width = `${length}px`;
        line2.style.transform = `rotate(${angle}deg)`;
        line2.style.transformOrigin = '0 50%';
        line2.style.backgroundColor = color;
        
        DOM.imageContainer.appendChild(line2);
    }
}

/**
 * Render polygon annotation preview
 */
function renderPolygonPreview(points, previewPoint, color) {
    if (points.length === 0) return;
    
    // Create SVG for polygon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'drawing-preview-polygon');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '15';
    
    // Build points array including preview
    const displayPoints = points.map(p => viewport.imageToScreen(p.x, p.y));
    if (previewPoint) {
        displayPoints.push(viewport.imageToScreen(previewPoint.x, previewPoint.y));
    }
    
    // Draw polygon outline (not closed yet)
    if (displayPoints.length >= 2) {
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const pointsStr = displayPoints.map(p => `${p.x},${p.y}`).join(' ');
        polyline.setAttribute('points', pointsStr);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', color);
        polyline.setAttribute('stroke-width', '2');
        polyline.setAttribute('stroke-dasharray', points.length < 3 ? '5,5' : '0');
        svg.appendChild(polyline);
        
        // Draw closing line (dashed) if we have 3+ points
        if (points.length >= 3) {
            const closeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const lastPoint = displayPoints[displayPoints.length - 1];
            closeLine.setAttribute('x1', lastPoint.x);
            closeLine.setAttribute('y1', lastPoint.y);
            closeLine.setAttribute('x2', displayPoints[0].x);
            closeLine.setAttribute('y2', displayPoints[0].y);
            closeLine.setAttribute('stroke', color);
            closeLine.setAttribute('stroke-width', '2');
            closeLine.setAttribute('stroke-dasharray', '5,5');
            closeLine.setAttribute('opacity', '0.5');
            svg.appendChild(closeLine);
        }
    }
    
    DOM.imageContainer.appendChild(svg);
    
    // Render point markers
    points.forEach((point, index) => {
        renderPreviewMarker(point, color, index === 0);
    });
}

/**
 * Render instruction tooltip for drawing
 */
function renderDrawingInstruction(tool, pointCount, previewPoint) {
    const instructions = {
        point: ['Click to place point'],
        line: ['Click to set start point', 'Click to set end point'],
        circle: ['Click to set center', 'Click to set radius'],
        rectangle: ['Click first corner', 'Click opposite corner'],
        angle: ['Click first point', 'Click vertex point', 'Click second point'],
        polygon: ['Click to add points', 'Click to add points (3+ needed)', 'Double-click or Enter to complete']
    };
    
    const toolInstructions = instructions[tool] || ['Click to continue'];
    let message = toolInstructions[Math.min(pointCount, toolInstructions.length - 1)];
    
    // Special handling for polygon
    if (tool === 'polygon' && pointCount >= 3) {
        message = 'Double-click or press Enter to complete';
    }
    
    // Only show instruction if we have a preview point (mouse is moving)
    if (!previewPoint) return;
    
    const display = viewport.imageToScreen(previewPoint.x, previewPoint.y);
    
    const instruction = document.createElement('div');
    instruction.className = 'drawing-instruction';
    instruction.textContent = message;
    instruction.style.left = `${display.x + 15}px`;
    instruction.style.top = `${display.y - 25}px`;
    
    DOM.imageContainer.appendChild(instruction);
}

// ============================================================================
// Exports / Global Registration
// ============================================================================

// These functions need to be available globally for other modules
window.scheduleRender = scheduleRender;
window.forceRender = forceRender;
window.setupReactiveRendering = setupReactiveRendering;
window.teardownReactiveRendering = teardownReactiveRendering;
window.renderAnnotations = renderAnnotations;
window.renderLabelList = renderLabelList;
window.setupLabelListEventDelegation = setupLabelListEventDelegation;
window.clearDrawingPreview = clearDrawingPreview;
window.renderDrawingPreview = renderDrawingPreview;

console.log('[rendering.js] Rendering module loaded - delegates to SVG AnnotationRenderer when available');
