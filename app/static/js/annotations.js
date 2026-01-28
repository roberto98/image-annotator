/**
 * Annotation operations for points, polygons, and figures
 * @module annotations
 */

/**
 * Switch the current annotation tool
 * @param {string} tool - Tool name: 'landmark', 'polygon', or 'figure'
 */
function switchTool(tool) {
    STATE.currentTool = tool;

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    const titles = {
        landmark: 'Labels (Point Mode)',
        polygon: 'Labels (Polygon Mode)',
        figure: 'Labels (Figure Mode)'
    };
    DOM.sidebarTitle.textContent = titles[tool];

    DOM.figureConfig.classList.toggle('active', tool === 'figure');
    DOM.polygonTools.classList.toggle('active', tool === 'polygon');

    if (tool !== 'polygon') {
        clearPolygonElements();
        STATE.activePolygonPoints = [];
    }

    STATE.selectedLabel = null;
    updateFigureInteractivity();

    showMessage(`Switched to ${tool} mode`);
}

/**
 * Create a new label from user input
 * @async
 * @returns {Promise<void>}
 */
async function createNewLabel() {
    const name = DOM.labelInput.value.trim();
    if (!name) {
        showMessage('Please enter a label name', 'warning');
        return;
    }

    if (STATE.allLabels.some(l => l.name === name)) {
        showMessage('Label already exists', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/landmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ landmark_name: name })
        });

        const data = await response.json();

        if (data.status === 'success') {
            STATE.allLabels = [...STATE.allLabels, {
                name,
                in_use: false,
                annotated_count: 0,
                total_count: 0,
                type: 'generic'
            }].sort((a, b) => a.name.localeCompare(b.name));

            STATE.visibilityToggles = { ...STATE.visibilityToggles, [name]: true };

            DOM.labelInput.value = '';
            selectLabel(name);

            showMessage(`Label "${name}" created`, 'success');
        }
    } catch (error) {
        console.error('Error creating label:', error);
        showMessage('Failed to create label', 'error');
    }
}

/**
 * Select a label for annotation
 * @param {string} name - The label name to select
 */
function selectLabel(name) {
    STATE.selectedLabel = name;
    updateFigureInteractivity();

    const annotation = STATE.annotations[name];
    if (annotation && STATE.currentTool === 'polygon' && annotation.type === 'polygon' && annotation.points) {
        STATE.activePolygonPoints = JSON.parse(JSON.stringify(annotation.points));
        renderActivePolygon();
        DOM.completePolyBtn.disabled = false;
        setPolygonTool('edit');
    }

    if (!STATE.isAnnotationMode) {
        STATE.isAnnotationMode = true;
        updateModeDisplay();
    }
    
    showMessage(`Selected: ${name} (${STATE.currentTool} mode)`);
}

function toggleVisibility(name) {
    STATE.visibilityToggles = {
        ...STATE.visibilityToggles,
        [name]: !STATE.visibilityToggles[name]
    };
}

async function markOccluded(name) {
    try {
        const response = await fetch(`/api/landmarks/${window.patientId}/${window.imageName}/${name}`, {
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
            showMessage(`${name} marked as occluded`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to mark as occluded', 'error');
    }
}

/**
 * Get the API endpoint for an annotation based on its type
 * @param {string} name - The annotation label name
 * @param {Object} annotation - The annotation data object
 * @returns {string} API endpoint path
 */
function getAnnotationEndpoint(name, annotation) {
    const path = `/${window.patientId}/${window.imageName}/${name}`;
    const type = annotation?.type;

    if (type === 'polygon') return `/api/segments${path}`;
    if (type === 'figure') return `/api/figures${path}`;
    return `/api/landmarks${path}`;
}

/**
 * Delete an annotation after user confirmation
 * @async
 * @param {string} name - The label name to delete
 * @returns {Promise<void>}
 */
async function deleteAnnotation(name) {
    if (!confirm(`⚠️ Are you sure you want to delete the annotation for "${name}"?\n\nThis action cannot be undone (unless you use Ctrl+Z).`)) return;

    try {
        const endpoint = getAnnotationEndpoint(name, STATE.annotations[name]);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove' })
        });

        const data = await response.json();
        if (data.status === 'success') {
            const { [name]: _, ...rest } = STATE.annotations;
            STATE.annotations = rest;
            if (STATE.selectedLabel === name) {
                STATE.selectedLabel = null;
                updateFigureInteractivity();
            }
            saveToHistory();
            showMessage(`Deleted annotation for ${name}`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to delete annotation', 'error');
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
    try {
        const response = await fetch(`/api/landmarks/${window.patientId}/${window.imageName}/${STATE.selectedLabel}`, {
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
            showMessage(`Annotated ${STATE.selectedLabel}`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to save annotation', 'error');
    }
}

async function propagateAnnotations() {
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
                window.location.href = `/annotate/${data.target_patient}/${data.target_image}`;
            }
        } else {
            showMessage(data.message || 'Failed to propagate annotations', 'error');
        }
    } catch (error) {
        console.error('Error propagating annotations:', error);
        showMessage('Failed to propagate annotations', 'error');
    }
}

async function nextUnannotatedImage() {
    try {
        const response = await fetch(`/api/next-unannotated?current_patient=${window.patientId}&current_image=${window.imageName}`);
        const data = await response.json();
        
        if (data.patient && data.image) {
            window.location.href = `/annotate/${data.patient}/${data.image}`;
        } else {
            showMessage('No more unannotated images found', 'info');
        }
    } catch (error) {
        console.error('Error finding next unannotated image:', error);
        showMessage('Error finding next image', 'error');
    }
}
