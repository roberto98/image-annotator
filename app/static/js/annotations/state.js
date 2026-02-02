/**
 * State management for the annotation system
 * @module annotations/state
 * 
 * This module provides centralized state management for annotations,
 * including pending drawing state, tool state, and annotation data.
 */

// ============================================================================
// State Manager
// ============================================================================

/**
 * Annotation state manager
 * Manages all state related to the annotation process
 */
const AnnotationState = {
    // ========================================================================
    // Current Tool and Mode State
    // ========================================================================
    
    /**
     * Currently selected tool
     * @type {string|null}
     */
    currentTool: null,
    
    /**
     * Whether drawing is in progress
     * @type {boolean}
     */
    isDrawing: false,
    
    /**
     * Whether in pan/navigation mode vs annotation mode
     * @type {boolean}
     */
    isAnnotationMode: true,
    
    // ========================================================================
    // Pending Annotation State (in-progress drawing)
    // ========================================================================
    
    /**
     * Points collected for current annotation being drawn
     * @type {Array<{x: number, y: number}>}
     */
    pendingPoints: [],
    
    /**
     * Type of annotation currently being drawn
     * @type {string|null}
     */
    pendingType: null,
    
    /**
     * Preview element for current drawing
     * @type {HTMLElement|null}
     */
    previewElement: null,
    
    // ========================================================================
    // Selection State
    // ========================================================================
    
    /**
     * Currently selected label for annotation
     * @type {string|null}
     */
    selectedLabel: null,
    
    /**
     * Currently selected annotation for editing
     * @type {string|null}
     */
    selectedAnnotation: null,
    
    /**
     * Index of selected point within a multi-point annotation
     * @type {number}
     */
    selectedPointIndex: -1,
    
    // ========================================================================
    // Annotation Data
    // ========================================================================
    
    /**
     * All annotations on current image, keyed by label
     * @type {Object<string, Object>}
     */
    annotations: {},
    
    /**
     * Visibility toggles for each annotation
     * @type {Object<string, boolean>}
     */
    visibilityToggles: {},
    
    // ========================================================================
    // Label Data
    // ========================================================================
    
    /**
     * All available labels
     * @type {Array<{name: string, category?: string, color?: string}>}
     */
    labels: [],
    
    /**
     * Labels grouped by category
     * @type {Object<string, Array>}
     */
    labelsByCategory: {},
    
    // ========================================================================
    // Calibration
    // ========================================================================
    
    /**
     * Calibration data for current image
     * @type {{pixelsPerMm: number|null, referencePoints?: Array, referenceLengthMm?: number}}
     */
    calibration: {
        pixelsPerMm: null,
        referencePoints: null,
        referenceLengthMm: null
    },
    
    // ========================================================================
    // Image Context
    // ========================================================================
    
    /**
     * Current patient ID
     * @type {string|null}
     */
    patientId: null,
    
    /**
     * Current image name
     * @type {string|null}
     */
    imageName: null,
    
    /**
     * Natural width of current image
     * @type {number}
     */
    imageWidth: 0,
    
    /**
     * Natural height of current image
     * @type {number}
     */
    imageHeight: 0,
    
    // ========================================================================
    // Interaction State
    // ========================================================================
    
    /**
     * Whether currently dragging an annotation
     * @type {boolean}
     */
    isDragging: false,
    
    /**
     * Starting position of drag operation
     * @type {{x: number, y: number}|null}
     */
    dragStart: null,
    
    /**
     * Original position before drag started
     * @type {Object|null}
     */
    dragOriginal: null,
    
    // ========================================================================
    // History (for undo/redo)
    // ========================================================================
    
    /**
     * History stack for undo
     * @type {Array<Object>}
     */
    _history: [],
    
    /**
     * Current position in history
     * @type {number}
     */
    _historyIndex: -1,
    
    /**
     * Maximum history size
     * @type {number}
     */
    _maxHistorySize: 50,
    
    // ========================================================================
    // Event Listeners
    // ========================================================================
    
    /**
     * State change listeners
     * @type {Set<Function>}
     */
    _listeners: new Set(),
    
    // ========================================================================
    // Methods - Initialization & Reset
    // ========================================================================
    
    /**
     * Initialize state with context
     * @param {Object} context - Initial context
     * @param {string} context.patientId - Patient ID
     * @param {string} context.imageName - Image name
     * @param {Object} [context.annotations] - Initial annotations
     * @param {Array} [context.labels] - Available labels
     */
    init(context) {
        this.patientId = context.patientId || null;
        this.imageName = context.imageName || null;
        this.annotations = context.annotations || {};
        this.labels = context.labels || [];
        
        // Initialize visibility toggles for all annotations
        Object.keys(this.annotations).forEach(label => {
            if (!(label in this.visibilityToggles)) {
                this.visibilityToggles[label] = true;
            }
        });
        
        // Group labels by category
        this._groupLabelsByCategory();
        
        // Clear history
        this._history = [];
        this._historyIndex = -1;
        
        this._notify('init', { context });
    },
    
    /**
     * Reset all state to defaults
     */
    reset() {
        this.currentTool = null;
        this.isDrawing = false;
        this.isAnnotationMode = true;
        
        this.clearPending();
        
        this.selectedLabel = null;
        this.selectedAnnotation = null;
        this.selectedPointIndex = -1;
        
        this.annotations = {};
        this.visibilityToggles = {};
        this.labels = [];
        this.labelsByCategory = {};
        
        this.calibration = {
            pixelsPerMm: null,
            referencePoints: null,
            referenceLengthMm: null
        };
        
        this.patientId = null;
        this.imageName = null;
        this.imageWidth = 0;
        this.imageHeight = 0;
        
        this.isDragging = false;
        this.dragStart = null;
        this.dragOriginal = null;
        
        this._history = [];
        this._historyIndex = -1;
        
        this._notify('reset', {});
    },
    
    // ========================================================================
    // Methods - Pending Points (Drawing in Progress)
    // ========================================================================
    
    /**
     * Add a point to the pending annotation
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} New point count
     */
    addPendingPoint(x, y) {
        this.pendingPoints.push({ x, y });
        this._notify('pendingPointAdded', { x, y, count: this.pendingPoints.length });
        return this.pendingPoints.length;
    },
    
    /**
     * Update the last pending point (for preview during drawing)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    updateLastPendingPoint(x, y) {
        if (this.pendingPoints.length > 0) {
            this.pendingPoints[this.pendingPoints.length - 1] = { x, y };
            this._notify('pendingPointUpdated', { x, y });
        }
    },
    
    /**
     * Remove the last pending point
     * @returns {{x: number, y: number}|null} Removed point or null
     */
    removeLastPendingPoint() {
        const point = this.pendingPoints.pop() || null;
        this._notify('pendingPointRemoved', { point, count: this.pendingPoints.length });
        return point;
    },
    
    /**
     * Clear all pending points and drawing state
     */
    clearPending() {
        this.pendingPoints = [];
        this.pendingType = null;
        this.isDrawing = false;
        
        if (this.previewElement) {
            this.previewElement.remove();
            this.previewElement = null;
        }
        
        this._notify('pendingCleared', {});
    },
    
    /**
     * Start drawing a new annotation
     * @param {string} type - Annotation type
     */
    startDrawing(type) {
        this.clearPending();
        this.pendingType = type;
        this.isDrawing = true;
        this._notify('drawingStarted', { type });
    },
    
    /**
     * Check if enough points have been collected to complete the annotation
     * @returns {boolean}
     */
    canComplete() {
        if (!this.pendingType) return false;
        
        const required = window.ClicksRequired?.[this.pendingType] ?? -1;
        const pointCount = this.pendingPoints.length;
        
        // Tag type - no points needed
        if (required === 0) return true;
        
        // Fixed-length types
        if (required > 0) return pointCount >= required;
        
        // Variable-length types (required === -1)
        const minPoints = { polygon: 3, freehand: 2 };
        return pointCount >= (minPoints[this.pendingType] || 1);
    },
    
    /**
     * Get remaining clicks needed
     * @returns {number} Clicks remaining, or -1 for variable
     */
    clicksRemaining() {
        if (!this.pendingType) return 0;
        
        const required = window.ClicksRequired?.[this.pendingType] ?? -1;
        
        // Variable-length or no-click types
        if (required <= 0) return required;
        
        return Math.max(0, required - this.pendingPoints.length);
    },
    
    // ========================================================================
    // Methods - Annotation CRUD
    // ========================================================================
    
    /**
     * Set an annotation
     * @param {string} label - Annotation label
     * @param {Object} data - Annotation data
     * @param {boolean} [saveHistory=true] - Whether to save to history
     */
    setAnnotation(label, data, saveHistory = true) {
        if (saveHistory) {
            this._pushHistory();
        }
        
        this.annotations = {
            ...this.annotations,
            [label]: {
                ...data,
                timestamp: data.timestamp || new Date().toISOString()
            }
        };
        
        // Ensure visibility toggle exists
        if (!(label in this.visibilityToggles)) {
            this.visibilityToggles[label] = true;
        }
        
        this._notify('annotationSet', { label, data });
    },
    
    /**
     * Remove an annotation
     * @param {string} label - Annotation label to remove
     * @param {boolean} [saveHistory=true] - Whether to save to history
     * @returns {Object|null} Removed annotation or null
     */
    removeAnnotation(label, saveHistory = true) {
        if (!(label in this.annotations)) {
            return null;
        }
        
        if (saveHistory) {
            this._pushHistory();
        }
        
        const removed = this.annotations[label];
        const { [label]: _, ...rest } = this.annotations;
        this.annotations = rest;
        
        // Clear selection if this was selected
        if (this.selectedAnnotation === label) {
            this.selectedAnnotation = null;
        }
        if (this.selectedLabel === label) {
            this.selectedLabel = null;
        }
        
        this._notify('annotationRemoved', { label, data: removed });
        return removed;
    },
    
    /**
     * Get an annotation by label
     * @param {string} label - Annotation label
     * @returns {Object|null}
     */
    getAnnotation(label) {
        return this.annotations[label] || null;
    },
    
    /**
     * Check if an annotation exists
     * @param {string} label - Annotation label
     * @returns {boolean}
     */
    hasAnnotation(label) {
        return label in this.annotations;
    },
    
    /**
     * Get all annotation labels
     * @returns {Array<string>}
     */
    getAnnotationLabels() {
        return Object.keys(this.annotations);
    },
    
    /**
     * Set all annotations (bulk update)
     * @param {Object} annotations - Annotations keyed by label
     */
    setAllAnnotations(annotations) {
        this._pushHistory();
        this.annotations = { ...annotations };
        
        // Update visibility toggles
        Object.keys(annotations).forEach(label => {
            if (!(label in this.visibilityToggles)) {
                this.visibilityToggles[label] = true;
            }
        });
        
        this._notify('annotationsLoaded', { count: Object.keys(annotations).length });
    },
    
    // ========================================================================
    // Methods - Selection
    // ========================================================================
    
    /**
     * Select a label for annotation
     * @param {string|null} label - Label to select, or null to deselect
     */
    selectLabel(label) {
        this.selectedLabel = label;
        this._notify('labelSelected', { label });
    },
    
    /**
     * Select an annotation for editing
     * @param {string|null} label - Annotation label to select
     */
    selectAnnotation(label) {
        this.selectedAnnotation = label;
        this.selectedPointIndex = -1;
        this._notify('annotationSelected', { label });
    },
    
    /**
     * Select a point within a multi-point annotation
     * @param {number} index - Point index
     */
    selectPoint(index) {
        this.selectedPointIndex = index;
        this._notify('pointSelected', { index });
    },
    
    // ========================================================================
    // Methods - Visibility
    // ========================================================================
    
    /**
     * Toggle visibility of an annotation
     * @param {string} label - Annotation label
     * @returns {boolean} New visibility state
     */
    toggleVisibility(label) {
        const newState = !this.visibilityToggles[label];
        this.visibilityToggles = {
            ...this.visibilityToggles,
            [label]: newState
        };
        this._notify('visibilityToggled', { label, visible: newState });
        return newState;
    },
    
    /**
     * Set visibility for an annotation
     * @param {string} label - Annotation label
     * @param {boolean} visible - Visibility state
     */
    setVisibility(label, visible) {
        this.visibilityToggles = {
            ...this.visibilityToggles,
            [label]: visible
        };
        this._notify('visibilitySet', { label, visible });
    },
    
    /**
     * Check if an annotation is visible
     * @param {string} label - Annotation label
     * @returns {boolean}
     */
    isVisible(label) {
        return this.visibilityToggles[label] !== false;
    },
    
    /**
     * Show all annotations
     */
    showAll() {
        Object.keys(this.annotations).forEach(label => {
            this.visibilityToggles[label] = true;
        });
        this._notify('visibilityShowAll', {});
    },
    
    /**
     * Hide all annotations
     */
    hideAll() {
        Object.keys(this.annotations).forEach(label => {
            this.visibilityToggles[label] = false;
        });
        this._notify('visibilityHideAll', {});
    },
    
    // ========================================================================
    // Methods - Labels
    // ========================================================================
    
    /**
     * Set available labels
     * @param {Array} labels - Array of label objects
     */
    setLabels(labels) {
        this.labels = labels;
        this._groupLabelsByCategory();
        this._notify('labelsUpdated', { labels });
    },
    
    /**
     * Add a new label
     * @param {Object} label - Label object
     */
    addLabel(label) {
        this.labels = [...this.labels, label].sort((a, b) => 
            a.name.localeCompare(b.name)
        );
        this._groupLabelsByCategory();
        this._notify('labelAdded', { label });
    },
    
    /**
     * Group labels by category
     * @private
     */
    _groupLabelsByCategory() {
        this.labelsByCategory = {};
        this.labels.forEach(label => {
            const category = label.category || 'default';
            if (!this.labelsByCategory[category]) {
                this.labelsByCategory[category] = [];
            }
            this.labelsByCategory[category].push(label);
        });
    },
    
    // ========================================================================
    // Methods - Calibration
    // ========================================================================
    
    /**
     * Set calibration data
     * @param {number} pixelsPerMm - Pixels per millimeter
     * @param {Object} [options] - Additional calibration data
     */
    setCalibration(pixelsPerMm, options = {}) {
        this.calibration = {
            pixelsPerMm,
            referencePoints: options.referencePoints || null,
            referenceLengthMm: options.referenceLengthMm || null
        };
        this._notify('calibrationSet', { pixelsPerMm });
    },
    
    /**
     * Clear calibration data
     */
    clearCalibration() {
        this.calibration = {
            pixelsPerMm: null,
            referencePoints: null,
            referenceLengthMm: null
        };
        this._notify('calibrationCleared', {});
    },
    
    /**
     * Check if calibration is set
     * @returns {boolean}
     */
    hasCalibration() {
        return this.calibration.pixelsPerMm !== null;
    },
    
    // ========================================================================
    // Methods - History (Undo/Redo)
    // ========================================================================
    
    /**
     * Push current state to history
     * @private
     */
    _pushHistory() {
        // Remove any redo entries
        if (this._historyIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._historyIndex + 1);
        }
        
        // Push current state
        this._history.push({
            annotations: JSON.parse(JSON.stringify(this.annotations)),
            timestamp: Date.now()
        });
        this._historyIndex = this._history.length - 1;
        
        // Trim if too long
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
            this._historyIndex--;
        }
    },
    
    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this._historyIndex > 0;
    },
    
    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this._historyIndex < this._history.length - 1;
    },
    
    /**
     * Undo last change
     * @returns {boolean} Success
     */
    undo() {
        if (!this.canUndo()) return false;
        
        this._historyIndex--;
        this.annotations = JSON.parse(JSON.stringify(this._history[this._historyIndex].annotations));
        this._notify('undo', { index: this._historyIndex });
        return true;
    },
    
    /**
     * Redo last undone change
     * @returns {boolean} Success
     */
    redo() {
        if (!this.canRedo()) return false;
        
        this._historyIndex++;
        this.annotations = JSON.parse(JSON.stringify(this._history[this._historyIndex].annotations));
        this._notify('redo', { index: this._historyIndex });
        return true;
    },
    
    /**
     * Save current state to history
     */
    saveToHistory() {
        this._pushHistory();
    },
    
    // ========================================================================
    // Methods - Event Subscription
    // ========================================================================
    
    /**
     * Subscribe to state changes
     * @param {Function} listener - Callback receiving (event, data)
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    },
    
    /**
     * Notify all listeners of a state change
     * @private
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    _notify(event, data) {
        for (const listener of this._listeners) {
            try {
                listener(event, data, this);
            } catch (error) {
                console.error('AnnotationState listener error:', error);
            }
        }
    }
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.AnnotationState = AnnotationState;
}
