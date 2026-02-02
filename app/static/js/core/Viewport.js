/**
 * Viewport - Handles coordinate transformations for pan/zoom functionality
 * 
 * Provides screen-to-image and image-to-screen coordinate transformations,
 * with support for zoom (scale) and pan (offset) operations.
 * 
 * Uses a subscriber pattern similar to AnnotationStore for reactive updates.
 * 
 * @module core/Viewport
 */

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} ViewportState
 * @property {number} scale - Current zoom level (1.0 = 100%)
 * @property {number} offsetX - Horizontal pan offset in screen pixels
 * @property {number} offsetY - Vertical pan offset in screen pixels
 */

/**
 * @typedef {Object} FitResult
 * @property {number} scale - Calculated scale to fit
 * @property {number} offsetX - Calculated X offset to center
 * @property {number} offsetY - Calculated Y offset to center
 */

/**
 * @callback ViewportChangeCallback
 * @param {string} property - Property that changed ('scale', 'offsetX', 'offsetY', 'all')
 * @param {ViewportState} newState - Current viewport state
 * @param {ViewportState} oldState - Previous viewport state
 */

class Viewport {
    /**
     * Minimum allowed scale (zoom out limit)
     * @type {number}
     */
    static MIN_SCALE = 0.1;

    /**
     * Maximum allowed scale (zoom in limit)
     * @type {number}
     */
    static MAX_SCALE = 50.0;

    /**
     * Create the viewport manager
     */
    constructor() {
        /**
         * Current zoom level (1.0 = 100%)
         * @type {number}
         * @private
         */
        this._scale = 1.0;

        /**
         * Horizontal pan offset in screen pixels
         * @type {number}
         * @private
         */
        this._offsetX = 0;

        /**
         * Vertical pan offset in screen pixels
         * @type {number}
         * @private
         */
        this._offsetY = 0;

        /**
         * Subscriber callbacks: { id: callback }
         * @type {Object.<number, ViewportChangeCallback>}
         * @private
         */
        this._subscribers = {};

        /**
         * Next subscriber ID
         * @type {number}
         * @private
         */
        this._nextSubscriberId = 1;
    }

    // ========================================================================
    // Properties (Getters/Setters)
    // ========================================================================

    /**
     * Get current scale (zoom level)
     * @returns {number}
     */
    get scale() {
        return this._scale;
    }

    /**
     * Set scale with clamping to valid range
     * @param {number} value - New scale value
     */
    set scale(value) {
        const clampedValue = this._clampScale(value);
        if (this._scale !== clampedValue) {
            const oldState = this._getState();
            this._scale = clampedValue;
            this._notify('scale', this._getState(), oldState);
        }
    }

    /**
     * Get current horizontal offset
     * @returns {number}
     */
    get offsetX() {
        return this._offsetX;
    }

    /**
     * Set horizontal offset
     * @param {number} value - New offsetX value
     */
    set offsetX(value) {
        if (!this._isValidNumber(value)) {
            console.warn('[Viewport] Invalid offsetX value:', value);
            return;
        }
        if (this._offsetX !== value) {
            const oldState = this._getState();
            this._offsetX = value;
            this._notify('offsetX', this._getState(), oldState);
        }
    }

    /**
     * Get current vertical offset
     * @returns {number}
     */
    get offsetY() {
        return this._offsetY;
    }

    /**
     * Set vertical offset
     * @param {number} value - New offsetY value
     */
    set offsetY(value) {
        if (!this._isValidNumber(value)) {
            console.warn('[Viewport] Invalid offsetY value:', value);
            return;
        }
        if (this._offsetY !== value) {
            const oldState = this._getState();
            this._offsetY = value;
            this._notify('offsetY', this._getState(), oldState);
        }
    }

    // ========================================================================
    // Coordinate Transformation Methods
    // ========================================================================

