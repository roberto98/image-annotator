/**
 * Unified API service for annotation operations.
 * Centralizes all fetch calls and error handling.
 * @module services/api
 */

/**
 * API Error class for consistent error handling
 */
class APIError extends Error {
    constructor(message, status, response) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.response = response;
    }
}

/**
 * Annotation API client
 */
class AnnotationAPI {
    /**
     * Create API client
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     */
    constructor(patientId = null, imageName = null) {
        this.patientId = patientId;
        this.imageName = imageName;
    }

    /**
     * Set the current patient and image context
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     */
    setContext(patientId, imageName) {
        this.patientId = patientId;
        this.imageName = imageName;
    }

    /**
     * Make an API request with error handling
     * @private
     */
    async _request(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const config = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        try {
            const response = await fetch(endpoint, config);
            const data = await response.json();

            if (!response.ok) {
                throw new APIError(
                    data.message || data.error || 'Request failed',
                    response.status,
                    data
                );
            }

            return data;
        } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError(error.message, 0, null);
        }
    }

    /**
     * Get the image-specific endpoint
     * @private
     */
    _imageEndpoint(type, name = '') {
        const base = `/api/${type}/${this.patientId}/${this.imageName}`;
        return name ? `${base}/${name}` : base;
    }

    // === Landmark Operations ===

    /**
     * Get all landmarks for the current image
     * @returns {Promise<Object>} Landmarks data
     */
    async getLandmarks() {
        return this._request(this._imageEndpoint('landmarks'));
    }

    /**
     * Save a landmark coordinate
     * @param {string} name - Landmark name
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    async saveLandmark(name, x, y) {
        return this._request(this._imageEndpoint('landmarks', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'coordinates', x, y })
        });
    }

    /**
     * Mark a landmark as occluded
     * @param {string} name - Landmark name
     */
    async markLandmarkOccluded(name) {
        return this._request(this._imageEndpoint('landmarks', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'occluded' })
        });
    }

    /**
     * Remove a landmark annotation
     * @param {string} name - Landmark name
     */
    async removeLandmark(name) {
        return this._request(this._imageEndpoint('landmarks', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'remove' })
        });
    }

    /**
     * Create a new landmark label
     * @param {string} name - Landmark name
     */
    async createLandmarkLabel(name) {
        return this._request('/api/landmarks', {
            method: 'POST',
            body: JSON.stringify({ landmark_name: name })
        });
    }

    // === Segment (Polygon) Operations ===

    /**
     * Get all segments for the current image
     * @returns {Promise<Object>} Segments data
     */
    async getSegments() {
        return this._request(this._imageEndpoint('segments'));
    }

    /**
     * Save a polygon segment
     * @param {string} name - Segment name
     * @param {Array<{x: number, y: number}>} points - Polygon points
     */
    async saveSegment(name, points) {
        return this._request(this._imageEndpoint('segments', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'polygon', points })
        });
    }

    /**
     * Remove a segment annotation
     * @param {string} name - Segment name
     */
    async removeSegment(name) {
        return this._request(this._imageEndpoint('segments', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'remove' })
        });
    }

    /**
     * Create a new segment label
     * @param {string} name - Segment name
     */
    async createSegmentLabel(name) {
        return this._request('/api/segments', {
            method: 'POST',
            body: JSON.stringify({ segment_name: name })
        });
    }

    // === Figure Operations ===

    /**
     * Get all figures for the current image
     * @returns {Promise<Object>} Figures data
     */
    async getFigures() {
        return this._request(this._imageEndpoint('figures'));
    }

    /**
     * Save a figure (circle, rectangle)
     * @param {string} name - Figure name
     * @param {number} x - Center X coordinate
     * @param {number} y - Center Y coordinate
     * @param {string} shape - Shape type ('circle', 'rectangle')
     * @param {number} size - Figure size
     */
    async saveFigure(name, x, y, shape, size) {
        return this._request(this._imageEndpoint('figures', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'figure', x, y, shape, size })
        });
    }

    /**
     * Save a line figure
     * @param {string} name - Figure name
     * @param {number} startX - Start X coordinate
     * @param {number} startY - Start Y coordinate
     * @param {number} endX - End X coordinate
     * @param {number} endY - End Y coordinate
     */
    async saveLine(name, startX, startY, endX, endY) {
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.round(Math.sqrt(dx * dx + dy * dy));

        return this._request(this._imageEndpoint('figures', name), {
            method: 'POST',
            body: JSON.stringify({
                action: 'figure',
                x: centerX,
                y: centerY,
                shape: 'line',
                size: length,
                startX,
                startY,
                endX,
                endY
            })
        });
    }

    /**
     * Update a figure
     * @param {string} name - Figure name
     * @param {Object} data - Figure data to update
     */
    async updateFigure(name, data) {
        return this._request(this._imageEndpoint('figures', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'update', ...data })
        });
    }

    /**
     * Remove a figure annotation
     * @param {string} name - Figure name
     */
    async removeFigure(name) {
        return this._request(this._imageEndpoint('figures', name), {
            method: 'POST',
            body: JSON.stringify({ action: 'remove' })
        });
    }

    /**
     * Create a new figure label
     * @param {string} name - Figure name
     */
    async createFigureLabel(name) {
        return this._request('/api/figures', {
            method: 'POST',
            body: JSON.stringify({ figure_name: name })
        });
    }

    // === Image Operations ===

    /**
     * Get the image directory structure
     * @returns {Promise<Object>} Directory tree
     */
    async getImageDirectory() {
        return this._request('/api/image-directory');
    }

    /**
     * Get segment mask as PNG
     * @param {string} segmentName - Segment name
     * @returns {Promise<string>} Mask image URL
     */
    getMaskUrl(segmentName) {
        return `/api/mask/${this.patientId}/${this.imageName}/${segmentName}`;
    }

    // === Navigation Operations ===

    /**
     * Find the next unannotated image
     * @returns {Promise<{patient: string, image: string}|null>}
     */
    async getNextUnannotated() {
        const data = await this._request(
            `/api/next-unannotated?current_patient=${this.patientId}&current_image=${this.imageName}`
        );
        return data.patient && data.image ? data : null;
    }

    /**
     * Propagate annotations to next unannotated image
     * @param {Object} annotations - Annotations to propagate
     */
    async propagateAnnotations(annotations) {
        return this._request('/api/propagate-annotations', {
            method: 'POST',
            body: JSON.stringify({
                current_patient: this.patientId,
                current_image: this.imageName,
                annotations
            })
        });
    }

    // === Export Operations ===

    /**
     * Export annotations in specified format
     * @param {Array<string>} images - List of image keys (patient/filename)
     * @param {string} format - Export format ('json', 'csv', 'xml')
     * @returns {Promise<Blob>} Export file blob
     */
    async exportAnnotations(images, format = 'json') {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images, format })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new APIError(data.error || 'Export failed', response.status, data);
        }

        return response.blob();
    }
}

const api = new AnnotationAPI();

if (typeof window !== 'undefined') {
    window.AnnotationAPI = AnnotationAPI;
    window.api = api;
    window.APIError = APIError;
}
