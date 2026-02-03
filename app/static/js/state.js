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

/**
 * Fixed color palette for annotations - 30 distinct, visually distinguishable colors.
 * Colors are assigned consistently based on label name hash, not iteration order.
 */
const COLORS = Object.freeze([
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894', '#e17055'
]);

/**
 * Get a stable color for a label name using hash-based assignment.
 * This ensures the same label always gets the same color regardless of order.
 * @param {string} labelName - The label name
 * @returns {string} Hex color code
 */
function getColorForLabel(labelName) {
    if (!labelName) return COLORS[0];

    // Check if we have a cached assignment
    if (!window._labelColorAssignments) {
        window._labelColorAssignments = {};
    }

    if (window._labelColorAssignments[labelName]) {
        return window._labelColorAssignments[labelName];
    }

    // Simple hash function for consistent color assignment
    let hash = 0;
    for (let i = 0; i < labelName.length; i++) {
        const char = labelName.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % COLORS.length;
    const color = COLORS[index];

    // Cache the assignment
    window._labelColorAssignments[labelName] = color;

    return color;
}

// Export COLORS and getColorForLabel to window for global access
window.COLORS = COLORS;
window.getColorForLabel = getColorForLabel;
