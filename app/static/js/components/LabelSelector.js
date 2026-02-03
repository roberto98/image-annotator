/**
 * LabelSelector - A popup component for selecting annotation labels
 * Shows after user clicks on image, prompts for label selection
 * 
 * Features:
 * - Search/filter by typing
 * - Keyboard navigation (arrow keys, Enter to select, Escape to cancel)
 * - Label categories/groups (collapsible)
 * - Color coding for each label
 * - Mobile-friendly with large touch targets (44px min)
 * - Automation-friendly with data attributes
 */
const LabelSelector = {
    element: null,
    isOpen: false,
    searchQuery: '',
    highlightedIndex: 0,
    filteredLabels: [],
    categories: {},  // { categoryName: [labels] }
    collapsedCategories: new Set(),
    searchDebounceTimer: null,
    SEARCH_DEBOUNCE_MS: 100,
    
    // Callback when label is selected
    onSelect: null,
    // Callback when cancelled
    onCancel: null,
    // The click coordinates that triggered this popup
    triggerCoords: null,
    
    // Store bound handlers for cleanup
    _boundOutsideClickHandler: null,
    _boundKeyHandler: null,
    _boundSearchInputHandler: null,
    _boundSearchKeyDownHandler: null,
    _boundClearBtnHandler: null,
    _boundCategoriesClickHandler: null,
    _boundElementMouseDownHandler: null,
    _boundElementTouchStartHandler: null,

    /**
     * Escape HTML special characters to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, c => escapeMap[c]);
    },

    /**
     * Default color palette for labels without assigned colors
     */
    defaultColors: [
        '#4f46e5', '#7c3aed', '#db2777', '#dc2626',
        '#ea580c', '#d97706', '#65a30d', '#16a34a',
        '#0d9488', '#0891b2', '#2563eb', '#4338ca'
    ],

    /**
     * Fuzzy match - checks if all characters in query appear in order within text
     * Example: "abc" matches "aXbYcZ" but not "acb"
     * @param {string} query - Search query
     * @param {string} text - Text to match against
     * @returns {boolean} True if fuzzy match succeeds
     */
    fuzzyMatch(query, text) {
        query = query.toLowerCase();
        text = text.toLowerCase();
        let qi = 0;
        for (let ti = 0; ti < text.length && qi < query.length; ti++) {
            if (text[ti] === query[qi]) qi++;
        }
        return qi === query.length;
    },

    /**
     * Calculate fuzzy match score for ranking (lower is better)
     * Considers: exact match, prefix match, character gaps
     * @param {string} query - Search query
     * @param {string} text - Text to match against
     * @returns {number} Score (0 = exact match, higher = worse match)
     */
    fuzzyMatchScore(query, text) {
        query = query.toLowerCase();
        text = text.toLowerCase();
        
        // Exact match - best score
        if (text === query) return 0;
        
        // Prefix match - second best
        if (text.startsWith(query)) return 1;
        
        // Contains as substring - third best
        if (text.includes(query)) return 2;
        
        // Fuzzy match - score based on gaps
        let score = 3;
        let qi = 0;
        let lastMatchPos = -1;
        
        for (let ti = 0; ti < text.length && qi < query.length; ti++) {
            if (text[ti] === query[qi]) {
                // Add penalty for gaps between matched characters
                if (lastMatchPos >= 0) {
                    score += (ti - lastMatchPos - 1) * 0.1;
                }
                lastMatchPos = ti;
                qi++;
            }
        }
        
        return qi === query.length ? score : Infinity;
    },

    /**
     * Initialize the component
     */
    init() {
        if (this.element) return;
        
        this.createElement();
        this.attachEventListeners();
    },

    /**
     * Create the DOM element
     */
    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'label-selector';
        this.element.setAttribute('data-component', 'label-selector');
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-label', 'Select a label');
        this.element.innerHTML = `
            <div class="label-selector-header">
                <div class="label-selector-title">Select Label</div>
                <div class="label-selector-search-wrapper">
                    <svg class="label-selector-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="text" 
                           class="label-selector-search" 
                           placeholder="Search labels..." 
                           data-input="label-search"
                           autocomplete="off" />
                    <button class="label-selector-clear" aria-label="Clear search" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="label-selector-categories" data-list="categories" role="listbox"></div>
            <div class="label-selector-footer">
                <div class="label-selector-hint">
                    <span class="hint-key">↑↓</span> Navigate
                    <span class="hint-key">Enter</span> Select
                    <span class="hint-key">Esc</span> Cancel
                </div>
            </div>
        `;
        this.element.style.display = 'none';
        document.body.appendChild(this.element);
    },

    /**
     * Attach all event listeners
     */
    attachEventListeners() {
        // Search input handlers
        const searchInput = this.element.querySelector('.label-selector-search');
        this._boundSearchInputHandler = (e) => this.handleSearchInput(e.target.value);
        this._boundSearchKeyDownHandler = (e) => this.handleKeyDown(e);
        searchInput.addEventListener('input', this._boundSearchInputHandler);
        searchInput.addEventListener('keydown', this._boundSearchKeyDownHandler);

        // Clear button
        const clearBtn = this.element.querySelector('.label-selector-clear');
        this._boundClearBtnHandler = () => {
            searchInput.value = '';
            this.handleSearch('');
            searchInput.focus();
        };
        clearBtn.addEventListener('click', this._boundClearBtnHandler);

        // Category header clicks (delegation)
        const categoriesContainer = this.element.querySelector('.label-selector-categories');
        this._boundCategoriesClickHandler = (e) => {
            const categoryHeader = e.target.closest('.category-header');
            if (categoryHeader) {
                const categoryName = categoryHeader.dataset.category;
                this.toggleCategory(categoryName);
                return;
            }

            const labelItem = e.target.closest('.label-selector-item');
            if (labelItem) {
                const labelName = labelItem.dataset.label;
                this.selectLabel(labelName);
            }
        };
        categoriesContainer.addEventListener('click', this._boundCategoriesClickHandler);

        // Store bound handlers for cleanup
        this._boundOutsideClickHandler = (e) => {
            if (this.isOpen && !this.element.contains(e.target)) {
                this.cancel();
            }
        };

        this._boundKeyHandler = (e) => {
            if (this.isOpen && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.cancel();
            }
        };

        // Close on click outside (with delay to avoid immediate close)
        document.addEventListener('mousedown', this._boundOutsideClickHandler);
        document.addEventListener('touchstart', this._boundOutsideClickHandler, { passive: true });

        // Prevent clicks inside popup from propagating
        this._boundElementMouseDownHandler = (e) => e.stopPropagation();
        this._boundElementTouchStartHandler = (e) => e.stopPropagation();
        this.element.addEventListener('mousedown', this._boundElementMouseDownHandler);
        this.element.addEventListener('touchstart', this._boundElementTouchStartHandler, { passive: true });

        // Global escape handler
        document.addEventListener('keydown', this._boundKeyHandler);
    },

    /**
     * Clean up event listeners
     */
    destroy() {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }

        // Remove document-level listeners
        if (this._boundOutsideClickHandler) {
            document.removeEventListener('mousedown', this._boundOutsideClickHandler);
            document.removeEventListener('touchstart', this._boundOutsideClickHandler);
            this._boundOutsideClickHandler = null;
        }

        if (this._boundKeyHandler) {
            document.removeEventListener('keydown', this._boundKeyHandler);
            this._boundKeyHandler = null;
        }

        // Remove element-level listeners (if element still exists)
        if (this.element) {
            const searchInput = this.element.querySelector('.label-selector-search');
            const clearBtn = this.element.querySelector('.label-selector-clear');
            const categoriesContainer = this.element.querySelector('.label-selector-categories');

            if (searchInput && this._boundSearchInputHandler) {
                searchInput.removeEventListener('input', this._boundSearchInputHandler);
            }
            if (searchInput && this._boundSearchKeyDownHandler) {
                searchInput.removeEventListener('keydown', this._boundSearchKeyDownHandler);
            }
            if (clearBtn && this._boundClearBtnHandler) {
                clearBtn.removeEventListener('click', this._boundClearBtnHandler);
            }
            if (categoriesContainer && this._boundCategoriesClickHandler) {
                categoriesContainer.removeEventListener('click', this._boundCategoriesClickHandler);
            }
            if (this._boundElementMouseDownHandler) {
                this.element.removeEventListener('mousedown', this._boundElementMouseDownHandler);
            }
            if (this._boundElementTouchStartHandler) {
                this.element.removeEventListener('touchstart', this._boundElementTouchStartHandler);
            }

            this.element.remove();
            this.element = null;
        }

        // Clear bound handler references
        this._boundSearchInputHandler = null;
        this._boundSearchKeyDownHandler = null;
        this._boundClearBtnHandler = null;
        this._boundCategoriesClickHandler = null;
        this._boundElementMouseDownHandler = null;
        this._boundElementTouchStartHandler = null;

        this.isOpen = false;
    },

    /**
     * Show the popup at the given screen coordinates
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     * @param {{x: number, y: number}} imageCoords - Image coordinates where user clicked
     * @param {Function} onSelect - Callback when label selected: (labelName) => void
     * @param {Function} onCancel - Callback when cancelled: () => void
     */
    show(screenX, screenY, imageCoords, onSelect, onCancel) {
        this.init();
        
        this.triggerCoords = imageCoords;
        this.onSelect = onSelect;
        this.onCancel = onCancel;
        this.searchQuery = '';
        this.highlightedIndex = 0;

        // Reset search input
        const searchInput = this.element.querySelector('.label-selector-search');
        searchInput.value = '';

        // Load labels and organize by category
        this.loadLabels();

        // Show popup first to get dimensions
        this.element.style.display = 'flex';
        this.element.style.opacity = '0';
        this.isOpen = true;

        // Position popup after it's visible
        requestAnimationFrame(() => {
            this.positionPopup(screenX, screenY);
            this.element.style.opacity = '1';
            searchInput.focus();
        });
    },

    /**
     * Show the popup centered on screen (for tool button clicks)
     */
    showCentered(onSelect, onCancel) {
        this.init();
        
        this.triggerCoords = null;
        this.onSelect = onSelect;
        this.onCancel = onCancel;
        this.searchQuery = '';
        this.highlightedIndex = 0;

        // Reset search input
        const searchInput = this.element.querySelector('.label-selector-search');
        searchInput.value = '';

        // Load labels and organize by category
        this.loadLabels();

        // Show popup
        this.element.style.display = 'flex';
        this.element.style.opacity = '0';
        this.isOpen = true;

        // Center on screen
        requestAnimationFrame(() => {
            const rect = this.element.getBoundingClientRect();
            const left = Math.max(10, (window.innerWidth - rect.width) / 2);
            const top = Math.max(10, (window.innerHeight - rect.height) / 2);

            this.element.style.left = `${left}px`;
            this.element.style.top = `${top}px`;
            this.element.style.opacity = '1';
            searchInput.focus();
        });
    },

    /**
     * Hide the popup
     */
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
        this.isOpen = false;
        this.triggerCoords = null;
        this.onSelect = null;
        this.onCancel = null;
        this.highlightedIndex = 0;
        this.filteredLabels = [];
        this.categories = {};

        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
    },

    /**
     * Cancel the selection
     */
    cancel() {
        const callback = this.onCancel;
        this.hide();
        if (typeof callback === 'function') {
            callback();
        }
    },

    /**
     * Load labels from AnnotationState and organize by category
     */
    loadLabels() {
        const labels = window.AnnotationState?.labels || window.STATE?.allLabels || [];
        this.categories = {};

        labels.forEach((label, index) => {
            // Determine category from label data or use default
            const cat = label.category || this.inferCategory(label) || 'Other';
            
            if (!this.categories[cat]) {
                this.categories[cat] = [];
            }

            // Ensure label has a color
            const labelWithColor = {
                ...label,
                color: label.color || this.getDefaultColor(index)
            };

            this.categories[cat].push(labelWithColor);
        });

        // Sort categories: predefined order first, then alphabetically
        const categoryOrder = ['Landmarks', 'Segments', 'Figures', 'Other'];
        const sortedCategories = {};
        
        categoryOrder.forEach(cat => {
            if (this.categories[cat]) {
                sortedCategories[cat] = this.categories[cat];
            }
        });

        // Add any remaining categories
        Object.keys(this.categories)
            .filter(cat => !categoryOrder.includes(cat))
            .sort()
            .forEach(cat => {
                sortedCategories[cat] = this.categories[cat];
            });

        this.categories = sortedCategories;
        this.filterAndRender();
    },

    /**
     * Infer category from label type
     * @param {Object} label - Label data
     * @returns {string} Category name
     */
    inferCategory(label) {
        const typeToCategory = {
            'landmark': 'Landmarks',
            'point': 'Landmarks',
            'segment': 'Segments',
            'polygon': 'Segments',
            'figure': 'Figures',
            'shape': 'Figures'
        };
        return typeToCategory[label.type] || null;
    },

    /**
     * Get a default color for a label based on its index
     * @param {number} index - Label index
     * @returns {string} Color hex code
     */
    getDefaultColor(index) {
        return this.defaultColors[index % this.defaultColors.length];
    },

    /**
     * Filter labels based on search query and render
     */
    filterAndRender() {
        const query = this.searchQuery.toLowerCase().trim();
        this.filteredLabels = [];

        const container = this.element.querySelector('.label-selector-categories');
        container.innerHTML = '';

        // Get annotation status for sorting
        const annotations = window.STATE?.annotations || {};
        const usage = window.STATE?.labelUsageCounts || {};

        Object.entries(this.categories).forEach(([categoryName, labels]) => {
            // Filter labels by search query using fuzzy matching
            let matchingLabels = query
                ? labels.filter(l => this.fuzzyMatch(query, l.name))
                : labels;

            if (matchingLabels.length === 0) return;

            // Sort matching labels: by match quality (when searching), then annotated first, then by usage, then alphabetically
            matchingLabels = this.sortLabels(matchingLabels, annotations, usage, query);

            // Create category section
            const categoryEl = document.createElement('div');
            categoryEl.className = 'label-selector-category';
            categoryEl.setAttribute('data-category', categoryName);

            const isCollapsed = this.collapsedCategories.has(categoryName);

            // Category header - use safe DOM API to prevent XSS
            const headerEl = document.createElement('div');
            headerEl.className = 'category-header';
            headerEl.setAttribute('data-category', categoryName);
            headerEl.setAttribute('role', 'button');
            headerEl.setAttribute('aria-expanded', String(!isCollapsed));
            
            // Create toggle icon
            const toggleSpan = document.createElement('span');
            toggleSpan.className = 'category-toggle';
            toggleSpan.innerHTML = isCollapsed ? '&#9654;' : '&#9660;';
            headerEl.appendChild(toggleSpan);
            
            // Create category name span - use textContent to prevent XSS
            const nameSpan = document.createElement('span');
            nameSpan.className = 'category-name';
            nameSpan.textContent = categoryName;
            headerEl.appendChild(nameSpan);
            
            // Create count span
            const countSpan = document.createElement('span');
            countSpan.className = 'category-count';
            countSpan.textContent = matchingLabels.length;
            headerEl.appendChild(countSpan);
            
            categoryEl.appendChild(headerEl);

            // Labels container
            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'category-labels';
            labelsContainer.style.display = isCollapsed ? 'none' : 'block';

            matchingLabels.forEach(label => {
                this.filteredLabels.push(label);
                const index = this.filteredLabels.length - 1;
                const labelEl = this.createLabelItem(label, index, annotations, usage);
                labelsContainer.appendChild(labelEl);
            });

            categoryEl.appendChild(labelsContainer);
            container.appendChild(categoryEl);
        });

        // Show "create new" option if no results and there's a search query
        if (this.filteredLabels.length === 0 && query) {
            const createEl = document.createElement('div');
            createEl.className = 'label-selector-create-new';
            createEl.innerHTML = `
                <p>Label "<strong>${this._escapeHtml(query)}</strong>" not found</p>
                <button class="create-new-btn" data-action="create-new" data-label="${this._escapeHtml(query)}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Create "${this._escapeHtml(query)}"
                </button>
            `;
            container.appendChild(createEl);

            // Add click handler for create button
            const createBtn = createEl.querySelector('.create-new-btn');
            createBtn.addEventListener('click', () => {
                this.selectLabel(query);
            });
        } else if (this.filteredLabels.length === 0) {
            container.innerHTML = `
                <div class="label-selector-empty">
                    <p>Type a label name to search or create</p>
                </div>
            `;
        }

        // Update clear button visibility
        const clearBtn = this.element.querySelector('.label-selector-clear');
        clearBtn.style.display = query ? 'flex' : 'none';
    },

    /**
     * Sort labels by priority: match quality (when searching), annotated first, then by usage, then alphabetically
     * @param {Array} labels - Labels to sort
     * @param {Object} annotations - Current annotations
     * @param {Object} usage - Usage counts
     * @param {string} query - Optional search query for fuzzy score sorting
     * @returns {Array} Sorted labels
     */
    sortLabels(labels, annotations, usage, query = '') {
        return [...labels].sort((a, b) => {
            // When searching, sort by fuzzy match score first (better matches first)
            if (query) {
                const scoreA = this.fuzzyMatchScore(query, a.name);
                const scoreB = this.fuzzyMatchScore(query, b.name);
                if (scoreA !== scoreB) return scoreA - scoreB;
            }

            // Annotated labels first
            const annotatedDiff = !!annotations[b.name] - !!annotations[a.name];
            if (annotatedDiff !== 0) return annotatedDiff;

            // Then by usage count (descending)
            const usageDiff = (usage[b.name] || 0) - (usage[a.name] || 0);
            if (usageDiff !== 0) return usageDiff;

            // Finally alphabetically
            return a.name.localeCompare(b.name);
        });
    },

    /**
     * Create a label item element
     * @param {Object} label - Label data
     * @param {number} index - Item index in filtered list
     * @param {Object} annotations - Current annotations
     * @param {Object} usage - Usage counts
     * @returns {HTMLElement} Label item element
     */
    createLabelItem(label, index, annotations, usage) {
        const item = document.createElement('div');
        item.className = 'label-selector-item';
        item.setAttribute('role', 'option');
        item.setAttribute('data-label', label.name);
        item.setAttribute('data-index', index);
        item.setAttribute('tabindex', '0');

        const isAnnotated = !!annotations[label.name];
        const isRecent = (usage[label.name] || 0) > 0;
        const isHighlighted = index === this.highlightedIndex;

        if (isAnnotated) item.classList.add('is-annotated');
        if (isRecent) item.classList.add('is-recent');
        if (isHighlighted) item.classList.add('is-highlighted');
        item.setAttribute('aria-selected', String(isHighlighted));

        // Color indicator
        const colorEl = document.createElement('span');
        colorEl.className = 'label-color';
        colorEl.style.backgroundColor = label.color || '#888';
        item.appendChild(colorEl);

        // Label name
        const nameEl = document.createElement('span');
        nameEl.className = 'label-name';
        nameEl.textContent = label.name;
        item.appendChild(nameEl);

        // Status indicator
        if (isAnnotated) {
            const statusEl = document.createElement('span');
            statusEl.className = 'label-status';
            statusEl.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;
            item.appendChild(statusEl);
        }

        // Keyboard handler for individual items
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectLabel(label.name);
            }
        });

        return item;
    },

    /**
     * Handle search input with debouncing
     * @param {string} query - Search query
     */
    handleSearchInput(query) {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = setTimeout(() => {
            this.handleSearch(query);
            this.searchDebounceTimer = null;
        }, this.SEARCH_DEBOUNCE_MS);
    },

    /**
     * Perform the actual search
     * @param {string} query - Search query
     */
    handleSearch(query) {
        this.searchQuery = query;
        this.highlightedIndex = 0;
        this.filterAndRender();
    },

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        const maxIndex = this.filteredLabels.length - 1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightedIndex = Math.min(this.highlightedIndex + 1, maxIndex);
                this.updateHighlight();
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
                this.updateHighlight();
                break;

            case 'Enter':
                e.preventDefault();
                if (this.filteredLabels.length > 0) {
                    const safeIndex = Math.max(0, Math.min(this.highlightedIndex, maxIndex));
                    this.selectLabel(this.filteredLabels[safeIndex].name);
                } else if (this.searchQuery.trim()) {
                    // No matches but there's a search query - create new label
                    this.selectLabel(this.searchQuery.trim());
                }
                break;

            case 'Tab':
                e.preventDefault();
                // Tab cycles through visible items
                this.highlightedIndex = e.shiftKey
                    ? Math.max(this.highlightedIndex - 1, 0)
                    : Math.min(this.highlightedIndex + 1, maxIndex);
                this.updateHighlight();
                break;

            case 'Home':
                e.preventDefault();
                this.highlightedIndex = 0;
                this.updateHighlight();
                break;

            case 'End':
                e.preventDefault();
                this.highlightedIndex = maxIndex;
                this.updateHighlight();
                break;
        }
    },

    /**
     * Update visual highlight of the selected item
     */
    updateHighlight() {
        const items = this.element.querySelectorAll('.label-selector-item');
        items.forEach((item, index) => {
            const isHighlighted = index === this.highlightedIndex;
            item.classList.toggle('is-highlighted', isHighlighted);
            item.setAttribute('aria-selected', String(isHighlighted));
            if (isHighlighted) {
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    },

    /**
     * Toggle category collapse state
     * @param {string} categoryName - Name of category to toggle
     */
    toggleCategory(categoryName) {
        if (this.collapsedCategories.has(categoryName)) {
            this.collapsedCategories.delete(categoryName);
        } else {
            this.collapsedCategories.add(categoryName);
        }

        // Re-render to update the UI
        this.filterAndRender();
    },

    /**
     * Handle label selection
     * @param {string} labelName - Selected label name
     */
    selectLabel(labelName) {
        const callback = this.onSelect;
        const coords = this.triggerCoords;

        // Update usage count in STATE
        if (window.STATE) {
            const usage = { ...window.STATE.labelUsageCounts };
            usage[labelName] = (usage[labelName] || 0) + 1;
            window.STATE.labelUsageCounts = usage;
        }

        this.hide();

        if (typeof callback === 'function') {
            callback(labelName, coords);
        }
    },

    /**
     * Position the popup to avoid going off-screen
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     */
    positionPopup(screenX, screenY) {
        const rect = this.element.getBoundingClientRect();
        const padding = 20;
        
        // Clamp position within viewport bounds
        const left = Math.min(
            Math.max(screenX, padding),
            window.innerWidth - rect.width - padding
        );
        const top = Math.min(
            Math.max(screenY, padding),
            window.innerHeight - rect.height - padding
        );

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    }
};

// Export to window
window.LabelSelector = LabelSelector;
