/**
 * Application initialization and setup
 * @module initialization
 */

let _appInitialized = false;
let _annotationSystemInitialized = false;

// Event types that require syncing annotations to legacy STATE
const SYNC_EVENTS = [
    'annotationSet', 'annotationRemoved', 'annotationsLoaded',
    'undo', 'redo'
];

// Event types that trigger re-rendering
const RENDER_EVENTS = [
    'annotationSet', 'annotationRemoved', 'annotationsLoaded',
    'visibilityToggled', 'visibilitySet', 'pendingCleared',
    'undo', 'redo'
];

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
    
    // Initial render - use renderAnnotations to ensure colors are applied consistently
    if (STATE.annotations) {
        // Pre-assign colors for all existing annotations to ensure consistency
        if (window.getColorForLabel) {
            Object.keys(STATE.annotations).forEach(name => {
                window.getColorForLabel(name);  // This assigns and caches the color
            });
        }

        renderAnnotations(true);
    }
}

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

function handleToolButtonClick(tool) {
    // Handle edit mode toggle separately
    if (tool === 'edit') {
        toggleEditMode();
        return;
    }

    // Use the new DrawingHandler system
    if (window.DrawingHandler) {
        window.DrawingHandler.activate(tool);
    }

    // Update tool button UI (excluding edit mode button)
    document.querySelectorAll('[data-tool]:not([data-tool="edit"])').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Show status message
    const toolName = window.getTypeDisplayName?.(tool) || tool;
    showMessage(`${toolName} tool selected - click on image to annotate`, 'info');
}

function toggleEditMode() {
    const editBtn = document.getElementById('editModeBtn');
    const isActive = editBtn?.classList.contains('active');

    if (isActive) {
        // Turn off edit mode
        editBtn?.classList.remove('active');
        window.editModeEnabled = false;
        if (window.EditingHandler) {
            window.EditingHandler.disable();
        }
        showMessage('Edit mode OFF - annotations are locked', 'info');
    } else {
        // Turn on edit mode
        editBtn?.classList.add('active');
        window.editModeEnabled = true;
        if (window.EditingHandler) {
            window.EditingHandler.enable();
        }
        showMessage('Edit mode ON - click annotations to select and drag to move', 'info');
    }
}

function setupEventListeners() {
    // Tool buttons - use new handler system
    const toolButtons = document.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            handleToolButtonClick(tool);
        });
    });

    // Zoom controls
    DOM.zoomIn.addEventListener('click', zoomIn);
    DOM.zoomOut.addEventListener('click', zoomOut);
    DOM.resetView.addEventListener('click', resetView);

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('nextUnannotatedBtn').addEventListener('click', nextUnannotatedImage);

    // Actions dropdown toggle
    const actionsDropdown = document.getElementById('actionsDropdown');
    if (actionsDropdown) {
        const trigger = actionsDropdown.querySelector('.actions-dropdown-trigger');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                actionsDropdown.classList.toggle('open');
            });
        }
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!actionsDropdown.contains(e.target)) {
                actionsDropdown.classList.remove('open');
            }
        });
        // Close dropdown when clicking a menu item
        const menuItems = actionsDropdown.querySelectorAll('.actions-dropdown-item');
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                actionsDropdown.classList.remove('open');
            });
        });
    }

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
        } else if (e.key === 'e' || e.key === 'E') {
            // Toggle edit mode with 'E' key (unless typing in input)
            if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                toggleEditMode();
            }
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

