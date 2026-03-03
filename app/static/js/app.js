/**
 * Main application entry point for the annotation system
 * @module main
 */

const App = {
    initialized: false,
    _initializing: false,
    _errorCount: 0,
    _maxErrors: 5,
    _dependencies: {
        state: null,
        viewport: null,
        renderer: null,
        api: null,
        debug: null
    },

    _getDependency(key, resolver) {
        if (!this._dependencies[key]) {
            this._dependencies[key] = resolver();
        }
        return this._dependencies[key];
    },

    get state() {
        return this._getDependency('state', () => window.AnnotationState);
    },

    get viewport() {
        return this._getDependency('viewport', () => window.viewport);
    },

    get renderer() {
        return this._getDependency('renderer', () => window.annotationRenderer);
    },

    get api() {
        return this._getDependency('api', () => window.AnnotationAPI);
    },

    get debug() {
        return this._getDependency('debug', () => window.Debug || console);
    },

    async init() {
        // Prevent double initialization
        if (this.initialized) {
            Debug.log('App', 'Already initialized');
            return;
        }

        // Prevent concurrent initialization attempts
        if (this._initializing) {
            Debug.warn('App', 'Initialization already in progress');
            return;
        }

        // Wait for DOM if needed
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
            return;
        }

        this._initializing = true;
        this.debug.log('App', 'Starting initialization...');

        try {
            // Initialize state management
            await this.initState();

            // Initialize UI components
            this.initUI();

            // Load initial data from API
            await this.loadAnnotations();

            // Setup event handlers
            this.setupEventHandlers();

            // Initial render
            this.render();

            this.initialized = true;
            this.debug.log('App', 'Initialization complete');

        } catch (error) {
            this.debug.error('App', 'Initialization failed:', error);
            window.showMessage?.('Failed to initialize application', 'error');
            throw error;
        } finally {
            this._initializing = false;
        }
    },

    async initState() {
        this.debug.log('App', 'Initializing state...');

        // Get patient/image info from template data or globals
        const patientId = window.patientId;
        const imageName = window.imageName;

        // Initialize state with context
        if (this.state?.init) {
            this.state.init({
                patientId,
                imageName,
                annotations: window.currentAnnotations || {},
                labels: window.landmarksData || []
            });

            // Sync image dimensions when available
            const img = document.getElementById('annotationImage');
            if (img) {
                if (img.complete && img.naturalWidth > 0) {
                    this.state.imageWidth = img.naturalWidth;
                    this.state.imageHeight = img.naturalHeight;
                } else {
                    img.addEventListener('load', () => {
                        this.state.imageWidth = img.naturalWidth;
                        this.state.imageHeight = img.naturalHeight;
                    });
                }
            }
        }

        // Subscribe to state changes for auto-rendering
        if (this.state?.subscribe) {
            this.state.subscribe((event, data) => {
                if (this.debug) {
                    this.debug.log('App', 'State event:', event, data);
                }

                // Auto-render on relevant state changes
                const renderEvents = [
                    'annotationSet', 'annotationRemoved', 'annotationsLoaded',
                    'visibilityToggled', 'visibilitySet', 'visibilityShowAll', 'visibilityHideAll',
                    'undo', 'redo', 'pendingCleared', 'drawingStarted'
                ];

                if (renderEvents.includes(event)) {
                    this.render();
                }
            });
        }
    },

    initUI() {
        this.debug.log('App', 'Initializing UI components...');

        // Get container
        const container = document.getElementById('imageContainer') ||
            document.getElementById('imageWrapper')?.parentElement;

        // Initialize annotation renderer
        if (this.renderer && container) {
            this.renderer.init(container, this.viewport);
            this.debug.log('App', 'AnnotationRenderer initialized');

            // Reattach EditingHandler listeners to SVG now that it exists
            if (window.EditingHandler?.reattachSVGListeners) {
                window.EditingHandler.reattachSVGListeners();
            }
        }

        // Initialize label selector
        if (window.LabelSelector) {
            window.LabelSelector.init();
            this.debug.log('App', 'LabelSelector initialized');
        }

        // Initialize drawing handler
        if (window.DrawingHandler) {
            window.DrawingHandler.init();
            this.debug.log('App', 'DrawingHandler initialized');
        }

        // Initialize editing handler
        if (window.EditingHandler) {
            window.EditingHandler.init();
            this.debug.log('App', 'EditingHandler initialized');
        }
    },

    async loadAnnotations() {
        Debug.log('App', 'Loading annotations...');

        const patientId = window.patientId;
        const imageName = window.imageName;

        if (!patientId || !imageName) {
            Debug.warn('App', 'Missing patient ID or image name, skipping API load');
            return;
        }

        try {
            // Load labels if available
            if (window.AnnotationAPI?.getLabels) {
                try {
                    const labels = await window.AnnotationAPI.getLabels();
                    if (labels && window.AnnotationState) {
                        window.AnnotationState.setLabels(labels);
                    }
                } catch (labelError) {
                    this._errorCount++;
                    Debug.warn('App', 'Failed to load labels:', labelError);
                    window.showMessage?.('Failed to load labels from server, using cached data', 'warning');
                    // Continue anyway - we have fallback labels from template
                }
            }

            // Load annotations
            if (window.AnnotationAPI?.getAnnotations) {
                try {
                    const annotations = await window.AnnotationAPI.getAnnotations(patientId, imageName);
                    if (annotations && window.AnnotationState) {
                        // Don't replace if we already have annotations from template
                        if (Object.keys(window.AnnotationState.annotations).length === 0) {
                            window.AnnotationState.setAllAnnotations(annotations);
                        }
                    }
                } catch (annoError) {
                    // 404 is expected for new images
                    if (annoError.status !== 404) {
                        this._errorCount++;
                        Debug.warn('App', 'Failed to load annotations:', annoError);
                        window.showMessage?.('Failed to load annotations from server', 'warning');
                    }
                }
            }

            // Load calibration
            if (window.AnnotationAPI?.getCalibration) {
                try {
                    const calibration = await window.AnnotationAPI.getCalibration(patientId, imageName);
                    if (calibration?.pixelsPerMm && window.AnnotationState) {
                        window.AnnotationState.setCalibration(calibration.pixelsPerMm, calibration);
                    }
                } catch (calError) {
                    // 404 is expected if no calibration set
                    if (calError.status !== 404) {
                        this._errorCount++;
                        Debug.warn('App', 'Failed to load calibration:', calError);
                        window.showMessage?.('Failed to load calibration data', 'warning');
                    }
                }
            }

            Debug.log('App', 'Annotations loaded successfully');

        } catch (error) {
            this._errorCount++;
            Debug.error('App', 'Failed to load annotations:', error);
            window.showMessage?.('Error loading data from server', 'error');

            // Check if too many errors occurred
            if (this._errorCount >= this._maxErrors) {
                throw new Error(`Too many errors during initialization (${this._errorCount})`);
            }
            // Don't throw - template data provides fallback
        }
    },

    setupEventHandlers() {
        Debug.log('App', 'Setting up event handlers...');

        // Tool button event handlers
        this.setupToolButtons();

        // Mode toggle
        this.setupModeToggle();

        // Keyboard shortcuts for tools
        this.setupKeyboardShortcuts();
    },

    setupToolButtons() {
        // Find all tool buttons with data-tool attribute
        const toolButtons = document.querySelectorAll('[data-tool]');

        toolButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                this.selectTool(tool);
            });
        });

        Debug.log('App', `Attached handlers to ${toolButtons.length} tool buttons`);
    },

    setupModeToggle() {
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) {
            modeIndicator.addEventListener('click', () => this.toggleMode());
        }
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Skip if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Skip if popup is open
            if (window.LabelSelector?.isOpen || window.LabelPopup?.isOpen) return;

            // Tool shortcuts (only when no modifiers)
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                const shortcuts = {
                    '1': 'point',
                    '2': 'line',
                    '3': 'circle',
                    '4': 'rectangle',
                    '5': 'angle',
                    '6': 'polygon',
                    'p': 'point',
                    'l': 'line',
                    'c': 'circle',
                    'r': 'rectangle',
                    'a': 'angle',
                    'g': 'polygon'
                };

                const tool = shortcuts[e.key.toLowerCase()];
                if (tool) {
                    e.preventDefault();
                    this.selectTool(tool);
                }
            }

            // Mode toggle with Space
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
                // Only toggle if not drawing
                if (!window.DrawingHandler?.isDrawingInProgress?.()) {
                    e.preventDefault();
                    this.toggleMode();
                }
            }
        });
    },

    selectTool(tool) {
        Debug.log('App', 'Selecting tool:', tool);

        // Update button UI
        document.querySelectorAll('[data-tool]').forEach(btn => {
            const isActive = btn.dataset.tool === tool;
            btn.classList.toggle('active', isActive);
        });

        // Activate drawing handler with the selected tool
        if (window.DrawingHandler) {
            window.DrawingHandler.activate(tool);
        }

        // Show feedback
        const toolName = window.getTypeDisplayName?.(tool) || tool;
        window.showMessage?.(`${toolName} tool selected`, 'info', 1000);
    },

    getCurrentTool() {
        return window.AnnotationState?.currentTool || null;
    },

    toggleMode() {
        // Delegate to the global toggleMode defined in utilities.js
        if (typeof window.toggleMode === 'function') {
            window.toggleMode();
        }
    },

    updateModeDisplay() {
        // Delegate to the global updateModeDisplay defined in utilities.js
        if (typeof window.updateModeDisplay === 'function') {
            window.updateModeDisplay();
        }
    },

    render() {
        // Use new renderer if available
        if (this.renderer?.render) {
            const annotations = this.state?.annotations || {};
            const calibration = this.state?.calibration?.pixelsPerMm || null;
            this.renderer.render(annotations, calibration);
            return;
        }

        // Fallback to legacy render
        if (typeof window.renderAnnotations === 'function') {
            window.renderAnnotations();
            return;
        }

        // Fallback to scheduled render
        if (typeof window.scheduleRender === 'function') {
            window.scheduleRender();
        }
    },

    getAnnotations() {
        return window.AnnotationState?.annotations || {};
    },

    async saveAll() {
        const patientId = window.patientId || window.AnnotationState?.patientId;
        const imageName = window.imageName || window.AnnotationState?.imageName;
        const annotations = this.getAnnotations();

        if (!patientId || !imageName) {
            window.showMessage?.('Missing patient or image info', 'error');
            return;
        }

        try {
            await window.AnnotationAPI?.batchSaveAnnotations(patientId, imageName, annotations);
            window.showMessage?.('All annotations saved', 'success');
        } catch (error) {
            Debug.error('App', 'Failed to save annotations:', error);
            window.showMessage?.('Failed to save annotations', 'error');
        }
    }
};

