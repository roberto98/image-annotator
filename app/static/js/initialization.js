/**
 * Application initialization and setup
 * @module initialization
 */

/**
 * Load figure labels from existing annotations and backend data
 * Combines landmarks, segments, and figures into unified label list
 */
function loadFigureLabelsFromAnnotations() {
    // Combine all label types into one unified list
    const landmarks = window.landmarksData || [];
    const segments = window.segmentsData || [];
    const figures = window.figuresData || [];
    
    // Combine all labels and remove duplicates based on name
    const allLabelsRaw = [
        ...landmarks,
        ...segments,
        ...figures
    ];
    
    // Create a map to store unique labels (keyed by name)
    const labelMap = new Map();
    
    // Add all labels from backend, later entries will overwrite earlier ones
    allLabelsRaw.forEach(label => {
        labelMap.set(label.name, label);
    });
    
    // Also extract labels from existing annotations (these take priority)
    Object.entries(STATE.annotations).forEach(([name, data]) => {
        if (!labelMap.has(name)) {
            labelMap.set(name, {
                name: name,
                in_use: true,
                annotated_count: 1,
                total_count: 1,
                type: data.type || 'landmark'
            });
        }
    });
    
    // Convert map back to array and sort alphabetically
    STATE.allLabels = Array.from(labelMap.values());
    STATE.allLabels.sort((a, b) => a.name.localeCompare(b.name));
}

function initializeVisibilityToggles() {
    // Initialize all labels as visible by default
    STATE.allLabels.forEach(label => {
        STATE.visibilityToggles[label.name] = true;
    });
}

function handleImageLoad() {
    STATE.imageLoaded = true;
    STATE.naturalWidth = DOM.img.naturalWidth;
    STATE.naturalHeight = DOM.img.naturalHeight;
    
    DOM.loadingOverlay.style.display = 'none';
    DOM.imageWrapper.style.width = `${STATE.naturalWidth}px`;
    DOM.imageWrapper.style.height = `${STATE.naturalHeight}px`;
    
    resetView();
    renderLabelList();
    renderAnnotations();
}

function setupEventListeners() {
    // Tool selection
    DOM.landmarkToolBtn.addEventListener('click', () => switchTool('landmark'));
    DOM.polygonToolBtn.addEventListener('click', () => switchTool('polygon'));
    DOM.figureToolBtn.addEventListener('click', () => switchTool('figure'));
    
    // Label creation
    DOM.createLabelBtn.addEventListener('click', createNewLabel);
    DOM.labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createNewLabel();
        }
    });
    
    // Zoom controls
    DOM.zoomIn.addEventListener('click', zoomIn);
    DOM.zoomOut.addEventListener('click', zoomOut);
    DOM.resetView.addEventListener('click', resetView);
    DOM.toggleCenters.addEventListener('click', toggleCenterIndicators);
    
    // Undo/Redo buttons
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    
    // Next Unannotated button
    document.getElementById('nextUnannotatedBtn').addEventListener('click', nextUnannotatedImage);
    
    // Brightness/Contrast sliders
    document.getElementById('brightnessSlider').addEventListener('input', (e) => {
        STATE.brightness = parseInt(e.target.value);
        updateImageAdjustments();
        document.getElementById('brightnessValue').textContent = STATE.brightness + '%';
    });
    document.getElementById('contrastSlider').addEventListener('input', (e) => {
        STATE.contrast = parseInt(e.target.value);
        updateImageAdjustments();
        document.getElementById('contrastValue').textContent = STATE.contrast + '%';
    });
    document.getElementById('resetAdjustments').addEventListener('click', resetImageAdjustments);
    
    // Mode toggle
    DOM.modeIndicator.addEventListener('click', toggleMode);
    
    // Image interactions
    DOM.imageContainer.addEventListener('mousedown', handleMouseDown);
    DOM.imageContainer.addEventListener('mousemove', handleMouseMove);
    DOM.imageContainer.addEventListener('mouseup', handleMouseUp);
    DOM.imageContainer.addEventListener('mouseleave', handleMouseUp);
    DOM.imageContainer.addEventListener('wheel', handleWheel);
    
    // Consolidated keyboard shortcuts (combines undo/redo with other shortcuts)
    // Supports both Ctrl (Windows/Linux) and Cmd (macOS)
    document.addEventListener('keydown', (e) => {
        const isMod = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on Mac
        
        // Ctrl/Cmd+Z for Undo
        if (isMod && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }
        // Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z for Redo
        if ((isMod && e.key === 'y') || (isMod && e.shiftKey && e.key === 'z') || (isMod && e.shiftKey && e.key === 'Z')) {
            e.preventDefault();
            redo();
            return;
        }
        // Delegate other shortcuts to handleKeyDown
        handleKeyDown(e);
    });
    
    // Figure shape selection
    DOM.circleBtn.addEventListener('click', () => selectFigureShape('circle'));
    DOM.rectangleBtn.addEventListener('click', () => selectFigureShape('rectangle'));
    DOM.lineBtn.addEventListener('click', () => selectFigureShape('line'));
    DOM.figureSize.addEventListener('input', (e) => {
        STATE.figureSize = parseInt(e.target.value) || 50;
    });
    
    // Polygon tools
    DOM.drawPolyBtn.addEventListener('click', () => setPolygonTool('draw'));
    DOM.editPolyBtn.addEventListener('click', () => setPolygonTool('edit'));
    DOM.movePolyBtn.addEventListener('click', () => setPolygonTool('move'));
    DOM.completePolyBtn.addEventListener('click', completePolygon);
    DOM.cancelPolyBtn.addEventListener('click', cancelPolygon);
}

/**
 * Initialize the annotation application
 * Loads data, sets up event listeners, and prepares the UI
 */
function initializeApp() {
    // Load template data from JSON script tag
    const templateDataElement = document.getElementById('template-data');
    if (templateDataElement) {
        try {
            const templateData = JSON.parse(templateDataElement.textContent);
            window.currentAnnotations = templateData.currentAnnotations;
            window.landmarksData = templateData.landmarksData;
            window.segmentsData = templateData.segmentsData;
            window.figuresData = templateData.figuresData;
            window.patientId = templateData.patientId;
            window.imageName = templateData.imageName;
        } catch (e) {
            console.error('Error parsing template data:', e);
        }
    }
    
    // Load annotations from window object (set by template)
    STATE.annotations = window.currentAnnotations || {};
    
    // Load existing figure labels from annotations
    loadFigureLabelsFromAnnotations();
    
    // Initialize visibility toggles
    initializeVisibilityToggles();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize center indicator button state
    DOM.toggleCenters.style.background = STATE.showCenterIndicators ? '#5a3db8' : '#667eea';
    DOM.toggleCenters.style.opacity = STATE.showCenterIndicators ? '1' : '0.7';
    
    // Save initial state to history
    saveToHistory();
    
    // Handle image load
    if (DOM.img.complete) {
        handleImageLoad();
    } else {
        DOM.img.addEventListener('load', handleImageLoad);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
