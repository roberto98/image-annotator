/**
 * Application initialization and setup
 * @module initialization
 * 
 * REWRITTEN: New modular annotation system integration
 * - Uses DrawingHandler for tool activation
 * - Uses AnnotationRenderer for SVG rendering
 * - Uses LabelSelector for label selection
 * - Maintains backward compatibility with legacy STATE
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
                type: data.type || 'point'
            });
        }
    });

    STATE.allLabels = Array.from(labelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    
    // Also sync to AnnotationState if available
    if (window.AnnotationState) {
        window.AnnotationState.labels = STATE.allLabels;
    }
}

function initializeVisibilityToggles() {
    const toggles = {};
    STATE.allLabels.forEach(label => {
        toggles[label.name] = true;
    });
    STATE.visibilityToggles = toggles;
}

function handleImageLoad() {
    console.log('[Initialization] Image loaded');
    
    if (STATE) {
        STATE.imageLoaded = true;
        STATE.naturalWidth = DOM.img.naturalWidth;
        STATE.naturalHeight = DOM.img.naturalHeight;
    }

    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = 'none';
        console.log('[Initialization] Loading overlay hidden');
    }
    
    if (DOM.imageWrapper && STATE) {
        DOM.imageWrapper.style.width = `${STATE.naturalWidth}px`;
        DOM.imageWrapper.style.height = `${STATE.naturalHeight}px`;
    }

    // Update the viewport with image dimensions for bounds checking
    if (window.viewport && typeof window.viewport.setImageSize === 'function') {
        window.viewport.setImageSize(STATE.naturalWidth, STATE.naturalHeight);
        console.log('[Initialization] Viewport image size set:', STATE.naturalWidth, 'x', STATE.naturalHeight);
    }

    // Update the new annotation renderer with image dimensions
    if (window.annotationRenderer && STATE) {
        window.annotationRenderer.setImageSize(STATE.naturalWidth, STATE.naturalHeight);
    }
    
    // Update AnnotationState with image dimensions
    if (window.AnnotationState) {
        window.AnnotationState.imageWidth = STATE.naturalWidth;
        window.AnnotationState.imageHeight = STATE.naturalHeight;
    }

    if (typeof resetView === 'function') {
        resetView();
    }
    
    // Initial render with new renderer
    if (window.annotationRenderer && STATE?.annotations) {
        const calibration = window.AnnotationState?.calibration?.pixelsPerMm || null;
        window.annotationRenderer.render(STATE.annotations, calibration);
    }
}

/**
 * Handle image loading errors
 * @param {Event} e - Error event
 */
function handleImageError(e) {
    console.error('[Initialization] Failed to load image:', e);
    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = 'none';
    }
    if (typeof showMessage === 'function') {
        showMessage('Failed to load image', 'error');
    }
    if (STATE) {
        STATE.imageLoaded = false;
    }
}

/**
 * Handle tool button click - activates DrawingHandler with the selected tool
 * @param {string} tool - Tool name (from AnnotationType)
 * @param {Event} e - Click event
 */
function handleToolButtonClick(tool, e) {
    // Use the new DrawingHandler system
    if (window.DrawingHandler) {
        window.DrawingHandler.activate(tool);
    }
    
    // Update tool button UI
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Show status message
    const toolName = window.getTypeDisplayName?.(tool) || tool;
    showMessage(`${toolName} tool selected - click on image to annotate`, 'info');
}