window.App = App;

// ============================================================================
// Annotation Operations (migrated from annotation_manager.js)
// ============================================================================

let _isSaving = false;

async function markOccluded(name) {
    if (_isSaving) { window.showMessage?.('Save operation in progress...', 'info'); return; }

    const labelValidation = window.validateLabelName?.(name);
    if (labelValidation && !labelValidation.valid) {
        window.showMessage?.(labelValidation.error, 'error');
        return;
    }

    _isSaving = true;
    try {
        const existing = window.AnnotationState?.annotations?.[name] || {};
        await window.AnnotationAPI.saveAnnotation(
            window.patientId, window.imageName,
            name, existing.type || 'point', existing.data || {},
            { status: 'occluded' }
        );
        if (window.AnnotationState?.setAnnotation) {
            window.AnnotationState.setAnnotation(name, { ...existing, status: 'occluded' });
        }
        window.saveToHistory?.();
        window.showMessage?.(window.formatSuccessMessage?.('Marked', name, 'occluded') ?? `Marked ${name} occluded`, 'success');
    } catch (error) {
        console.error('Error:', error);
        window.showMessage?.(window.formatErrorMessage?.('mark', 'annotation as occluded', error) ?? 'Failed to mark occluded', 'error');
    } finally {
        _isSaving = false;
    }
}

