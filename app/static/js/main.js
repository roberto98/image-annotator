/**
 * Main application entry point for the annotation system
 * @module main
 * 
 * This module coordinates initialization of all annotation modules
 * and provides the primary application lifecycle management.
 */

const App = {
    // ========================================================================
    // Configuration
    // ========================================================================

    /**
     * Whether the app has been initialized
     * @type {boolean}
     */
    initialized: false,

    /**
     * Debug mode flag
     * @type {boolean}
     */
    debug: false,

    // ========================================================================
    // Main Initialization
    // ========================================================================

    /**
     * Initialize the application
     * Called automatically when DOM is ready
     */
    async init() {
        // Prevent double initialization
        if (this.initialized) {
            Debug.log('App', 'Already initialized');
            return;
        }

        // Wait for DOM if needed
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
            return;
        }

        Debug.log('App', 'Starting initialization...');

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
            Debug.log('App', 'Initialization complete');

        } catch (error) {
            Debug.error('App', 'Initialization failed:', error);
            window.showMessage?.('Failed to initialize application', 'error');
        }
    },

    // ========================================================================
    // State Initialization
    // ========================================================================

    /**
     * Initialize state management
     */
    async initState() {
        Debug.log('App', 'Initializing state...');

        // Get patient/image info from template data or globals
        const patientId = window.patientId || window.__APP_CONFIG__?.patientId;
        const imageName = window.imageName || window.__APP_CONFIG__?.imageName;

        // Initialize AnnotationState with context
        if (window.AnnotationState) {
            window.AnnotationState.init({
                patientId,
                imageName,
                annotations: window.currentAnnotations || {},
                labels: window.landmarksData || []
            });

            // Sync image dimensions when available
            const img = document.getElementById('annotationImage');
            if (img) {
                if (img.complete && img.naturalWidth > 0) {
                    window.AnnotationState.imageWidth = img.naturalWidth;
                    window.AnnotationState.imageHeight = img.naturalHeight;
                } else {
                    img.addEventListener('load', () => {
                        window.AnnotationState.imageWidth = img.naturalWidth;
                        window.AnnotationState.imageHeight = img.naturalHeight;
                    });
                }
            }
        }

        // Subscribe to state changes for auto-rendering
        if (window.AnnotationState?.subscribe) {
            window.AnnotationState.subscribe((event, data) => {
                if (this.debug) {
                    Debug.log('App', 'State event:', event, data);
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

    // ========================================================================
    // UI Initialization
    // ========================================================================

    /**
     * Initialize UI components
     */
    initUI() {
        Debug.log('App', 'Initializing UI components...');

        // Get container
        const container = document.getElementById('imageContainer') ||
            document.getElementById('imageWrapper')?.parentElement;

        // Initialize annotation renderer (use singleton instance)
        if (window.annotationRenderer && container) {
            window.annotationRenderer.init(container, window.viewport);
            Debug.log('App', 'AnnotationRenderer initialized');
        }

        // Initialize label selector
        if (window.LabelSelector) {
            window.LabelSelector.init();
            Debug.log('App', 'LabelSelector initialized');
        }

        // Initialize drawing handler
        if (window.DrawingHandler) {
            window.DrawingHandler.init();
            Debug.log('App', 'DrawingHandler initialized');
        }

        // Initialize editing handler
        if (window.EditingHandler) {
            window.EditingHandler.init();
            Debug.log('App', 'EditingHandler initialized');
        }
    },

    // ========================================================================
    // Data Loading
    // ========================================================================

    /**
     * Load annotations from the API
     */
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
                    Debug.warn('App', 'Failed to load labels:', labelError);
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
                        Debug.warn('App', 'Failed to load annotations:', annoError);
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
                        Debug.warn('App', 'Failed to load calibration:', calError);
                    }
                }
            }

            Debug.log('App', 'Annotations loaded successfully');

        } catch (error) {
            Debug.error('App', 'Failed to load annotations:', error);
            // Don't throw - template data provides fallback
        }
    },

    // ========================================================================
    // Event Handlers
    // ========================================================================

    /**
     * Setup application event handlers
     */
    setupEventHandlers() {
        Debug.log('App', 'Setting up event handlers...');

        // Tool button event handlers
        this.setupToolButtons();

        // Mode toggle
        this.setupModeToggle();

        // Keyboard shortcuts for tools
        this.setupKeyboardShortcuts();
    },

    /**
     * Setup tool button click handlers
     */
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

    /**
     * Setup mode toggle handler
     */
    setupModeToggle() {
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) {
            modeIndicator.addEventListener('click', () => this.toggleMode());
        }
    },

    /**
     * Setup keyboard shortcuts
     */
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
                    '7': 'freehand',
                    't': 'tag',
                    'p': 'point',
                    'l': 'line',
                    'c': 'circle',
                    'r': 'rectangle',
                    'a': 'angle',
                    'g': 'polygon',
                    'f': 'freehand'
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

    // ========================================================================
    // Tool Selection
    // ========================================================================

    /**
     * Select a drawing tool
     * @param {string} tool - Tool name (from AnnotationType)
     */
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

    /**
     * Get currently selected tool
     * @returns {string|null}
     */
    getCurrentTool() {
        return window.AnnotationState?.currentTool ||
            window.STATE?.currentTool ||
            null;
    },

    // ========================================================================
    // Mode Management
    // ========================================================================

    /**
     * Toggle between annotation mode and pan/navigation mode
     */
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

        // Update mode indicator UI
        this.updateModeDisplay();

        // Show feedback
        const isAnnotationMode = window.AnnotationState?.isAnnotationMode ??
            window.STATE?.isAnnotationMode ?? true;
        const modeName = isAnnotationMode ? 'Annotation' : 'Navigation';
        window.showMessage?.(`${modeName} mode`, 'info', 1000);
    },

    /**
     * Update mode indicator display
     */
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

    // ========================================================================
    // Rendering
    // ========================================================================

    /**
     * Trigger a render of all annotations
     */
    render() {
        // Use new renderer singleton if available
        if (window.annotationRenderer?.render) {
            const annotations = window.AnnotationState?.annotations || window.STATE?.annotations || {};
            const calibration = window.AnnotationState?.calibration?.pixelsPerMm || null;
            window.annotationRenderer.render(annotations, calibration);
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

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Get current annotations
     * @returns {Object}
     */
    getAnnotations() {
        return window.AnnotationState?.annotations ||
            window.STATE?.annotations ||
            {};
    },

    /**
     * Save all annotations to the server
     */
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

// ============================================================================
// Export and Auto-Initialize
// ============================================================================

// Export to window
window.App = App;

// Note: Auto-initialization is handled by initialization.js which calls
// initializeNewAnnotationSystem(). This file provides the App object and 
// additional utility methods but defers to the main initialization flow.
// 
// If you need to use App.init() directly (e.g., in a SPA context), you can
// call it manually after DOMContentLoaded.
