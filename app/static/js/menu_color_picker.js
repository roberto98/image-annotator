// Color picker for annotation label colors on the menu page.
// Reads/writes the same localStorage key used by the annotation tool (utilities.js)
// so colors stay in sync across pages.

const COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894', '#e17055'
];

const COLOR_STORAGE_KEY = 'annotation_label_colors';
let colorAssignments = {};
let currentEditingLabel = null;
let selectedColor = null;

// Load color assignments from localStorage
function loadColorAssignments() {
    try {
        const stored = localStorage.getItem(COLOR_STORAGE_KEY);
        if (stored) {
            colorAssignments = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load color assignments:', e);
    }
}

// Save color assignments to localStorage
function saveColorAssignments() {
    try {
        localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colorAssignments));
    } catch (e) {
        console.warn('Failed to save color assignments:', e);
    }
}

// Get color for a label
function getColorForLabel(labelName) {
    if (colorAssignments[labelName]) {
        return colorAssignments[labelName];
    }
    // Assign sequential color
    const usedColors = Object.values(colorAssignments);
    let maxIndex = -1;
    usedColors.forEach(color => {
        const index = COLORS.indexOf(color);
        if (index > maxIndex) maxIndex = index;
    });
    const nextIndex = (maxIndex + 1) % COLORS.length;
    const color = COLORS[nextIndex];
    colorAssignments[labelName] = color;
    saveColorAssignments();
    return color;
}

// Initialize color circles
function initColorCircles() {
    document.querySelectorAll('.color-circle').forEach(circle => {
        const label = circle.dataset.label;
        const color = getColorForLabel(label);
        circle.style.backgroundColor = color;
    });
}

// Open color picker
function openColorPicker(labelName, currentColor) {
    currentEditingLabel = labelName;
    selectedColor = currentColor;

    document.getElementById('colorPickerLabel').textContent = labelName;
    document.getElementById('customColorInput').value = currentColor;

    // Build color grid
    const grid = document.getElementById('colorPickerGrid');
    grid.innerHTML = '';
    COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-picker-swatch' + (color === currentColor ? ' selected' : '');
        swatch.style.backgroundColor = color;
        swatch.onclick = () => selectColor(color, swatch);
        grid.appendChild(swatch);
    });

    document.getElementById('colorPickerModal').style.display = 'flex';
}

// Select a color
function selectColor(color, swatch) {
    selectedColor = color;
    document.getElementById('customColorInput').value = color;
    document.querySelectorAll('.color-picker-swatch').forEach(s => s.classList.remove('selected'));
    if (swatch) swatch.classList.add('selected');
}

// Close color picker
function closeColorPicker() {
    document.getElementById('colorPickerModal').style.display = 'none';
    currentEditingLabel = null;
    selectedColor = null;
}

// Apply selected color
function applyColor() {
    if (!currentEditingLabel) return;

    const color = document.getElementById('customColorInput').value || selectedColor;
    colorAssignments[currentEditingLabel] = color;
    saveColorAssignments();

    // Update the color circle
    document.querySelectorAll(`.color-circle[data-label="${currentEditingLabel}"]`).forEach(circle => {
        circle.style.backgroundColor = color;
    });

    closeColorPicker();
}

// Handle custom color input
document.getElementById('customColorInput')?.addEventListener('input', (e) => {
    selectedColor = e.target.value;
    document.querySelectorAll('.color-picker-swatch').forEach(s => s.classList.remove('selected'));
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadColorAssignments();
    initColorCircles();

    // Add click handlers for color picker buttons
    document.querySelectorAll('.color-picker-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.dataset.label;
            const currentColor = getColorForLabel(label);
            openColorPicker(label, currentColor);
        });
    });
});

// Close modal on background click
document.getElementById('colorPickerModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'colorPickerModal') {
        closeColorPicker();
    }
});