function setupEventListeners() {
    // Tool buttons - use new handler system
    const toolButtons = document.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tool = btn.dataset.tool;
            handleToolButtonClick(tool, e);
        });
    });

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

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('nextUnannotatedBtn').addEventListener('click', nextUnannotatedImage);

    // Image adjustments
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

    // Mouse events for canvas - only if not handled by DrawingHandler/EditingHandler
    // The new handlers attach their own listeners, but we keep pan/zoom support
    if (typeof handleMouseDown === 'function') {
        DOM.imageContainer.addEventListener('mousedown', handleMouseDown);
    }
    if (typeof handleMouseMove === 'function') {
        DOM.imageContainer.addEventListener('mousemove', handleMouseMove);
    }
    if (typeof handleMouseUp === 'function') {
        DOM.imageContainer.addEventListener('mouseup', handleMouseUp);
        DOM.imageContainer.addEventListener('mouseleave', handleMouseUp);
    }
    if (typeof handleWheel === 'function') {
        DOM.imageContainer.addEventListener('wheel', handleWheel);
    }

    // Touch events for mobile support
    if (typeof handleTouchStart === 'function') {
        DOM.imageContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    }
    if (typeof handleTouchMove === 'function') {
        DOM.imageContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    if (typeof handleTouchEnd === 'function') {
        DOM.imageContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Skip if popup is open
        if (typeof LabelPopup !== 'undefined' && LabelPopup.isOpen) return;
        if (typeof LabelSelector !== 'undefined' && LabelSelector.isOpen) return;
        
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

    // Figure shape buttons (legacy support)
    if (DOM.circleBtn) {
        DOM.circleBtn.addEventListener('click', () => handleToolButtonClick('circle'));
    }
    if (DOM.rectangleBtn) {
        DOM.rectangleBtn.addEventListener('click', () => handleToolButtonClick('rectangle'));
    }
    if (DOM.lineBtn) {
        DOM.lineBtn.addEventListener('click', () => handleToolButtonClick('line'));
    }

    // Polygon tools - use new DrawingHandler if available, fallback to legacy
    if (DOM.drawPolyBtn) {
        DOM.drawPolyBtn.addEventListener('click', () => {
            if (typeof setPolygonTool === 'function') {
                setPolygonTool('draw');
            } else {
                handleToolButtonClick('polygon');
            }
        });
    }
    if (DOM.editPolyBtn) {
        DOM.editPolyBtn.addEventListener('click', () => {
            if (typeof setPolygonTool === 'function') {
                setPolygonTool('edit');
            }
            // Note: editing is handled by EditingHandler in new system
        });
    }
    if (DOM.movePolyBtn) {
        DOM.movePolyBtn.addEventListener('click', () => {
            if (typeof setPolygonTool === 'function') {
                setPolygonTool('move');
            }
            // Note: moving is handled by EditingHandler in new system
        });
    }
    if (DOM.completePolyBtn) {
        DOM.completePolyBtn.addEventListener('click', () => {
            if (typeof completePolygon === 'function') {
                completePolygon();
            } else if (window.DrawingHandler?.isDrawingInProgress?.()) {
                // Use new DrawingHandler to complete polygon
                window.DrawingHandler.completeAnnotation();
            }
        });
    }
    if (DOM.cancelPolyBtn) {
        DOM.cancelPolyBtn.addEventListener('click', () => {
            if (typeof cancelPolygon === 'function') {
                cancelPolygon();
            } else if (window.DrawingHandler) {
                window.DrawingHandler.cancelDrawing();
            }
        });
    }
}

/**
 * Initialize the annotation application
 */
function initializeApp() {
    try {
        console.log('[Initialization] Starting initialization...');
        
        // Verify viewport exists and is properly linked
        if (typeof viewport === 'undefined' || !viewport) {
            console.error('[Initialization] viewport is not defined!');
            throw new Error('viewport is not defined');
        }
        console.log('[Initialization] viewport object:', viewport);
        
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
                console.log('[Initialization] Template data loaded');
            } catch (e) {
                console.error('[Initialization] Error parsing template data:', e);
            }
        }

        // Link viewport to globals after STATE and DOM are ready
        if (typeof linkViewportToGlobals === 'function') {
            linkViewportToGlobals();
        }
        
        if (typeof setupReactiveRendering === 'function') {
            setupReactiveRendering();
        }
        
        // Only setup figure event delegation if the legacy handlers exist
        if (typeof setupFigureEventDelegation === 'function') {
            setupFigureEventDelegation();
        }
        
        if (typeof setupLabelListEventDelegation === 'function') {
            setupLabelListEventDelegation();
        }

        if (STATE) {
            STATE.annotations = window.currentAnnotations || {};
        }
        loadFigureLabelsFromAnnotations();
        initializeVisibilityToggles();
        setupEventListeners();
        if (typeof saveToHistory === 'function') {
            saveToHistory();
        }

        // Initialize new annotation system modules
        initializeNewAnnotationSystem();

        // Initialize LabelPopup (legacy fallback)
        if (typeof LabelPopup !== 'undefined') {
            LabelPopup.init();
        }

        // Handle image loading
        if (DOM.img && DOM.img.complete) {
            console.log('[Initialization] Image already loaded');
            handleImageLoad();
        } else if (DOM.img) {
            console.log('[Initialization] Waiting for image to load...');
            DOM.img.addEventListener('load', handleImageLoad);
            DOM.img.addEventListener('error', handleImageError);
        } else {
            console.error('[Initialization] Image element not found!');
            if (DOM.loadingOverlay) {
                DOM.loadingOverlay.style.display = 'none';
            }
            if (typeof showMessage === 'function') {
                showMessage('Image element not found', 'error');
            }
            return;
        }

        // Set initial mode display
        if (typeof updateModeDisplay === 'function') {
            updateModeDisplay();
        }
        
        // Set initial tool to point
        const initialTool = 'point';
        if (window.DrawingHandler) {
            setTimeout(() => {
                try {
                    handleToolButtonClick(initialTool);
                } catch (e) {
                    console.error('[Initialization] Error setting initial tool:', e);
                }
            }, 100);
        }
        
        console.log('[Initialization] Complete');
    } catch (error) {
        console.error('[Initialization] Fatal error:', error);
        if (DOM.loadingOverlay) {
            DOM.loadingOverlay.style.display = 'none';
        }
        if (typeof showMessage === 'function') {
            showMessage('Failed to initialize application: ' + error.message, 'error');
        }
    }
}

