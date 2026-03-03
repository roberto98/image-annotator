/**
 * Application initialization and setup
 * @module initialization
 */

let _appInitialized = false;
let _annotationSystemInitialized = false;


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
    const annotations = window.AnnotationState?.annotations || window.currentAnnotations || {};
    Object.entries(annotations).forEach(([name, data]) => {
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

    const allLabels = Array.from(labelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (window.AnnotationState) {
        window.AnnotationState.labels = allLabels;
    }
}

function initializeVisibilityToggles() {
    const labels = window.AnnotationState?.labels || [];
    const toggles = {};
    labels.forEach(label => {
        toggles[label.name] = true;
    });
    if (window.AnnotationState) {
        window.AnnotationState.visibilityToggles = toggles;
    }
}

function handleImageLoad() {
    const imgW = DOM.img.naturalWidth;
    const imgH = DOM.img.naturalHeight;

    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = 'none';
    }

    if (DOM.imageWrapper) {
        DOM.imageWrapper.style.width = `${imgW}px`;
        DOM.imageWrapper.style.height = `${imgH}px`;
    }

    // Update viewport and state with image dimensions
    if (window.viewport?.setImageSize) {
        window.viewport.setImageSize(imgW, imgH);
    }
    if (window.annotationRenderer) {
        window.annotationRenderer.setImageSize(imgW, imgH);
    }
    if (window.AnnotationState) {
        window.AnnotationState.imageWidth = imgW;
        window.AnnotationState.imageHeight = imgH;
    }

    if (typeof resetView === 'function') {
        resetView();
    }

    // Pre-assign colors for all existing annotations, then render
    const annotations = window.AnnotationState?.annotations || {};
    if (window.getColorForLabel) {
        Object.keys(annotations).forEach(name => window.getColorForLabel(name));
    }
    renderAnnotations(true);
}

function handleImageError(e) {
    console.error('[Initialization] Failed to load image:', e);
    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = 'none';
    }
    if (typeof showMessage === 'function') {
        showMessage('Failed to load image', 'error');
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
        const value = parseInt(e.target.value);
        window.setBrightness?.(value);
        document.getElementById('brightnessValue').textContent = value + '%';
    });
    document.getElementById('contrastSlider').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        window.setContrast?.(value);
        document.getElementById('contrastValue').textContent = value + '%';
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

    // Polygon tools
    if (DOM.drawPolyBtn) {
        DOM.drawPolyBtn.addEventListener('click', () => handleToolButtonClick('polygon'));
    }
    if (DOM.editPolyBtn) {
        DOM.editPolyBtn.addEventListener('click', () => {
            // Note: editing is handled by EditingHandler in new system
        });
    }
    if (DOM.movePolyBtn) {
        DOM.movePolyBtn.addEventListener('click', () => {
            // Note: moving is handled by EditingHandler in new system
        });
    }
    if (DOM.completePolyBtn) {
        DOM.completePolyBtn.addEventListener('click', () => {
            if (window.DrawingHandler?.isDrawingInProgress?.()) {
                window.DrawingHandler.completeAnnotation();
            }
        });
    }
    if (DOM.cancelPolyBtn) {
        DOM.cancelPolyBtn.addEventListener('click', () => {
            window.DrawingHandler?.cancelDrawing?.();
        });
    }
}

function initializeApp() {
    // Guard against multiple initialization
    if (_appInitialized) {
        return;
    }

    try {
        // Initialize edit mode as disabled (user must toggle the Edit button)
        window.editModeEnabled = false;

        // Verify viewport exists and is properly linked
        if (typeof viewport === 'undefined' || !viewport) {
            console.error('[Initialization] viewport is not defined!');
            throw new Error('viewport is not defined');
        }

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
            } catch (e) {
                console.error('[Initialization] Error parsing template data:', e);
            }
        } else {
            console.warn('[Initialization] No template-data element found');
        }

        // Setup reactive rendering (subscribes to AnnotationState events)
        if (typeof setupReactiveRendering === 'function') {
            setupReactiveRendering();
        }

        if (typeof setupLabelListEventDelegation === 'function') {
            setupLabelListEventDelegation();
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
            handleImageLoad();
        } else if (DOM.img) {
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

        // Mark initialization complete
        _appInitialized = true;
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
        return;
    }

    try {
        // Initialize AnnotationState with context
        if (window.AnnotationState) {
            window.AnnotationState.init({
                patientId: window.patientId,
                imageName: window.imageName,
                annotations: window.currentAnnotations || {},
                labels: window.AnnotationState.labels || []
            });
        }

        // Initialize AnnotationRenderer (use singleton instance)
        if (window.annotationRenderer && DOM.imageContainer) {
            window.annotationRenderer.init(DOM.imageContainer, window.viewport, {
                showMeasurements: true,
                showHandles: true,
                showLabels: true
            });

            // Reattach EditingHandler listeners to SVG now that it exists
            if (window.EditingHandler?.reattachSVGListeners) {
                window.EditingHandler.reattachSVGListeners();
            }
        }

        // Initialize LabelSelector
        if (window.LabelSelector) {
            window.LabelSelector.init();
        }

        // Initialize DrawingHandler
        if (window.DrawingHandler) {
            window.DrawingHandler.init();
        }

        // Initialize EditingHandler
        if (window.EditingHandler) {
            window.EditingHandler.init();
        }

        // Mark annotation system initialization complete
        _annotationSystemInitialized = true;
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
