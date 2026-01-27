/**
 * Application initialization and setup
 * @module initialization
 */

/**
 * Load figure labels from existing annotations and backend data
 * Combines landmarks, segments, and figures into unified label list
 */
function loadFigureLabelsFromAnnotations() {
    const landmarks = window.landmarksData || [];
    const segments = window.segmentsData || [];
    const figures = window.figuresData || [];

    const labelMap = new Map();

    // Backend labels - later entries overwrite earlier ones
    [...landmarks, ...segments, ...figures].forEach(label => {
        labelMap.set(label.name, label);
    });

    // Labels from existing annotations fill in any gaps
    Object.entries(STATE.annotations).forEach(([name, data]) => {
        if (!labelMap.has(name)) {
            labelMap.set(name, {
                name,
                in_use: true,
                annotated_count: 1,
                total_count: 1,
                type: data.type || 'landmark'
            });
        }
    });

    STATE.allLabels = Array.from(labelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function initializeVisibilityToggles() {
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
    DOM.landmarkToolBtn.addEventListener('click', () => switchTool('landmark'));
    DOM.polygonToolBtn.addEventListener('click', () => switchTool('polygon'));
    DOM.figureToolBtn.addEventListener('click', () => switchTool('figure'));

    DOM.createLabelBtn.addEventListener('click', createNewLabel);
    DOM.labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createNewLabel();
        }
    });

    DOM.zoomIn.addEventListener('click', zoomIn);
    DOM.zoomOut.addEventListener('click', zoomOut);
    DOM.resetView.addEventListener('click', resetView);
    DOM.toggleCenters.addEventListener('click', toggleCenterIndicators);

    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('nextUnannotatedBtn').addEventListener('click', nextUnannotatedImage);

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

    DOM.modeIndicator.addEventListener('click', toggleMode);

    DOM.imageContainer.addEventListener('mousedown', handleMouseDown);
    DOM.imageContainer.addEventListener('mousemove', handleMouseMove);
    DOM.imageContainer.addEventListener('mouseup', handleMouseUp);
    DOM.imageContainer.addEventListener('mouseleave', handleMouseUp);
    DOM.imageContainer.addEventListener('wheel', handleWheel);

    document.addEventListener('keydown', (e) => {
        const isMod = e.ctrlKey || e.metaKey;

        if (isMod && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if (isMod && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            redo();
        } else {
            handleKeyDown(e);
        }
    });

    DOM.circleBtn.addEventListener('click', () => selectFigureShape('circle'));
    DOM.rectangleBtn.addEventListener('click', () => selectFigureShape('rectangle'));
    DOM.lineBtn.addEventListener('click', () => selectFigureShape('line'));
    DOM.figureSize.addEventListener('input', (e) => {
        STATE.figureSize = parseInt(e.target.value) || 50;
    });

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

    STATE.annotations = window.currentAnnotations || {};
    loadFigureLabelsFromAnnotations();
    initializeVisibilityToggles();
    setupEventListeners();
    saveToHistory();

    if (DOM.img.complete) {
        handleImageLoad();
    } else {
        DOM.img.addEventListener('load', handleImageLoad);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