async function annotateLandmark(coords) {
    if (_isSaving) { window.showMessage?.('Save operation in progress...', 'info'); return; }

    const selectedLabel = window.AnnotationState?.selectedAnnotation;
    if (!selectedLabel) {
        window.showMessage?.('Please select a label first', 'warning');
        return;
    }

    const labelValidation = window.validateLabelName?.(selectedLabel);
    if (labelValidation && !labelValidation.valid) {
        window.showMessage?.(labelValidation.error, 'error');
        return;
    }

    const validation = window.validateCoordinates?.(coords);
    if (validation && !validation.valid) {
        window.showMessage?.(validation.error, 'error');
        return;
    }

    _isSaving = true;
    try {
        await window.AnnotationAPI.saveAnnotation(
            window.patientId, window.imageName,
            selectedLabel, 'point', { x: coords.x, y: coords.y }
        );
        if (window.AnnotationState?.setAnnotation) {
            window.AnnotationState.setAnnotation(selectedLabel, {
                type: 'point', status: 'ok', data: { x: coords.x, y: coords.y }
            });
        }
        window.saveToHistory?.();
        window.showMessage?.(window.formatSuccessMessage?.('Annotated', selectedLabel) ?? `Annotated ${selectedLabel}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        window.showMessage?.(window.formatErrorMessage?.('save', 'annotation', error) ?? 'Failed to save', 'error');
    } finally {
        _isSaving = false;
    }
}

async function nextUnannotatedImage() {
    try {
        const params = new URLSearchParams({
            current_patient: window.patientId,
            current_image: window.imageName
        });
        const response = await fetch(`/api/next-unannotated?${params.toString()}`);
        const data = await response.json();
        if (data.patient && data.image) {
            window.location.href = `/annotate/${encodeURIComponent(data.patient)}/${encodeURIComponent(data.image)}`;
        } else {
            window.showMessage?.('No more unannotated images found', 'info');
        }
    } catch (error) {
        console.error('Error finding next unannotated image:', error);
        window.showMessage?.(window.formatErrorMessage?.('find', 'next image', error) ?? 'Failed to find next image', 'error');
    }
}

async function deleteAnnotation(name) {
    if (_isSaving) { window.showMessage?.('Save operation in progress...', 'info'); return; }

    const labelValidation = window.validateLabelName?.(name);
    if (labelValidation && !labelValidation.valid) {
        window.showMessage?.(labelValidation.error, 'error');
        return;
    }

    _isSaving = true;
    try {
        await window.AnnotationAPI.deleteAnnotation(window.patientId, window.imageName, name);

        if (window.AnnotationState?.selectedAnnotation === name) {
            window.AnnotationState.selectedAnnotation = null;
        }
        window.AnnotationState?.removeAnnotation(name);
        window.saveToHistory?.();
        window.forceRender?.();
        window.showMessage?.(window.formatSuccessMessage?.('Deleted', `annotation for ${name}`) ?? `Deleted ${name}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        window.showMessage?.(window.formatErrorMessage?.('delete', 'annotation', error) ?? 'Failed to delete', 'error');
    } finally {
        _isSaving = false;
    }
}

window.markOccluded = markOccluded;
window.annotateLandmark = annotateLandmark;
window.nextUnannotatedImage = nextUnannotatedImage;
window.deleteAnnotation = deleteAnnotation;