    /**
     * Transform screen/mouse coordinates to image space coordinates
     * 
     * Formula: imageCoord = (screenCoord - offset) / scale
     * 
     * @param {number} screenX - X coordinate in screen space
     * @param {number} screenY - Y coordinate in screen space
     * @returns {Point} Coordinates in image space
     */
    screenToImage(screenX, screenY) {
        if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
            console.warn('[Viewport] screenToImage called with invalid coordinates:', screenX, screenY);
            return { x: 0, y: 0 };
        }
        return {
            x: (screenX - this._offsetX) / this._scale,
            y: (screenY - this._offsetY) / this._scale
        };
    }

    /**
     * Transform image coordinates to screen space for rendering
     * 
     * Formula: screenCoord = imageCoord * scale + offset
     * 
     * @param {number} imageX - X coordinate in image space
     * @param {number} imageY - Y coordinate in image space
     * @returns {Point} Coordinates in screen space
     */
    imageToScreen(imageX, imageY) {
        if (!Number.isFinite(imageX) || !Number.isFinite(imageY)) {
            console.warn('[Viewport] imageToScreen called with invalid coordinates:', imageX, imageY);
            return { x: 0, y: 0 };
        }
        return {
            x: imageX * this._scale + this._offsetX,
            y: imageY * this._scale + this._offsetY
        };
    }

    /**
     * Transform a point from screen to image coordinates
     * Convenience method that accepts a Point object
     * 
     * @param {Point} point - Point in screen coordinates
     * @returns {Point} Point in image coordinates
     */
    screenToImagePoint(point) {
        return this.screenToImage(point.x, point.y);
    }

    /**
     * Transform a point from image to screen coordinates
     * Convenience method that accepts a Point object
     * 
     * @param {Point} point - Point in image coordinates
     * @returns {Point} Point in screen coordinates
     */
    imageToScreenPoint(point) {
        return this.imageToScreen(point.x, point.y);
    }

    // ========================================================================
    // Viewport Manipulation Methods
    // ========================================================================

    /**
     * Set scale (zoom) centered on a specific point
     * 
     * This maintains the visual position of the center point after zooming,
     * creating a natural "zoom to cursor" effect.
     * 
     * @param {number} newScale - New scale value
     * @param {number} centerX - X coordinate (screen space) to zoom around
     * @param {number} centerY - Y coordinate (screen space) to zoom around
     */
    setScale(newScale, centerX, centerY) {
        const clampedScale = this._clampScale(newScale);
        if (clampedScale === this._scale) {
            return;
        }

        const oldState = this._getState();

        // Convert center point to image coordinates, then back after scale change
        const imageCenter = this.screenToImage(centerX, centerY);
        this._scale = clampedScale;
        
        // Adjust offset so the center point stays fixed on screen
        this._offsetX = centerX - imageCenter.x * this._scale;
        this._offsetY = centerY - imageCenter.y * this._scale;

        this._notify('all', this._getState(), oldState);
    }

    /**
     * Pan the viewport by a delta amount
     * 
     * @param {number} deltaX - Amount to pan horizontally (positive = right)
     * @param {number} deltaY - Amount to pan vertically (positive = down)
     */
    pan(deltaX, deltaY) {
        if (deltaX === 0 && deltaY === 0) {
            return;
        }

        const oldState = this._getState();
        this._offsetX += deltaX;
        this._offsetY += deltaY;
        this._notify('all', this._getState(), oldState);
    }

    /**
     * Set the viewport offset directly
     * 
     * @param {number} offsetX - New horizontal offset
     * @param {number} offsetY - New vertical offset
     */
    setOffset(offsetX, offsetY) {
        if (this._offsetX === offsetX && this._offsetY === offsetY) {
            return;
        }

        const oldState = this._getState();
        this._offsetX = offsetX;
        this._offsetY = offsetY;
        this._notify('all', this._getState(), oldState);
    }

    /**
     * Reset viewport to default state (scale=1, offset=0,0)
     */
    reset() {
        if (this._scale === 1.0 && this._offsetX === 0 && this._offsetY === 0) {
            return;
        }

        const oldState = this._getState();
        this._scale = 1.0;
        this._offsetX = 0;
        this._offsetY = 0;
        this._notify('all', this._getState(), oldState);
    }

    /**
     * Fit image to container, optionally centering it
     * 
     * Calculates the scale needed to fit the image within the container
     * while maintaining aspect ratio, and centers the image.
     * 
     * @param {number} imageWidth - Natural width of the image in pixels
     * @param {number} imageHeight - Natural height of the image in pixels
     * @param {number} containerWidth - Width of the container in pixels
     * @param {number} containerHeight - Height of the container in pixels
     * @param {number} [padding=0] - Optional padding around the image
     * @returns {FitResult} The calculated fit parameters
     */
    fitToContainer(imageWidth, imageHeight, containerWidth, containerHeight, padding = 0) {
        if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
            console.warn('[Viewport] fitToContainer called with invalid dimensions');
            return this._getState();
        }

        const oldState = this._getState();

        // Clamp padding to prevent negative available space
        const maxPadding = Math.min(containerWidth, containerHeight) / 2 - 1;
        const safePadding = Math.max(0, Math.min(padding, maxPadding));

        // Calculate available space and fit scale
        const availableWidth = containerWidth - safePadding * 2;
        const availableHeight = containerHeight - safePadding * 2;
        const fitScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);

        // Apply scale with clamping
        this._scale = this._clampScale(fitScale);

        // Center the image in the container
        const scaledWidth = imageWidth * this._scale;
        const scaledHeight = imageHeight * this._scale;
        this._offsetX = (containerWidth - scaledWidth) / 2;
        this._offsetY = (containerHeight - scaledHeight) / 2;

        this._notify('all', this._getState(), oldState);

        return this._getState();
    }

    /**
     * Apply a complete viewport state at once (batch update)
     * 
     * @param {number} scale - New scale value
     * @param {number} offsetX - New X offset
     * @param {number} offsetY - New Y offset
     */
    setState(scale, offsetX, offsetY) {
        const clampedScale = this._clampScale(scale);
        
        if (this._scale === clampedScale && this._offsetX === offsetX && this._offsetY === offsetY) {
            return;
        }

        const oldState = this._getState();
        this._scale = clampedScale;
        this._offsetX = offsetX;
        this._offsetY = offsetY;
        this._notify('all', this._getState(), oldState);
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Get current viewport state
     * @returns {ViewportState}
     */
    getState() {
        return this._getState();
    }

    /**
     * Internal method to get state snapshot
     * @returns {ViewportState}
     * @private
     */
    _getState() {
        return {
            scale: this._scale,
            offsetX: this._offsetX,
            offsetY: this._offsetY
        };
    }

    /**
     * Clamp scale value to valid range
     * @param {number} value - Scale value to clamp
     * @returns {number} Clamped scale value
     * @private
     */
    _clampScale(value) {
        return Math.max(Viewport.MIN_SCALE, Math.min(Viewport.MAX_SCALE, value));
    }

    /**
     * Check if a value is a valid finite number
     * @param {*} value - Value to check
     * @returns {boolean} True if valid finite number
     * @private
     */
    _isValidNumber(value) {
        return Number.isFinite(value);
    }

    /**
     * Calculate the distance between two points in image space
     * 
     * @param {Point} p1 - First point in image coordinates
     * @param {Point} p2 - Second point in image coordinates
     * @returns {number} Euclidean distance in image pixels
     */
    distanceInImageSpace(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate the distance between two points in screen space
     * 
     * @param {Point} p1 - First point in screen coordinates
     * @param {Point} p2 - Second point in screen coordinates
     * @returns {number} Euclidean distance in screen pixels
     */
    distanceInScreenSpace(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Convert a screen distance to image distance
     * 
     * @param {number} screenDistance - Distance in screen pixels
     * @returns {number} Distance in image pixels
     */
    screenDistanceToImage(screenDistance) {
        return screenDistance / this._scale;
    }

    /**
     * Convert an image distance to screen distance
     * 
     * @param {number} imageDistance - Distance in image pixels
     * @returns {number} Distance in screen pixels
     */
    imageDistanceToScreen(imageDistance) {
        return imageDistance * this._scale;
    }

    /**
     * Check if a point (image coords) is within given image bounds
     * 
     * @param {number} x - X coordinate in image space
     * @param {number} y - Y coordinate in image space
     * @param {number} imageWidth - Image width
     * @param {number} imageHeight - Image height
     * @returns {boolean} True if point is within bounds
     */
    isWithinBounds(x, y, imageWidth, imageHeight) {
        return x >= 0 && x < imageWidth && y >= 0 && y < imageHeight;
    }

    /**
     * Clamp a point to image bounds
     * 
     * @param {number} x - X coordinate in image space
     * @param {number} y - Y coordinate in image space
     * @param {number} imageWidth - Image width
     * @param {number} imageHeight - Image height
     * @returns {Point} Clamped coordinates
     */
    clampToBounds(x, y, imageWidth, imageHeight) {
        return {
            x: Math.max(0, Math.min(imageWidth - 1, x)),
            y: Math.max(0, Math.min(imageHeight - 1, y))
        };
    }

    /**
     * Verify round-trip conversion accuracy
     * Tests that screen→image→screen conversion has minimal error
     * 
     * @param {number} screenX - Test X coordinate
     * @param {number} screenY - Test Y coordinate
     * @returns {{error: number, errorX: number, errorY: number, passed: boolean}} Test results
     */
    testRoundTrip(screenX, screenY) {
        // Screen -> Image
        const image = this.screenToImage(screenX, screenY);
        
        // Image -> Screen
        const screen = this.imageToScreen(image.x, image.y);
        
        // Calculate error
        const errorX = Math.abs(screen.x - screenX);
        const errorY = Math.abs(screen.y - screenY);
        const error = Math.max(errorX, errorY);
        
        return {
            error,
            errorX,
            errorY,
            passed: error < 0.01
        };
    }

    // ========================================================================
    // Event Subscription
    // ========================================================================

    /**
     * Subscribe to viewport changes
     * 
     * @param {ViewportChangeCallback} callback - Called with (property, newState, oldState)
     * @returns {number} Subscriber ID for unsubscribing
     */
    subscribe(callback) {
        const id = this._nextSubscriberId++;
        this._subscribers[id] = callback;
        return id;
    }

    /**
     * Unsubscribe from viewport changes
     * 
     * @param {number} id - Subscriber ID from subscribe()
     */
    unsubscribe(id) {
        delete this._subscribers[id];
    }

    /**
     * Notify all subscribers of a viewport change
     * 
     * @param {string} property - Property that changed
     * @param {ViewportState} newState - Current state
     * @param {ViewportState} oldState - Previous state
     * @private
     */
    _notify(property, newState, oldState) {
        Object.values(this._subscribers).forEach(callback => {
            try {
                callback(property, newState, oldState);
            } catch (error) {
                console.error('[Viewport] Error in subscriber callback:', error);
            }
        });
    }

    /**
     * Clear all subscribers
     */
    clearSubscribers() {
        this._subscribers = {};
    }

    // ========================================================================
    // Backward Compatibility Methods
    // These alias methods maintain compatibility with the old viewport API
    // ========================================================================

    /**
     * @deprecated Use screenToImage instead
     * Alias for screenToImage - converts display/container coordinates to image coordinates
     * 
     * @param {number} displayX - X in display/container space
     * @param {number} displayY - Y in display/container space
     * @returns {Point} Image coordinates
     */
    displayToImage(displayX, displayY) {
        return this.screenToImage(displayX, displayY);
    }

    /**
     * @deprecated Use imageToScreen instead
     * Alias for imageToScreen - converts image coordinates to display coordinates
     * 
     * @param {number} imageX - X in image space
     * @param {number} imageY - Y in image space
     * @returns {Point} Display coordinates
     */
    imageToDisplay(imageX, imageY) {
        return this.imageToScreen(imageX, imageY);
    }

    /**
     * @deprecated Use screenToImage with extracted coordinates instead
     * Convert event coordinates to image coordinates (legacy method)
     * 
     * @param {MouseEvent|TouchEvent} event - Input event
     * @param {DOMRect} [containerRect] - Optional pre-computed container rect
     * @returns {Point} Image coordinates
     */
    eventToImage(event, containerRect = null) {
        // Get container rect if not provided
        if (!containerRect) {
            const container = document.getElementById('imageContainer') || 
                             document.querySelector('.image-container');
            if (container) {
                containerRect = container.getBoundingClientRect();
            }
        }

        if (!containerRect) {
            console.warn('[Viewport] eventToImage: container not found');
            return null;
        }

        // Extract client coordinates from event (supports both mouse and touch)
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        
        // Convert to container-relative coordinates
        const containerX = clientX - containerRect.left;
        const containerY = clientY - containerRect.top;

        // Then convert to image coordinates
        return this.screenToImage(containerX, containerY);
    }

    /**
     * @deprecated Access scale, offsetX, offsetY directly instead
     * Legacy getter for zoom (alias for scale)
     * @returns {number}
     */
    get zoom() {
        return this._scale;
    }

    /**
     * @deprecated Access offsetX directly instead
     * Legacy getter for translateX (alias for offsetX)
     * @returns {number}
     */
    get translateX() {
        return this._offsetX;
    }

    /**
     * @deprecated Access offsetY directly instead
     * Legacy getter for translateY (alias for offsetY)
     * @returns {number}
     */
    get translateY() {
        return this._offsetY;
    }

    /**
     * @deprecated Link state through AnnotationStore instead
     * Legacy method to link viewport state getters (no-op, for compatibility)
     * 
     * @param {Object} getters - Object with getter functions
     */
    linkState(getters) {
        // This is now a no-op as the Viewport manages its own state
        // Log a deprecation warning
        console.warn('[Viewport] linkState is deprecated - Viewport now manages its own state');
    }

    /**
     * @deprecated Set container through other means
     * Legacy method to set container element (no-op, for compatibility)
     * 
     * @param {HTMLElement} element - Container element
     */
    setContainer(element) {
        // This is now a no-op as the Viewport no longer depends on DOM elements
        console.warn('[Viewport] setContainer is deprecated - Viewport no longer requires DOM element references');
    }

    /**
     * @deprecated Set image through other means
     * Legacy method to set image element (no-op, for compatibility)
     * 
     * @param {HTMLImageElement} element - Image element
     */
    setImage(element) {
        // This is now a no-op
        console.warn('[Viewport] setImage is deprecated - Viewport no longer requires DOM element references');
    }
}

// Create singleton instance
const viewport = new Viewport();

// Export class and singleton to window for global access
if (typeof window !== 'undefined') {
    window.Viewport = Viewport;
    window.viewport = viewport;

    /**
     * @deprecated This function is no longer needed
     * Legacy function to link viewport to globals (no-op for compatibility)
     */
    window.linkViewportToGlobals = function() {
        console.warn('[Viewport] linkViewportToGlobals is deprecated - Viewport now manages its own state');
    };
}

// Also export for ES module usage
export { Viewport, viewport };
export default viewport;

console.log('[Viewport] Core viewport service initialized');
