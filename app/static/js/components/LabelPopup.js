/**
 * Label Popup Component
 * Handles selection of labels when clicking on the canvas without a selected label
 */
const LabelPopup = {
    element: null,
    isOpen: false,
    pendingClickCoords: null,

    /**
     * Initialize the popup DOM elements
     */
    init() {
        if (this.element) return;

        this.element = document.createElement('div');
        this.element.className = 'label-popup';
        this.element.innerHTML = `
            <div class="label-popup-header">Select Label</div>
            <div class="label-popup-list"></div>
        `;
        document.body.appendChild(this.element);

        // Close on click outside
        document.addEventListener('mousedown', (e) => {
            if (this.isOpen && !this.element.contains(e.target)) {
                this.hide();
            }
        });

        // Prevent clicks inside popup from propagating to canvas
        this.element.addEventListener('mousedown', (e) => e.stopPropagation());
    },

    /**
     * Show the popup at the specified coordinates
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     * @param {Object} imageCoords - Image coordinates {x, y} for the pending annotation
     */
    show(x, y, imageCoords) {
        this.init();
        this.isOpen = true;
        this.pendingClickCoords = imageCoords;

        this.renderList();

        this.element.style.display = 'block';

        const rect = this.element.getBoundingClientRect();
        let left = x;
        let top = y;

        // Position checking to avoid screen edges
        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 20;
        }

        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 20;
        }

        if (left < 0) left = 10;
        if (top < 0) top = 10;

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    },

    /**
     * Hide the popup
     */
    hide() {
        if (this.element) this.element.style.display = 'none';
        this.isOpen = false;
        this.pendingClickCoords = null;
    },

    /**
     * Render the list of labels
     */
    renderList() {
        const listEl = this.element.querySelector('.label-popup-list');
        listEl.innerHTML = '';

        const labels = [...STATE.allLabels];
        const usage = STATE.labelUsageCounts || {};

        // Sort by usage count (descending)
        labels.sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));

        labels.forEach(label => {
            const item = document.createElement('div');
            item.className = 'label-popup-item';

            if (usage[label.name] > 0) {
                item.classList.add('is-recent');
            }

            item.textContent = label.name;
            item.onclick = () => this.selectLabel(label.name);
            listEl.appendChild(item);
        });

        if (labels.length === 0) {
            listEl.innerHTML = '<div class="label-popup-empty">No labels available</div>';
        }
    },

    /**
     * Handle label selection
     * @param {string} name - Selected label name
     */
    selectLabel(name) {
        STATE.selectedLabel = name;

        // Update usage count
        const usage = { ...STATE.labelUsageCounts };
        usage[name] = (usage[name] || 0) + 1;
        STATE.labelUsageCounts = usage;

        this.hide();

        // Trigger the pending annotation
        if (this.pendingClickCoords) {
            const coords = this.pendingClickCoords;

            if (STATE.currentTool === 'landmark') {
                if (typeof annotateLandmark === 'function') annotateLandmark(coords);
            } else if (STATE.currentTool === 'polygon') {
                if (typeof handlePolygonClick === 'function') handlePolygonClick(coords);
            } else if (STATE.currentTool === 'figure') {
                if (typeof startFigureDrawing === 'function') startFigureDrawing(coords);
            }
        }
    }
};
