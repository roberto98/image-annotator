/**
 * Label Popup Component
 * Handles selection of labels when clicking on the canvas without a selected label
 */
const LabelPopup = {
    element: null,
    isOpen: false,
    pendingClickCoords: null,
    highlightedIndex: -1,
    filteredLabels: [],
    searchDebounceTimer: null,
    SEARCH_DEBOUNCE_MS: 150,

    /**
     * Initialize the popup DOM elements
     */
    init() {
        if (this.element) return;

        this.element = document.createElement('div');
        this.element.className = 'label-popup';
        this.element.innerHTML = `
            <div class="label-popup-header">
                <input type="text" class="label-popup-search" placeholder="Search labels..." />
            </div>
            <div class="label-popup-list"></div>
        `;
        document.body.appendChild(this.element);

        const searchInput = this.element.querySelector('.label-popup-search');
        searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
        searchInput.addEventListener('keydown', (e) => this.handleKeyDown(e));

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
        this.highlightedIndex = -1;

        const searchInput = this.element.querySelector('.label-popup-search');
        searchInput.value = '';
        this.filteredLabels = [...STATE.allLabels];

        this.renderList();
        searchInput.focus();

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
        this.highlightedIndex = -1;
        this.filteredLabels = [];
        
        // Clear any pending debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
    },

    /**
     * Handle search input with debouncing (150ms)
     * @param {string} query - Search query
     */
    handleSearchInput(query) {
        // Clear any existing debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Debounce the actual search for performance
        this.searchDebounceTimer = setTimeout(() => {
            this.handleSearch(query);
            this.searchDebounceTimer = null;
        }, this.SEARCH_DEBOUNCE_MS);
    },

    /**
     * Handle search input
     * @param {string} query - Search query
     */
    handleSearch(query) {
        const allLabels = STATE.allLabels;
        const usage = STATE.labelUsageCounts || {};

        if (!query.trim()) {
            this.filteredLabels = [...allLabels];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredLabels = allLabels.filter(label =>
                label.name.toLowerCase().includes(lowerQuery)
            );
        }

        this.highlightedIndex = -1;
        this.renderList();
    },

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        const items = this.element.querySelectorAll('.label-popup-item');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1);
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.highlightedIndex >= 0 && this.highlightedIndex < items.length) {
                    items[this.highlightedIndex].click();
                } else if (items.length === 1) {
                    items[0].click();
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hide();
                break;
        }
    },

    /**
     * Update visual highlight of the selected item
     */
    updateHighlight() {
        const items = this.element.querySelectorAll('.label-popup-item');
        items.forEach((item, index) => {
            if (index === this.highlightedIndex) {
                item.classList.add('is-highlighted');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('is-highlighted');
            }
        });
    },

    /**
     * Render the list of labels
     */
    renderList() {
        const listEl = this.element.querySelector('.label-popup-list');
        listEl.innerHTML = '';

        const usage = STATE.labelUsageCounts || {};

        // Sort filtered labels by usage count (descending)
        this.filteredLabels.sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));

        this.filteredLabels.forEach((label, index) => {
            const item = document.createElement('div');
            item.className = 'label-popup-item';

            if (usage[label.name] > 0) {
                item.classList.add('is-recent');
            }

            if (index === this.highlightedIndex) {
                item.classList.add('is-highlighted');
            }

            item.textContent = label.name;
            item.onclick = () => this.selectLabel(label.name);
            listEl.appendChild(item);
        });

        if (this.filteredLabels.length === 0) {
            listEl.innerHTML = '<div class="label-popup-empty">No labels found</div>';
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
