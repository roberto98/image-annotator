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
    
    // Update toolbar buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Update sidebar title to show current tool
    const titles = {
        landmark: 'Labels (Point Mode)',
        polygon: 'Labels (Polygon Mode)',
        figure: 'Labels (Figure Mode)'
    };
    DOM.sidebarTitle.textContent = titles[tool];
    
    // Show/hide tool-specific panels
    DOM.figureConfig.classList.toggle('active', tool === 'figure');
    DOM.polygonTools.classList.toggle('active', tool === 'polygon');
    
    // Clear polygon drawing if switching away
    if (tool !== 'polygon') {
        clearPolygonElements();
        STATE.activePolygonPoints = [];
    }
    
    // Clear selection
    STATE.selectedLabel = null;
    
    // Update figure interactivity
    updateFigureInteractivity();
    
    // Re-render label list
    renderLabelList();
    renderAnnotations();
    
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
    
    // Check if label already exists
    const exists = STATE.allLabels.some(l => l.name === name);
    if (exists) {
        showMessage('Label already exists', 'warning');
        return;
    }
    
    try {
        // Create as a generic landmark initially - type will be determined when annotating
        const response = await fetch('/api/landmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ landmark_name: name })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Add to local state
            STATE.allLabels.push({
                name: name,
                in_use: false,
                annotated_count: 0,
                total_count: 0,
                type: 'generic'
            });
            
            // Sort alphabetically
            STATE.allLabels.sort((a, b) => a.name.localeCompare(b.name));
            
            // Initialize visibility
            STATE.visibilityToggles[name] = true;
            
            // Clear input and select new label
            DOM.labelInput.value = '';
            selectLabel(name);
            renderLabelList();
            
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
    renderLabelList();
    
    // Update figure interactivity based on new label selection
    updateFigureInteractivity();
    
    // Load existing annotation if present
    const annotation = STATE.annotations[name];
    if (annotation) {
        // If polygon annotation exists and we're in polygon mode, load it for editing
        if (STATE.currentTool === 'polygon' && annotation.type === 'polygon' && annotation.points) {
            STATE.activePolygonPoints = JSON.parse(JSON.stringify(annotation.points));
            renderActivePolygon();
            DOM.completePolyBtn.disabled = false;
            setPolygonTool('edit');
        }
    }
    
    // Switch to annotation mode
    if (!STATE.isAnnotationMode) {
        STATE.isAnnotationMode = true;
        updateModeDisplay();
    }
    
    showMessage(`Selected: ${name} (${STATE.currentTool} mode)`);
}

function toggleVisibility(name) {
    STATE.visibilityToggles[name] = !STATE.visibilityToggles[name];
    renderLabelList();
    renderAnnotations();
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
            STATE.annotations[name] = { 
                status: 'occluded/missing',
                timestamp: new Date().toISOString()
            };
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage(`${name} marked as occluded`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to mark as occluded', 'error');
    }
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
        const annotation = STATE.annotations[name];
        let endpoint;
        
        if (annotation) {
            if (annotation.type === 'polygon') {
                endpoint = `/api/segments/${window.patientId}/${window.imageName}/${name}`;
            } else if (annotation.type === 'figure') {
                endpoint = `/api/figures/${window.patientId}/${window.imageName}/${name}`;
            } else {
                endpoint = `/api/landmarks/${window.patientId}/${window.imageName}/${name}`;
            }
        } else {
            endpoint = `/api/landmarks/${window.patientId}/${window.imageName}/${name}`;
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove' })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            delete STATE.annotations[name];
            if (STATE.selectedLabel === name) {
                STATE.selectedLabel = null;
                // Update figure interactivity when label is deselected
                updateFigureInteractivity();
            }
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage(`Deleted annotation for ${name}`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to delete annotation', 'error');
    }
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
            STATE.annotations[STATE.selectedLabel] = {
                status: 'ok',
                coordinates: { x: coords.x, y: coords.y },
                timestamp: new Date().toISOString()
            };
            saveToHistory();
            renderLabelList();
            renderAnnotations();
            showMessage(`Annotated ${STATE.selectedLabel}`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to save annotation', 'error');
    }
}

async function propagateAnnotations() {
    try {
        // Check if there are any annotations to propagate
        const annotationCount = Object.keys(STATE.annotations).length;
        if (annotationCount === 0) {
            showMessage('No annotations to propagate', 'warning');
            return;
        }
        
        // Show confirmation dialog
        const confirmed = confirm(`Propagate ${annotationCount} annotations to the next unannotated image?`);
        if (!confirmed) {
            return;
        }
        
        // Show loading message
        showMessage('Propagating annotations...', 'info');
        
        // Make API request to propagate annotations
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
            
            // Optionally navigate to the target image
            if (data.target_patient && data.target_image) {
                const navigate = confirm('Navigate to the target image?');
                if (navigate) {
                    window.location.href = `/annotate/${data.target_patient}/${data.target_image}`;
                }
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
