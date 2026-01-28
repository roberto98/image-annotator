/**
 * State initialization and constants.
 * STATE is created in store/index.js as the single source of truth.
 * This file handles server-provided data initialization and color constants.
 */

// Initialize store with server-provided data
if (window.AppStore) {
    const storeState = window.AppStore._state;
    storeState.annotations = window.currentAnnotations || {};

    if (window.__APP_CONFIG__) {
        storeState.patientId = window.__APP_CONFIG__.patientId || null;
        storeState.imageName = window.__APP_CONFIG__.imageName || null;
    }
}

// STATE is now created and exported from store/index.js
// Re-declare as local const for backward compatibility with scripts that
// expect STATE to be available as a global after this file loads.
const STATE = window.STATE;

/** Color palette for annotations - each label gets a unique color */
const COLORS = Object.freeze([
    '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#ff8000', '#8000ff',
    '#ff0080', '#80ff00', '#0080ff', '#ff4040'
]);
