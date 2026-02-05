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
 * Colors are assigned sequentially to labels in order of first use.
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
 * Color assignment storage key for localStorage
 */
const COLOR_STORAGE_KEY = 'annotation_label_colors';

/**
 * Load persisted color assignments from localStorage
 * @returns {Object} Map of label names to colors
 */
function loadColorAssignments() {
    try {
        const stored = localStorage.getItem(COLOR_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('[state.js] Failed to load color assignments from localStorage:', e);
    }
    return {};
}

/**
 * Save color assignments to localStorage
 * @param {Object} assignments - Map of label names to colors
 */
function saveColorAssignments(assignments) {
    try {
        localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(assignments));
    } catch (e) {
        console.warn('[state.js] Failed to save color assignments to localStorage:', e);
    }
}

// Initialize color assignments from localStorage
window._labelColorAssignments = loadColorAssignments();

// Track next available color index (find highest used index + 1)
function getNextColorIndex() {
    const usedColors = Object.values(window._labelColorAssignments);
    let maxIndex = -1;
    usedColors.forEach(color => {
        const index = COLORS.indexOf(color);
        if (index > maxIndex) maxIndex = index;
    });
    return (maxIndex + 1) % COLORS.length;
}

window._nextColorIndex = getNextColorIndex();

/**
 * Get a stable color for a label name using sequential assignment.
 * Colors are assigned in order and persisted to localStorage.
 * @param {string} labelName - The label name
 * @returns {string} Hex color code
 */
function getColorForLabel(labelName) {
    if (!labelName) return COLORS[0];

    // Check if we have a cached assignment
    if (window._labelColorAssignments[labelName]) {
        return window._labelColorAssignments[labelName];
    }

    // Assign the next sequential color
    const color = COLORS[window._nextColorIndex];
    window._labelColorAssignments[labelName] = color;

    // Advance to next color (loops around)
    window._nextColorIndex = (window._nextColorIndex + 1) % COLORS.length;

    // Persist to localStorage
    saveColorAssignments(window._labelColorAssignments);

    return color;
}

/**
 * Set a specific color for a label (used by color picker)
 * @param {string} labelName - The label name
 * @param {string} color - Hex color code
 */
function setColorForLabel(labelName, color) {
    if (!labelName || !color) return;

    window._labelColorAssignments[labelName] = color;
    saveColorAssignments(window._labelColorAssignments);

    // Trigger re-render if available
    if (typeof window.forceRender === 'function') {
        window.forceRender();
    }
}

/**
 * Get all color assignments
 * @returns {Object} Map of label names to colors
 */
function getAllColorAssignments() {
    return { ...window._labelColorAssignments };
}

// Export COLORS and functions to window for global access
window.COLORS = COLORS;
window.getColorForLabel = getColorForLabel;
window.setColorForLabel = setColorForLabel;
window.getAllColorAssignments = getAllColorAssignments;