/**
 * Initialize new annotation system modules
 * Connects AnnotationRenderer, DrawingHandler, EditingHandler, and LabelSelector
 */
function initializeNewAnnotationSystem() {
    try {
        console.log('[Initialization] Setting up new annotation system...');
        
        // Initialize AnnotationState with context
        if (window.AnnotationState) {
            window.AnnotationState.init({
                patientId: window.patientId,
                imageName: window.imageName,
                annotations: STATE?.annotations || {},
                labels: STATE?.allLabels || []
            });
            console.log('[Initialization] AnnotationState initialized');
        }
        
        // Initialize AnnotationRenderer (use singleton instance)
        if (window.annotationRenderer && DOM.imageContainer) {
            window.annotationRenderer.init(DOM.imageContainer, window.viewport, {
                showMeasurements: true,
                showHandles: true,
                showLabels: true
            });
            
            // Set image size when available
            if (STATE?.naturalWidth && STATE?.naturalHeight) {
                window.annotationRenderer.setImageSize(STATE.naturalWidth, STATE.naturalHeight);
            }
            
            console.log('[Initialization] AnnotationRenderer initialized');
        }
        
        // Initialize LabelSelector
        if (window.LabelSelector) {
            window.LabelSelector.init();
            console.log('[Initialization] LabelSelector initialized');
        }
        
        // Initialize DrawingHandler
        if (window.DrawingHandler) {
            window.DrawingHandler.init();
            console.log('[Initialization] DrawingHandler initialized');
        }
        
        // Initialize EditingHandler
        if (window.EditingHandler) {
            window.EditingHandler.init();
            console.log('[Initialization] EditingHandler initialized');
        }
        
        // Subscribe to AnnotationState changes to sync with legacy STATE
        if (window.AnnotationState?.subscribe) {
            window.AnnotationState.subscribe((event, data) => {
                // Sync annotations back to legacy STATE
                if (event === 'annotationSet' || event === 'annotationRemoved' || event === 'annotationsLoaded') {
                    if (STATE) {
                        STATE.annotations = { ...window.AnnotationState.annotations };
                    }
                }
                
                // Trigger render on relevant events
                const renderEvents = [
                    'annotationSet', 'annotationRemoved', 'annotationsLoaded',
                    'visibilityToggled', 'visibilitySet', 'pendingCleared'
                ];
                
                if (renderEvents.includes(event)) {
                    if (window.annotationRenderer?.render) {
                        // Use the new renderer with annotations data
                        const annotations = window.AnnotationState?.annotations || STATE?.annotations || {};
                        const calibration = window.AnnotationState?.calibration?.pixelsPerMm || null;
                        window.annotationRenderer.render(annotations, calibration);
                    } else if (typeof scheduleRender === 'function') {
                        scheduleRender();
                    }
                }
            });
            console.log('[Initialization] AnnotationState subscription established');
        }
        
        console.log('[Initialization] New annotation system ready');
    } catch (error) {
        console.error('[Initialization] Error initializing new annotation system:', error);
        throw error;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// Safety net: Hide loading overlay after 10 seconds if something went wrong
setTimeout(() => {
    if (DOM.loadingOverlay && DOM.loadingOverlay.style.display !== 'none') {
        console.warn('[Initialization] Loading overlay still visible after 10s - forcing hide');
        DOM.loadingOverlay.style.display = 'none';
        if (typeof showMessage === 'function') {
            showMessage('Loading timeout - some features may not work', 'warning');
        }
    }
}, 10000);
