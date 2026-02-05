/**
 * Main application entry point for the annotation system
 * @module main
 */

const App = {
    initialized: false,
    _initializing: false,
    debug: false,
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
        return this._getDependency('state', () => window.AnnotationState || window.STATE);
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
        const patientId = window.patientId || window.__APP_CONFIG__?.patientId;
        const imageName = window.imageName || window.__APP_CONFIG__?.imageName;

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

        const patientId = window.patientId || window.__APP_CONFIG__?.patientId;
        const imageName = window.imageName || window.__APP_CONFIG__?.imageName;

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

        // Update legacy STATE if it exists
        if (window.STATE) {
            window.STATE.currentTool = tool;
        }

        // Show feedback
        const toolName = window.getTypeDisplayName?.(tool) || tool;
        window.showMessage?.(`${toolName} tool selected`, 'info', 1000);
    },

    getCurrentTool() {
        return window.AnnotationState?.currentTool ||
            window.STATE?.currentTool ||
            null;
    },

    toggleMode() {
        // Don't toggle if drawing is in progress
        if (window.DrawingHandler?.isDrawingInProgress?.()) {
            window.showMessage?.('Cannot switch modes while drawing', 'warning');
            return;
        }

        // Update AnnotationState
        if (window.AnnotationState) {
            window.AnnotationState.isAnnotationMode = !window.AnnotationState.isAnnotationMode;
        }

        // Update legacy STATE for compatibility
        if (window.STATE) {
            window.STATE.isAnnotationMode = !window.STATE.isAnnotationMode;
        }

        // Deactivate DrawingHandler when switching to Navigation mode
        const isAnnotationMode = window.AnnotationState?.isAnnotationMode ??
            window.STATE?.isAnnotationMode ?? true;
        if (!isAnnotationMode) {
            window.DrawingHandler?.deactivate?.();
        }

        // Update mode indicator UI
        this.updateModeDisplay();

        // Show feedback
        const modeName = isAnnotationMode ? 'Annotation' : 'Navigation';
        window.showMessage?.(`${modeName} mode`, 'info', 1000);
    },

    updateModeDisplay() {
        const indicator = document.getElementById('modeIndicator');
        const container = document.getElementById('imageContainer');
        if (!indicator) return;

        const isAnnotationMode = window.AnnotationState?.isAnnotationMode ??
            window.STATE?.isAnnotationMode ?? true;

        const textEl = indicator.querySelector('span');
        const dotEl = indicator.querySelector('.mode-dot');

        if (isAnnotationMode) {
            indicator.classList.remove('panning');
            indicator.setAttribute('data-mode', 'annotation');
            indicator.setAttribute('aria-label', 'Mode toggle: Annotation Mode');
            if (textEl) textEl.textContent = 'Annotation Mode';
            if (dotEl) dotEl.style.backgroundColor = '#4ade80';
            if (container) container.style.cursor = 'crosshair';
        } else {
            indicator.classList.add('panning');
            indicator.setAttribute('data-mode', 'panning');
            indicator.setAttribute('aria-label', 'Mode toggle: Navigation Mode');
            if (textEl) textEl.textContent = 'Navigation Mode';
            if (dotEl) dotEl.style.backgroundColor = '#60a5fa';
            if (container) container.style.cursor = 'grab';
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
        return window.AnnotationState?.annotations ||
            window.STATE?.annotations ||
            {};
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
