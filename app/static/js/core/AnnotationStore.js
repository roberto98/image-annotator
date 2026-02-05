/**
 * AnnotationStore - Single source of truth for application state
 * 
 * Uses Proxy-based reactivity to notify subscribers of state changes.
 * Replaces the old dual state system (STATE + AnnotationState).
 * 
 * @module AnnotationStore
 */

class AnnotationStore {
    /**
     * Create the annotation store
     */
    constructor() {
        // Internal state object
        this._state = {
            // Annotation data: { label: { type, data, status, timestamp, color, category } }
            annotations: {},
            
            // Current selected annotation tool
            currentTool: null,
            
            // Mode: true = annotation mode, false = pan/navigation mode
            isAnnotationMode: true,
            
            // Viewport state
            viewport: {
                scale: 1.0,
                offsetX: 0,
                offsetY: 0
            },
            
            // Selected annotation label (null if none)
            selectedAnnotation: null,
            
            // Undo stack: [{ action, label, before, after, timestamp }]
            undoStack: [],
            
            // Redo stack: cleared when new operation performed
            redoStack: [],
            
            // Image metadata
            imageWidth: 0,
            imageHeight: 0,
            pixelSpacing: null,  // [row, col] in mm from DICOM
            
            // Patient/image context
            patientId: null,
            imageName: null,
            
            // Available labels for autocomplete
            labels: []
        };
        
        // Subscriber callbacks: { id: callback }
        this._subscribers = {};
        this._nextSubscriberId = 1;
        
        // Create reactive proxy
        this.state = this._createProxy(this._state);
    }
    
    /**
     * Create a Proxy that notifies subscribers on changes
     * @param {Object} target - Target object to proxy
     * @returns {Proxy}
     * @private
     */
    _createProxy(target) {
        const store = this;
        
        return new Proxy(target, {
            set(obj, prop, value) {
                const oldValue = obj[prop];
                obj[prop] = value;
                
                // Notify subscribers
                store._notify(prop, value, oldValue);
                
                return true;
            },
            
            get(obj, prop) {
                const value = obj[prop];
                
                // Don't proxy functions
                if (typeof value === 'function') {
                    return value.bind(obj);
                }
                
                // Deep proxy for objects (but not arrays for performance)
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return store._createProxy(value);
                }
                
                return value;
            }
        });
    }
    
    /**
     * Notify all subscribers of a state change
     * @param {string} property - Property that changed
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     * @private
     */
    _notify(property, newValue, oldValue) {
        Object.values(this._subscribers).forEach(callback => {
            try {
                callback(property, newValue, oldValue);
            } catch (error) {
                console.error('Error in state subscriber:', error);
            }
        });
    }
    
    /**
     * Subscribe to state changes
     * @param {Function} callback - Called with (property, newValue, oldValue)
     * @returns {number} Subscriber ID for unsubscribing
     */
    subscribe(callback) {
        const id = this._nextSubscriberId++;
        this._subscribers[id] = callback;
        return id;
    }
    
    /**
     * Unsubscribe from state changes
     * @param {number} id - Subscriber ID from subscribe()
     */
    unsubscribe(id) {
        delete this._subscribers[id];
    }
    
    // ========================================================================
    // Annotation Management
    // ========================================================================
    
    /**
     * Add or update an annotation
     * @param {string} label - Annotation label
     * @param {Object} annotation - Annotation data { type, data, status, ... }
     */
    setAnnotation(label, annotation) {
        const before = this.state.annotations[label] || null;
        
        this.state.annotations = {
            ...this.state.annotations,
            [label]: {
                ...annotation,
                timestamp: annotation.timestamp || new Date().toISOString()
            }
        };
        
        // Add to undo stack
        this._addToHistory('set', label, before, this.state.annotations[label]);
    }
    
    /**
     * Remove an annotation
     * @param {string} label - Annotation label
     */
    removeAnnotation(label) {
        if (!(label in this.state.annotations)) {
            return;
        }
        
        const before = this.state.annotations[label];
        const { [label]: removed, ...rest } = this.state.annotations;
        this.state.annotations = rest;
        
        // Add to undo stack
        this._addToHistory('delete', label, before, null);
        
        // Deselect if this was selected
        if (this.state.selectedAnnotation === label) {
            this.state.selectedAnnotation = null;
        }
    }
    
    /**
     * Get an annotation by label
     * @param {string} label - Annotation label
     * @returns {Object|null}
     */
    getAnnotation(label) {
        return this.state.annotations[label] || null;
    }
    
    /**
     * Get all annotations
     * @returns {Object}
     */
    getAllAnnotations() {
        return { ...this.state.annotations };
    }
    
    /**
     * Clear all annotations
     */
    clearAnnotations() {
        this.state.annotations = {};
        this.state.undoStack = [];
        this.state.redoStack = [];
    }
    
    // ========================================================================
    // Undo/Redo
    // ========================================================================
    
    /**
     * Add operation to history
     * @param {string} action - 'set' or 'delete'
     * @param {string} label - Annotation label
     * @param {*} before - State before change
     * @param {*} after - State after change
     * @private
     */
    _addToHistory(action, label, before, after) {
        const entry = {
            action,
            label,
            before: before ? JSON.parse(JSON.stringify(before)) : null,
            after: after ? JSON.parse(JSON.stringify(after)) : null,
            timestamp: new Date().toISOString()
        };
        
        this.state.undoStack = [...this.state.undoStack, entry];
        
        // Clear redo stack on new operation
        this.state.redoStack = [];
    }
    
    /**
     * Undo last operation
     * @returns {boolean} True if undo was performed
     */
    undo() {
        if (this.state.undoStack.length === 0) {
            return false;
        }
        
        const entry = this.state.undoStack[this.state.undoStack.length - 1];
        this.state.undoStack = this.state.undoStack.slice(0, -1);
        
        // Apply reverse operation
        if (entry.action === 'set') {
            if (entry.before) {
                // Restore previous value
                this.state.annotations = {
                    ...this.state.annotations,
                    [entry.label]: entry.before
                };
            } else {
                // Remove (was a create)
                const { [entry.label]: removed, ...rest } = this.state.annotations;
                this.state.annotations = rest;
            }
        } else if (entry.action === 'delete') {
            // Restore deleted annotation
            this.state.annotations = {
                ...this.state.annotations,
                [entry.label]: entry.before
            };
        }
        
        // Add to redo stack
        this.state.redoStack = [...this.state.redoStack, entry];
        
        return true;
    }
    
    /**
     * Redo last undone operation
     * @returns {boolean} True if redo was performed
     */
    redo() {
        if (this.state.redoStack.length === 0) {
            return false;
        }
        
        const entry = this.state.redoStack[this.state.redoStack.length - 1];
        this.state.redoStack = this.state.redoStack.slice(0, -1);
        
        // Re-apply operation
        if (entry.action === 'set') {
            this.state.annotations = {
                ...this.state.annotations,
                [entry.label]: entry.after
            };
        } else if (entry.action === 'delete') {
            const { [entry.label]: removed, ...rest } = this.state.annotations;
            this.state.annotations = rest;
        }
        
        // Add back to undo stack
        this.state.undoStack = [...this.state.undoStack, entry];
        
        return true;
    }
    
    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.state.undoStack.length > 0;
    }
    
    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.state.redoStack.length > 0;
    }
}

// Create singleton instance
const store = new AnnotationStore();

// Export to window for global access
window.AnnotationStore = store;

console.log('[AnnotationStore] Initialized');
