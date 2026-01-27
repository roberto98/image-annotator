/**
 * Viewport utility for coordinate transformations.
 * Centralizes image-to-display and display-to-image coordinate conversions.
 * @module services/viewport
 */

/**
 * Viewport class for managing coordinate transformations
 */
class Viewport {
    /**
     * Create a viewport manager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.containerElement = options.container || null;
        this.imageElement = options.image || null;

        // State references (can be linked to store)
        this._getZoom = options.getZoom || (() => 1);
        this._getTranslateX = options.getTranslateX || (() => 0);
        this._getTranslateY = options.getTranslateY || (() => 0);
        this._getNaturalWidth = options.getNaturalWidth || (() => 0);
        this._getNaturalHeight = options.getNaturalHeight || (() => 0);
    }

    /**
     * Set the container element
     * @param {HTMLElement} element - Container element
     */
    setContainer(element) {
        this.containerElement = element;
    }

    /**
     * Set the image element
     * @param {HTMLImageElement} element - Image element
     */
    setImage(element) {
        this.imageElement = element;
    }

    /**
     * Link to state getters
     * @param {Object} getters - Object with getter functions
     */
    linkState(getters) {
        if (getters.getZoom) this._getZoom = getters.getZoom;
        if (getters.getTranslateX) this._getTranslateX = getters.getTranslateX;
        if (getters.getTranslateY) this._getTranslateY = getters.getTranslateY;
        if (getters.getNaturalWidth) this._getNaturalWidth = getters.getNaturalWidth;
        if (getters.getNaturalHeight) this._getNaturalHeight = getters.getNaturalHeight;
    }

    /**
     * Current zoom level
     */
    get zoom() {
        return this._getZoom();
    }

    /**
     * Current X translation
     */
    get translateX() {
        return this._getTranslateX();
    }

    /**
     * Current Y translation
     */
    get translateY() {
        return this._getTranslateY();
    }

    /**
     * Natural image width
     */
    get naturalWidth() {
        return this._getNaturalWidth();
    }

    /**
     * Natural image height
     */
    get naturalHeight() {
        return this._getNaturalHeight();
    }

    /**
     * Convert event coordinates to image coordinates
     * @param {MouseEvent|TouchEvent} event - Input event
     * @param {DOMRect} [containerRect] - Optional pre-computed container rect
     * @returns {{x: number, y: number}} Image coordinates
     */
    eventToImage(event, containerRect = null) {
        if (!containerRect && this.containerElement) {
            containerRect = this.containerElement.getBoundingClientRect();
        }

        if (!containerRect) {
            return { x: 0, y: 0 };
        }

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        const containerX = clientX - containerRect.left;
        const containerY = clientY - containerRect.top;

        return this.displayToImage(containerX, containerY);
    }

    /**
     * Convert display coordinates to image coordinates
     * @param {number} displayX - X in display/container space
     * @param {number} displayY - Y in display/container space
     * @returns {{x: number, y: number}} Image coordinates
     */
    displayToImage(displayX, displayY) {
        return {
            x: (displayX - this.translateX) / this.zoom,
            y: (displayY - this.translateY) / this.zoom
        };
    }

    /**
     * Convert image coordinates to display coordinates
     * @param {number} imageX - X in image space
     * @param {number} imageY - Y in image space
     * @returns {{x: number, y: number}} Display coordinates
     */
    imageToDisplay(imageX, imageY) {
        return {
            x: imageX * this.zoom + this.translateX,
            y: imageY * this.zoom + this.translateY
        };
    }

    /**
     * Check if coordinates are within image bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if within bounds
     */
    isWithinBounds(x, y) {
        return x >= 0 && x < this.naturalWidth && y >= 0 && y < this.naturalHeight;
    }

    /**
     * Clamp coordinates to image bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {{x: number, y: number}} Clamped coordinates
     */
    clampToBounds(x, y) {
        return {
            x: Math.max(0, Math.min(this.naturalWidth - 1, x)),
            y: Math.max(0, Math.min(this.naturalHeight - 1, y))
        };
    }

    /**
     * Get the visible image region in image coordinates
     * @returns {{x: number, y: number, width: number, height: number}} Visible region
     */
    getVisibleRegion() {
        if (!this.containerElement) {
            return { x: 0, y: 0, width: this.naturalWidth, height: this.naturalHeight };
        }

        const rect = this.containerElement.getBoundingClientRect();
        const topLeft = this.displayToImage(0, 0);
        const bottomRight = this.displayToImage(rect.width, rect.height);

        return {
            x: Math.max(0, topLeft.x),
            y: Math.max(0, topLeft.y),
            width: Math.min(this.naturalWidth, bottomRight.x) - Math.max(0, topLeft.x),
            height: Math.min(this.naturalHeight, bottomRight.y) - Math.max(0, topLeft.y)
        };
    }

    /**
     * Calculate zoom to fit the entire image in the container
     * @param {number} [padding=0] - Padding in pixels
     * @returns {number} Zoom level to fit
     */
    calculateFitZoom(padding = 0) {
        if (!this.containerElement) return 1;

        const rect = this.containerElement.getBoundingClientRect();
        const containerWidth = rect.width - padding * 2;
        const containerHeight = rect.height - padding * 2;

        const scaleX = containerWidth / this.naturalWidth;
        const scaleY = containerHeight / this.naturalHeight;

        return Math.min(scaleX, scaleY);
    }

    /**
     * Calculate translation to center the image
     * @param {number} zoom - Current zoom level
     * @returns {{x: number, y: number}} Translation to center
     */
    calculateCenterTranslation(zoom) {
        if (!this.containerElement) return { x: 0, y: 0 };

        const rect = this.containerElement.getBoundingClientRect();
        const scaledWidth = this.naturalWidth * zoom;
        const scaledHeight = this.naturalHeight * zoom;

        return {
            x: (rect.width - scaledWidth) / 2,
            y: (rect.height - scaledHeight) / 2
        };
    }

    /**
     * Calculate distance between two points in image space
     * @param {Object} p1 - First point {x, y}
     * @param {Object} p2 - Second point {x, y}
     * @returns {number} Distance in pixels
     */
    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate angle between two points
     * @param {Object} p1 - First point {x, y}
     * @param {Object} p2 - Second point {x, y}
     * @returns {number} Angle in degrees
     */
    angle(p1, p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    }
}

const viewport = new Viewport();

if (typeof window !== 'undefined') {
    window.Viewport = Viewport;
    window.viewport = viewport;
}