function initializeApp() {
    // Guard against multiple initialization
    if (_appInitialized) {
        console.warn('[Initialization] App already initialized, skipping');
        return;
    }

    try {
        console.log('[Initialization] Starting initialization...');

        // Initialize edit mode as disabled (user must toggle the Edit button)
        window.editModeEnabled = false;

        // Log available globals for debugging
        console.log('[Initialization] Globals check:', {
            viewport: typeof window.viewport,
            AnnotationStore: typeof window.AnnotationStore,
            AnnotationState: typeof window.AnnotationState,
            AppStore: typeof window.AppStore,
            STATE: typeof window.STATE,
            Store: typeof window.Store,
            DOM: typeof window.DOM,
            annotationRenderer: typeof window.annotationRenderer,
            DrawingHandler: typeof window.DrawingHandler,
            EditingHandler: typeof window.EditingHandler,
            LabelSelector: typeof window.LabelSelector,
        });

        // Verify viewport exists and is properly linked
        if (typeof viewport === 'undefined' || !viewport) {
            console.error('[Initialization] viewport is not defined!');
            throw new Error('viewport is not defined');
        }
        console.log('[Initialization] viewport object:', viewport);

        // Parse template data
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
                console.log('[Initialization] Template data loaded:', {
                    annotationCount: Object.keys(templateData.currentAnnotations || {}).length,
                    landmarksCount: (templateData.landmarksData || []).length,
                    patientId: templateData.patientId,
                    imageName: templateData.imageName
                });
            } catch (e) {
                console.error('[Initialization] Error parsing template data:', e);
            }
        } else {
            console.warn('[Initialization] No template-data element found');
        }

        // Link viewport to globals (deprecated but kept for compatibility)
        if (typeof linkViewportToGlobals === 'function') {
            console.log('[Initialization] Calling linkViewportToGlobals...');
            linkViewportToGlobals();
        }

        // Setup reactive rendering (subscribes to AppStore state changes)
        if (typeof setupReactiveRendering === 'function') {
            console.log('[Initialization] Setting up reactive rendering...');
            setupReactiveRendering();
            console.log('[Initialization] Reactive rendering setup complete');
        } else {
            console.warn('[Initialization] setupReactiveRendering not available');
        }

        // Setup figure event delegation if available
        if (typeof setupFigureEventDelegation === 'function') {
            console.log('[Initialization] Setting up figure event delegation...');
            setupFigureEventDelegation();
        }

        if (typeof setupLabelListEventDelegation === 'function') {
            console.log('[Initialization] Setting up label list event delegation...');
            setupLabelListEventDelegation();
        }

        // Load annotations into state
        if (STATE) {
            STATE.annotations = window.currentAnnotations || {};
            console.log('[Initialization] Loaded', Object.keys(STATE.annotations).length, 'annotations into STATE');
        } else {
            console.error('[Initialization] STATE is not available!');
        }

        loadFigureLabelsFromAnnotations();
        console.log('[Initialization] Labels loaded:', STATE?.allLabels?.length || 0, 'labels');

        initializeVisibilityToggles();
        console.log('[Initialization] Visibility toggles initialized');

        setupEventListeners();
        console.log('[Initialization] Event listeners attached');

        if (typeof saveToHistory === 'function') {
            saveToHistory();
            console.log('[Initialization] Initial state saved to history');
        }

        // Initialize new annotation system modules
        console.log('[Initialization] Initializing new annotation system...');
        initializeNewAnnotationSystem();

        // Initialize LabelPopup (legacy fallback)
        if (typeof LabelPopup !== 'undefined') {
            LabelPopup.init();
            console.log('[Initialization] LabelPopup initialized');
        }

        // Handle image loading
        if (DOM.img && DOM.img.complete) {
            console.log('[Initialization] Image already loaded, dimensions:', DOM.img.naturalWidth, 'x', DOM.img.naturalHeight);
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
            console.log('[Initialization] Mode display updated');
        }

        // Set initial tool to point
        const initialTool = 'point';
        if (window.DrawingHandler) {
            setTimeout(() => {
                try {
                    console.log('[Initialization] Setting initial tool to:', initialTool);
                    handleToolButtonClick(initialTool);
                } catch (e) {
                    console.error('[Initialization] Error setting initial tool:', e);
                }
            }, 100);
        }

        // Mark initialization complete
        _appInitialized = true;
        console.log('[Initialization] Complete - application ready');
    } catch (error) {
        console.error('[Initialization] Fatal error:', error);
        console.error('[Initialization] Error stack:', error.stack);

        // Reset flag on error to allow retry
        _appInitialized = false;

        if (DOM.loadingOverlay) {
            DOM.loadingOverlay.style.display = 'none';
        }
        if (typeof showMessage === 'function') {
            showMessage('Failed to initialize application: ' + error.message, 'error');
        }
    }
}

function initializeNewAnnotationSystem() {
    // Guard against multiple initialization
    if (_annotationSystemInitialized) {
        console.warn('[Initialization] Annotation system already initialized, skipping');
        return;
    }

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

            // Reattach EditingHandler listeners to SVG now that it exists
            if (window.EditingHandler?.reattachSVGListeners) {
                window.EditingHandler.reattachSVGListeners();
            }
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
                if (SYNC_EVENTS.includes(event)) {
                    if (STATE) {
                        STATE.annotations = { ...window.AnnotationState.annotations };
                    }
                }

                // Trigger render on relevant events
                if (RENDER_EVENTS.includes(event)) {
                    renderAnnotations(true);
                }
            });
            console.log('[Initialization] AnnotationState subscription established');
        }

        // Mark annotation system initialization complete
        _annotationSystemInitialized = true;
        console.log('[Initialization] New annotation system ready');
    } catch (error) {
        console.error('[Initialization] Error initializing new annotation system:', error);

        // Reset flag on error to allow retry
        _annotationSystemInitialized = false;

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
