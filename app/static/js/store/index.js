/**
 * Centralized state management store for the annotation tool.
 * Provides reactive state updates with subscription support and undo/redo history.
 * @module store
 */

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    return Object.fromEntries(
        Object.entries(obj).map(([key, val]) => [key, deepClone(val)])
    );
}

/**
 * Application Store - manages all mutable state
 */
class Store {
    /**
     * Create a new store instance
     * @param {Object} initialState - Initial state object
     */
    constructor(initialState = {}) {
        this._state = deepClone(initialState);
        this._listeners = new Set();
        this._history = [];
        this._historyIndex = -1;
        this._maxHistorySize = 50;
        this._suppressHistory = false;
    }

    /**
     * Get a copy of the current state
     * @returns {Object} Current state
     */
    getState() {
        return deepClone(this._state);
    }

    /**
     * Get a value from state by key path
     * @param {string} path - Dot-separated path (e.g., 'user.profile.name')
     * @returns {*} Value at path
     */
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this._state);
    }

    /**
     * Update state with new values
     * @param {Object|Function} updater - Object to merge or function receiving current state
     * @param {boolean} saveHistory - Whether to save this change to history
     */
    setState(updater, saveHistory = false) {
        const prevState = deepClone(this._state);

        if (typeof updater === 'function') {
            const changes = updater(this._state);
            Object.assign(this._state, changes);
        } else {
            Object.assign(this._state, updater);
        }

        // Save to history if requested and not suppressed
        if (saveHistory && !this._suppressHistory) {
            this._pushHistory(prevState);
        }

        // Notify all listeners
        this._notify(prevState);
    }

    /**
     * Set a nested value by path
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     * @param {boolean} saveHistory - Whether to save to history
     */
    set(path, value, saveHistory = false) {
        const prevState = deepClone(this._state);
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!(key in obj)) obj[key] = {};
            return obj[key];
        }, this._state);

        target[lastKey] = value;

        if (saveHistory && !this._suppressHistory) {
            this._pushHistory(prevState);
        }

        this._notify(prevState);
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener - Callback receiving (newState, prevState)
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * Undo the last state change
     * @returns {boolean} True if undo was performed
     */
    undo() {
        if (this._historyIndex < 0) return false;

        this._suppressHistory = true;
        const prevState = deepClone(this._state);
        this._state = deepClone(this._history[this._historyIndex]);
        this._historyIndex--;
        this._suppressHistory = false;

        this._notify(prevState);
        return true;
    }

    /**
     * Redo the last undone state change
     * @returns {boolean} True if redo was performed
     */
    redo() {
        if (this._historyIndex >= this._history.length - 2) return false;

        this._suppressHistory = true;
        const prevState = deepClone(this._state);
        this._historyIndex++;
        this._state = deepClone(this._history[this._historyIndex + 1]);
        this._suppressHistory = false;

        this._notify(prevState);
        return true;
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this._historyIndex >= 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this._historyIndex < this._history.length - 2;
    }

    /**
     * Save current state to history
     */
    saveToHistory() {
        this._pushHistory(deepClone(this._state));
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this._history = [];
        this._historyIndex = -1;
    }

    /**
     * Reset state to initial values
     * @param {Object} initialState - State to reset to
     */
    reset(initialState) {
        const prevState = deepClone(this._state);
        this._state = deepClone(initialState);
        this.clearHistory();
        this._notify(prevState);
    }

    // Private methods

    _pushHistory(state) {
        // Remove any future history if we're not at the end
        if (this._historyIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._historyIndex + 1);
        }

        this._history.push(deepClone(state));
        this._historyIndex = this._history.length - 1;

        // Limit history size
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
            this._historyIndex--;
        }
    }

    _notify(prevState) {
        for (const listener of this._listeners) {
            try {
                listener(this._state, prevState);
            } catch (error) {
                console.error('Store listener error:', error);
            }
        }
    }
}

// Create the default initial state
const INITIAL_STATE = {
    // Current tool mode
    currentTool: 'landmark', // 'landmark', 'polygon', 'figure'
    selectedLabel: null,

    // Annotations data
    annotations: {},
    allLabels: [],
    visibilityToggles: {},

    // Image state
    imageLoaded: false,
    naturalWidth: 0,
    naturalHeight: 0,

    // Patient/Image context
    patientId: null,
    imageName: null,

    // Zoom and pan state
    currentZoom: 1,
    maxZoom: 1000,
    translateX: 0,
    translateY: 0,

    // Interaction modes
    isAnnotationMode: true,
    isDragging: false,
    startDragX: 0,
    startDragY: 0,

    // Polygon drawing state
    activePolygonPoints: [],
    activePolygonElements: { points: [], lines: [] },
    polygonTool: 'draw',
    polygonDragging: false,
    selectedPointIndex: -1,
    polygonMoveStart: null,

    // Figure drawing state
    figureShape: 'circle',
    figureSize: 50,
    figureDrawing: false,
    figureStartX: 0,
    figureStartY: 0,
    figurePreview: null,

    // Figure interaction state
    selectedFigure: null,
    figureDragging: false,
    figureResizing: false,
    figureDragStartX: 0,
    figureDragStartY: 0,
    figureOriginalX: 0,
    figureOriginalY: 0,
    figureOriginalSize: 0,
    resizeHandle: null,
    figureDragOffsetX: 0,
    figureDragOffsetY: 0,
    showCenterIndicators: true,

    // Line drawing state
    linePoints: [],
    lineDrawing: false,
    linePointDragging: false,
    linePointDraggedFigure: null,
    linePointDraggedType: null,
    figureOriginalStartX: 0,
    figureOriginalStartY: 0,
    figureOriginalEndX: 0,
    figureOriginalEndY: 0,

    // Unsaved changes tracking
    hasUnsavedChanges: false,

    // Image adjustments
    brightness: 100,
    contrast: 100
};

// Export store class and create a singleton instance
// The singleton can be used directly, or new instances can be created for testing
const store = new Store(INITIAL_STATE);

// Make available globally for backward compatibility with existing code
if (typeof window !== 'undefined') {
    window.AppStore = store;
    window.Store = Store;
}
