/**
 * API client for annotation operations
 * @module annotations/api
 *
 * This module provides a clean interface for all annotation-related
 * API calls, with proper error handling and response normalization.
 */

// ============================================================================
// API Error Class
// ============================================================================

/**
 * Custom error class for API errors with status code and response data
 */
class AnnotationAPIError extends Error {
    /**
     * Create an API error
     * @param {string} message - Error message
     * @param {number} status - HTTP status code
     * @param {Object|null} response - Response data from server
     * @param {string} endpoint - The endpoint that failed
     */
    constructor(message, status, response = null, endpoint = '') {
        super(message);
        this.name = 'AnnotationAPIError';
        this.status = status;
        this.response = response;
        this.endpoint = endpoint;
    }
    
    /**
     * Check if this is a network error (no response)
     * @returns {boolean}
     */
    isNetworkError() {
        return this.status === 0;
    }
    
    /**
     * Check if this is a client error (4xx)
     * @returns {boolean}
     */
    isClientError() {
        return this.status >= 400 && this.status < 500;
    }
    
    /**
     * Check if this is a server error (5xx)
     * @returns {boolean}
     */
    isServerError() {
        return this.status >= 500;
    }
    
    /**
     * Check if this is a "not found" error
     * @returns {boolean}
     */
    isNotFound() {
        return this.status === 404;
    }
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Annotation API client
 * Provides methods for all annotation CRUD operations
 */
const AnnotationAPI = {
    /**
     * Base URL for API endpoints
     * @type {string}
     */
    baseUrl: '/api/annotations',
    
    /**
     * Default request timeout in milliseconds
     * @type {number}
     */
    timeout: 30000,
    
    // ========================================================================
    // Internal Helper Methods
    // ========================================================================
    
    /**
     * Make an API request with error handling
     * @private
     * @param {string} endpoint - API endpoint (relative to baseUrl)
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     * @throws {AnnotationAPIError}
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
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
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        config.signal = controller.signal;
        
        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);
            
            // Try to parse JSON response
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            if (!response.ok) {
                const errorMessage = typeof data === 'object' 
                    ? (data.message || data.error || 'Request failed')
                    : 'Request failed';
                throw new AnnotationAPIError(errorMessage, response.status, data, endpoint);
            }
            
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof AnnotationAPIError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                throw new AnnotationAPIError('Request timeout', 408, null, endpoint);
            }
            
            // Network error or other fetch failure
            throw new AnnotationAPIError(
                error.message || 'Network error',
                0,
                null,
                endpoint
            );
        }
    },
    
    /**
     * Build a query string from parameters
     * @private
     * @param {Object} params - Query parameters
     * @returns {string} Query string (with leading ?)
     */
    _buildQuery(params) {
        const filtered = Object.entries(params)
            .filter(([, value]) => value !== null && value !== undefined);
        
        if (filtered.length === 0) return '';
        
        const query = new URLSearchParams(filtered).toString();
        return `?${query}`;
    },
    
    /**
     * Encode a path segment for URL
     * @private
     * @param {string} segment - Path segment to encode
     * @returns {string} Encoded segment
     */
    _encodeSegment(segment) {
        return encodeURIComponent(segment);
    },
    
    // ========================================================================
    // Annotation Operations
    // ========================================================================
    
    /**
     * Get all annotations for an image
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @returns {Promise<Object>} Annotations keyed by label
     */
    async getAnnotations(patientId, imageName) {
        const endpoint = `/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}`;
        const response = await this._request(endpoint);
        return response.annotations || {};
    },
    
    /**
     * Save or update an annotation
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @param {string} label - Annotation label
     * @param {string} type - Annotation type (from AnnotationType)
     * @param {Object} data - Type-specific annotation data
     * @param {Object} [options={}] - Additional options
     * @param {string} [options.color] - Override color for this annotation
     * @param {string} [options.notes] - Notes or description
     * @param {Object} [options.metadata] - Additional metadata
     * @returns {Promise<Object>} Saved annotation data
     */
    async saveAnnotation(patientId, imageName, label, type, data, options = {}) {
        const endpoint = `/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}`;

        const payload = {
            label,
            type,
            data,
            ...options
        };
        
        return this._request(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },
    
    /**
     * Delete an annotation
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @param {string} label - Annotation label to delete
     * @returns {Promise<Object>} Deletion confirmation
     */
    async deleteAnnotation(patientId, imageName, label) {
        const endpoint = `/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}/${this._encodeSegment(label)}`;
        
        return this._request(endpoint, {
            method: 'DELETE'
        });
    },
    
    /**
     * Batch save multiple annotations
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @param {Object} annotations - Object of annotations keyed by label
     * @returns {Promise<Object>} Save results
     */
    async batchSaveAnnotations(patientId, imageName, annotations) {
        const endpoint = `/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}/bulk`;

        const operations = Object.entries(annotations).map(([label, ann]) => ({
            action: 'create',
            label,
            type: ann.type,
            data: ann.data,
            ...(ann.status && { status: ann.status }),
            ...(ann.color && { color: ann.color }),
            ...(ann.category && { category: ann.category })
        }));

        return this._request(endpoint, {
            method: 'POST',
            body: JSON.stringify({ operations })
        });
    },
    
    // ========================================================================
    // Label Operations
    // ========================================================================
    
    /**
     * Get all available labels
     * @param {Object} [options={}] - Filter options
     * @param {string} [options.category] - Filter by category
     * @param {boolean} [options.includeUsage] - Include usage statistics
     * @returns {Promise<Array>} Array of label objects
     */
    async getLabels(options = {}) {
        const query = this._buildQuery(options);
        const response = await this._request(`/labels${query}`);
        return response.labels || [];
    },
    
    /**
     * Create a new label
     * @param {string} name - Label name
     * @param {string} [category='default'] - Label category
     * @param {string} [color] - Label color (hex)
     * @param {Object} [metadata={}] - Additional metadata
     * @returns {Promise<Object>} Created label
     */
    async createLabel(name, category = 'default', color = null, metadata = {}) {
        return this._request('/labels', {
            method: 'POST',
            body: JSON.stringify({
                name,
                category,
                color,
                metadata
            })
        });
    },
    
    /**
     * Update an existing label
     * @param {string} name - Label name
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated label
     */
    async updateLabel(name, updates) {
        return this._request(`/labels/${this._encodeSegment(name)}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },
    
    /**
     * Delete a label
     * @param {string} name - Label name to delete
     * @param {boolean} [force=false] - Force delete even if in use
     * @returns {Promise<Object>} Deletion confirmation
     */
    async deleteLabel(name, force = false) {
        const query = force ? '?force=true' : '';
        return this._request(`/labels/${this._encodeSegment(name)}${query}`, {
            method: 'DELETE'
        });
    },
    
    // ========================================================================
    // Calibration Operations
    // ========================================================================
    
    /**
     * Get calibration data for an image
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @returns {Promise<Object>} Calibration data
     */
    async getCalibration(patientId, imageName) {
        const endpoint = `/calibration/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}`;
        return this._request(endpoint);
    },
    
    /**
     * Set calibration for an image
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @param {number} pixelsPerMm - Pixels per millimeter
     * @param {Object} [options={}] - Additional options
     * @param {Object} [options.referencePoints] - Points used for calibration
     * @param {number} [options.referenceLengthMm] - Known reference length in mm
     * @returns {Promise<Object>} Saved calibration
     */
    async setCalibration(patientId, imageName, pixelsPerMm, options = {}) {
        const endpoint = `/calibration/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}`;
        
        return this._request(endpoint, {
            method: 'PUT',
            body: JSON.stringify({
                pixelsPerMm,
                ...options,
                timestamp: new Date().toISOString()
            })
        });
    },
    
    // ========================================================================
    // Image & Navigation Operations
    // ========================================================================
    
    /**
     * Get image metadata
     * @param {string} patientId - Patient identifier
     * @param {string} imageName - Image filename
     * @returns {Promise<Object>} Image metadata
     */
    async getImageMetadata(patientId, imageName) {
        const endpoint = `/images/${this._encodeSegment(patientId)}/${this._encodeSegment(imageName)}/metadata`;
        return this._request(endpoint);
    },
    
    /**
     * Get the next unannotated image
     * @param {string} [currentPatient] - Current patient ID
     * @param {string} [currentImage] - Current image name
     * @returns {Promise<{patient: string, image: string}|null>} Next image or null
     */
    async getNextUnannotated(currentPatient = null, currentImage = null) {
        const params = new URLSearchParams();
        if (currentPatient) params.set('current_patient', currentPatient);
        if (currentImage) params.set('current_image', currentImage);
        const query = params.toString() ? `?${params.toString()}` : '';

        const response = await fetch(`/api/next-unannotated${query}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.patient && data.image) {
            return { patient: data.patient, image: data.image };
        }
        return null;
    },
    
    // ========================================================================
    // Export Operations
    // ========================================================================
    
    /**
     * Export annotations
     * @param {Array<string>} images - List of image keys (patient/filename)
     * @param {string} [format='json'] - Export format
     * @param {Object} [options={}] - Export options
     * @returns {Promise<Blob>} Export file blob
     */
    async exportAnnotations(images, format = 'json', options = {}) {
        const url = `${this.baseUrl}/export`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images,
                format,
                ...options
            })
        });
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new AnnotationAPIError(
                data.error || 'Export failed',
                response.status,
                data,
                '/export'
            );
        }
        
        return response.blob();
    }
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.AnnotationAPI = AnnotationAPI;
    window.AnnotationAPIError = AnnotationAPIError;
}
