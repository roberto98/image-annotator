/**
 * Global state management for the annotation tool.
 * Creates STATE as a proxy to the Store for backward-compatible property access.
 */

// Initialize store with server-provided data
if (window.AppStore) {
    const store = window.AppStore._state;
    store.annotations = window.currentAnnotations || {};

    if (window.__APP_CONFIG__) {
        store.patientId = window.__APP_CONFIG__.patientId || null;
        store.imageName = window.__APP_CONFIG__.imageName || null;
    }
}

const STATE = window.createStateProxy
    ? window.createStateProxy(window.AppStore)
    : { annotations: window.currentAnnotations || {} };

/** Color palette for annotations - each label gets a unique color */
const COLORS = Object.freeze([
    '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#ff8000', '#8000ff',
    '#ff0080', '#80ff00', '#0080ff', '#ff4040'
]);
