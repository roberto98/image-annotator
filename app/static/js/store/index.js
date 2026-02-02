/**
 * Centralized state management store for the annotation tool.
 * Provides reactive state updates with subscription support and undo/redo history.
 * @module store
 */

let DEBUG_MODE = false;

/**
 * Enable or disable debug logging
 * @param {boolean} enabled
 */
function setDebugMode(enabled) {
    DEBUG_MODE = enabled;
    if (enabled) {
        console.log('[Store] Debug mode enabled');
    }
}

function debugLog(action, data = null) {
    if (!DEBUG_MODE) return;

    const timestamp = new Date().toISOString().substring(11, 23);
    const args = data !== null ? [action, data] : [action];
    console.log(`[Store ${timestamp}]`, ...args);
}

/** Deep clone using structuredClone with JSON fallback */
function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch {
            // Fall through to manual clone
        }
    }

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
            debugLog('setState (function)', { changes });
            Object.assign(this._state, changes);
        } else {
            debugLog('setState', { updater });
            Object.assign(this._state, updater);
        }

        if (saveHistory && !this._suppressHistory) {
            this._pushHistory(prevState);
        }

        this._notify(prevState);
    }

    /**
     * Set a nested value by path
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     * @param {boolean} saveHistory - Whether to save to history
     */
    set(path, value, saveHistory = false) {
        debugLog(`set '${path}'`, value);
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
        if (!this.canUndo()) return false;

        debugLog('undo', { historyIndex: this._historyIndex });
        const prevState = deepClone(this._state);

        this._suppressHistory = true;
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
        if (!this.canRedo()) return false;

        debugLog('redo', { historyIndex: this._historyIndex });
        const prevState = deepClone(this._state);

        this._suppressHistory = true;
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
        if (this._historyIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._historyIndex + 1);
        }

        this._history.push(deepClone(state));
        this._historyIndex = this._history.length - 1;

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

const INITIAL_STATE = {
    currentTool: 'landmark',
    selectedLabel: null,

    annotations: {},
    allLabels: [],
    visibilityToggles: {},

    imageLoaded: false,
    naturalWidth: 0,
    naturalHeight: 0,
    patientId: null,
    imageName: null,

    currentZoom: 1,
    maxZoom: 5.0,  // 500% max zoom
    translateX: 0,
    translateY: 0,

    isAnnotationMode: true,
    isDragging: false,
    startDragX: 0,
    startDragY: 0,

    activePolygonPoints: [],
    activePolygonElements: { points: [], lines: [] },
    polygonTool: 'draw',
    polygonDragging: false,
    selectedPointIndex: -1,
    polygonMoveStart: null,

    figureShape: 'circle',
    figureSize: 50,
    figureDrawing: false,
    figureStartX: 0,
    figureStartY: 0,
    figurePreview: null,

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

    linePoints: [],
    lineDrawing: false,
    linePointDragging: false,
    linePointDraggedFigure: null,
    linePointDraggedType: null,
    figureOriginalStartX: 0,
    figureOriginalStartY: 0,
    figureOriginalEndX: 0,
    figureOriginalEndY: 0,

    hasUnsavedChanges: false,
    brightness: 100,
    contrast: 100,

    labelUsageCounts: {}
};

/**
 * Create a proxy wrapper around the store.
 * Provides direct property access (STATE.property) that routes through the Store.
 * All state changes are logged in debug mode and properly notify listeners with prevState.
 * @param {Store} storeInstance - The store instance to wrap
 * @returns {Proxy} Proxy that allows direct property access
 */
function createStateProxy(storeInstance) {
    return new Proxy({}, {
        get(target, prop) {
            if (prop === Symbol.toStringTag) return 'STATE';
            if (prop === '__store__') return storeInstance;
            return storeInstance._state[prop];
        },

        set(target, prop, value) {
            debugLog(`STATE.${prop} =`, value);
            const prevValue = storeInstance._state[prop];
            storeInstance._state[prop] = value;
            storeInstance._notify({ ...storeInstance._state, [prop]: prevValue });
            return true;
        },

        has(target, prop) {
            return prop in storeInstance._state;
        },

        ownKeys(target) {
            return Object.keys(storeInstance._state);
        },

        getOwnPropertyDescriptor(target, prop) {
            return prop in storeInstance._state
                ? { enumerable: true, configurable: true, value: storeInstance._state[prop] }
                : undefined;
        }
    });
}

const store = new Store(INITIAL_STATE);

if (typeof window !== 'undefined') {
    window.AppStore = store;
    window.Store = Store;
    /** STATE - Single access point for all application state, backed by Store */
    window.STATE = createStateProxy(store);
    window.createStateProxy = createStateProxy;
    window.setStoreDebugMode = setDebugMode;
}
