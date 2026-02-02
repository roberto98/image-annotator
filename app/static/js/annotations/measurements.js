/**
 * Measurement utilities for annotations
 * @module annotations/measurements
 * 
 * This module provides functions for calculating and formatting
 * measurements for various annotation types.
 */

// ============================================================================
// Measurement Calculator
// ============================================================================

/**
 * Measurement utilities for annotations
 */
const Measurements = {
    // ========================================================================
    // Distance & Length Calculations
    // ========================================================================
    
    /**
     * Calculate the distance between two points in pixels
     * @param {{x: number, y: number}} start - Start point
     * @param {{x: number, y: number}} end - End point
     * @returns {number} Distance in pixels
     */
    lineLength(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    /**
     * Calculate the squared distance between two points (faster, no sqrt)
     * @param {{x: number, y: number}} start - Start point
     * @param {{x: number, y: number}} end - End point
     * @returns {number} Squared distance
     */
    lineLengthSquared(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return dx * dx + dy * dy;
    },
    
    /**
     * Calculate the midpoint of a line
     * @param {{x: number, y: number}} start - Start point
     * @param {{x: number, y: number}} end - End point
     * @returns {{x: number, y: number}} Midpoint
     */
    lineMidpoint(start, end) {
        return {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2
        };
    },
    
    /**
     * Calculate the angle of a line in radians (from horizontal)
     * @param {{x: number, y: number}} start - Start point
     * @param {{x: number, y: number}} end - End point
     * @returns {number} Angle in radians
     */
    lineAngleRadians(start, end) {
        return Math.atan2(end.y - start.y, end.x - start.x);
    },
    
    /**
     * Calculate the angle of a line in degrees (from horizontal)
     * @param {{x: number, y: number}} start - Start point
     * @param {{x: number, y: number}} end - End point
     * @returns {number} Angle in degrees
     */
    lineAngleDegrees(start, end) {
        return this.lineAngleRadians(start, end) * (180 / Math.PI);
    },
    
    // ========================================================================
    // Angle Calculations
    // ========================================================================
    
    /**
     * Calculate the angle at a vertex formed by three points
     * @param {{x: number, y: number}} point1 - First arm point
     * @param {{x: number, y: number}} vertex - Vertex point (angle measured here)
     * @param {{x: number, y: number}} point2 - Second arm point
     * @returns {number} Angle in degrees (0-180)
     */
    angle(point1, vertex, point2) {
        // Vector from vertex to point1
        const v1x = point1.x - vertex.x;
        const v1y = point1.y - vertex.y;
        
        // Vector from vertex to point2
        const v2x = point2.x - vertex.x;
        const v2y = point2.y - vertex.y;
        
        // Dot product
        const dot = v1x * v2x + v1y * v2y;
        
        // Magnitudes
        const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
        
        // Avoid division by zero
        if (mag1 === 0 || mag2 === 0) {
            return 0;
        }
        
        // Angle in radians (clamp to [-1, 1] for acos)
        const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        const radians = Math.acos(cosAngle);
        
        // Convert to degrees
        return radians * (180 / Math.PI);
    },
    
    /**
     * Calculate the signed angle (considering direction)
     * @param {{x: number, y: number}} point1 - First arm point
     * @param {{x: number, y: number}} vertex - Vertex point
     * @param {{x: number, y: number}} point2 - Second arm point
     * @returns {number} Signed angle in degrees (-180 to 180)
     */
    signedAngle(point1, vertex, point2) {
        const angle1 = Math.atan2(point1.y - vertex.y, point1.x - vertex.x);
        const angle2 = Math.atan2(point2.y - vertex.y, point2.x - vertex.x);
        
        let diff = (angle2 - angle1) * (180 / Math.PI);
        
        // Normalize to -180 to 180
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        
        return diff;
    },
    
    // ========================================================================
    // Circle Calculations
    // ========================================================================
    
    /**
     * Calculate circle radius from center to edge point
     * @param {{x: number, y: number}} center - Center point
     * @param {{x: number, y: number}} edgePoint - Point on the edge
     * @returns {number} Radius in pixels
     */
    circleRadius(center, edgePoint) {
        return this.lineLength(center, edgePoint);
    },
    
    /**
     * Calculate circle diameter
     * @param {{x: number, y: number}} center - Center point
     * @param {{x: number, y: number}} edgePoint - Point on the edge
     * @returns {number} Diameter in pixels
     */
    circleDiameter(center, edgePoint) {
        return this.circleRadius(center, edgePoint) * 2;
    },
    
    /**
     * Calculate circle circumference
     * @param {number} radius - Radius in pixels
     * @returns {number} Circumference in pixels
     */
    circleCircumference(radius) {
        return 2 * Math.PI * radius;
    },
    
    /**
     * Calculate circle area
     * @param {number} radius - Radius in pixels
     * @returns {number} Area in square pixels
     */
    circleArea(radius) {
        return Math.PI * radius * radius;
    },
    
    // ========================================================================
    // Rectangle Calculations
    // ========================================================================
    
    /**
     * Calculate rectangle dimensions from two corner points
     * @param {{x: number, y: number}} corner1 - First corner
     * @param {{x: number, y: number}} corner2 - Opposite corner
     * @returns {{width: number, height: number, area: number, perimeter: number}}
     */
    rectangleDimensions(corner1, corner2) {
        const width = Math.abs(corner2.x - corner1.x);
        const height = Math.abs(corner2.y - corner1.y);
        
        return {
            width,
            height,
            area: width * height,
            perimeter: 2 * (width + height)
        };
    },
    
    /**
     * Calculate rectangle center from two corner points
     * @param {{x: number, y: number}} corner1 - First corner
     * @param {{x: number, y: number}} corner2 - Opposite corner
     * @returns {{x: number, y: number}} Center point
     */
    rectangleCenter(corner1, corner2) {
        return {
            x: (corner1.x + corner2.x) / 2,
            y: (corner1.y + corner2.y) / 2
        };
    },
    
    // ========================================================================
    // Polygon Calculations
    // ========================================================================
    
    /**
     * Calculate polygon perimeter
     * @param {Array<{x: number, y: number}>} points - Polygon vertices
     * @param {boolean} [closed=true] - Whether to include edge from last to first point
     * @returns {number} Perimeter in pixels
     */
    polygonPerimeter(points, closed = true) {
        if (points.length < 2) return 0;
        
        let perimeter = 0;
        for (let i = 0; i < points.length - 1; i++) {
            perimeter += this.lineLength(points[i], points[i + 1]);
        }
        
        if (closed && points.length > 2) {
            perimeter += this.lineLength(points[points.length - 1], points[0]);
        }
        
        return perimeter;
    },
    
    /**
     * Calculate polygon area using the Shoelace formula
     * @param {Array<{x: number, y: number}>} points - Polygon vertices
     * @returns {number} Area in square pixels (always positive)
     */
    polygonArea(points) {
        if (points.length < 3) return 0;
        
        let area = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        
        return Math.abs(area) / 2;
    },
    
    /**
     * Calculate polygon centroid (center of mass)
     * @param {Array<{x: number, y: number}>} points - Polygon vertices
     * @returns {{x: number, y: number}} Centroid
     */
    polygonCentroid(points) {
        if (points.length === 0) return { x: 0, y: 0 };
        if (points.length === 1) return { ...points[0] };
        if (points.length === 2) return this.lineMidpoint(points[0], points[1]);
        
        let cx = 0, cy = 0;
        let area = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const cross = points[i].x * points[j].y - points[j].x * points[i].y;
            area += cross;
            cx += (points[i].x + points[j].x) * cross;
            cy += (points[i].y + points[j].y) * cross;
        }
        
        area /= 2;
        
        if (Math.abs(area) < 1e-10) {
            // Degenerate polygon, use simple average
            const sumX = points.reduce((sum, p) => sum + p.x, 0);
            const sumY = points.reduce((sum, p) => sum + p.y, 0);
            return { x: sumX / n, y: sumY / n };
        }
        
        const factor = 1 / (6 * area);
        return {
            x: cx * factor,
            y: cy * factor
        };
    },
    
    /**
     * Calculate bounding box of points
     * @param {Array<{x: number, y: number}>} points - Array of points
     * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
     */
    boundingBox(points) {
        if (points.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const point of points) {
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.y > maxY) maxY = point.y;
        }
        
        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    },
    
    // ========================================================================
    // Unit Conversion
    // ========================================================================
    
    /**
     * Convert pixels to real-world units (mm)
     * @param {number} pixels - Value in pixels
     * @param {number} pixelsPerMm - Calibration factor
     * @returns {number|null} Value in mm, or null if not calibrated
     */
    toRealUnits(pixels, pixelsPerMm) {
        if (!pixelsPerMm || pixelsPerMm <= 0) return null;
        return pixels / pixelsPerMm;
    },
    
    /**
     * Convert real-world units (mm) to pixels
     * @param {number} mm - Value in millimeters
     * @param {number} pixelsPerMm - Calibration factor
     * @returns {number|null} Value in pixels, or null if not calibrated
     */
    toPixels(mm, pixelsPerMm) {
        if (!pixelsPerMm || pixelsPerMm <= 0) return null;
        return mm * pixelsPerMm;
    },
    
    /**
     * Convert square pixels to square millimeters
     * @param {number} squarePixels - Area in square pixels
     * @param {number} pixelsPerMm - Calibration factor
     * @returns {number|null} Area in mm², or null if not calibrated
     */
    toRealArea(squarePixels, pixelsPerMm) {
        if (!pixelsPerMm || pixelsPerMm <= 0) return null;
        return squarePixels / (pixelsPerMm * pixelsPerMm);
    },
    
    // ========================================================================
    // Formatting
    // ========================================================================
    
    /**
     * Format a length measurement for display
     * @param {number} pixels - Length in pixels
     * @param {number} [pixelsPerMm] - Optional calibration factor
     * @param {Object} [options] - Formatting options
     * @param {number} [options.pixelDecimals=1] - Decimal places for pixels
     * @param {number} [options.mmDecimals=2] - Decimal places for mm
     * @returns {string} Formatted measurement string
     */
    formatLength(pixels, pixelsPerMm = null, options = {}) {
        const { pixelDecimals = 1, mmDecimals = 2 } = options;
        const px = pixels.toFixed(pixelDecimals);
        
        if (pixelsPerMm && pixelsPerMm > 0) {
            const mm = (pixels / pixelsPerMm).toFixed(mmDecimals);
            return `${px}px (${mm}mm)`;
        }
        
        return `${px}px`;
    },
    
    /**
     * Format an area measurement for display
     * @param {number} squarePixels - Area in square pixels
     * @param {number} [pixelsPerMm] - Optional calibration factor
     * @param {Object} [options] - Formatting options
     * @returns {string} Formatted area string
     */
    formatArea(squarePixels, pixelsPerMm = null, options = {}) {
        const { pixelDecimals = 1, mmDecimals = 2 } = options;
        const px = squarePixels.toFixed(pixelDecimals);
        
        if (pixelsPerMm && pixelsPerMm > 0) {
            const mm2 = (squarePixels / (pixelsPerMm * pixelsPerMm)).toFixed(mmDecimals);
            return `${px}px² (${mm2}mm²)`;
        }
        
        return `${px}px²`;
    },
    
    /**
     * Format an angle measurement for display
     * @param {number} degrees - Angle in degrees
     * @param {Object} [options] - Formatting options
     * @param {number} [options.decimals=1] - Decimal places
     * @returns {string} Formatted angle string
     */
    formatAngle(degrees, options = {}) {
        const { decimals = 1 } = options;
        return `${degrees.toFixed(decimals)}°`;
    },
    
    /**
     * Format coordinates for display
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} [options] - Formatting options
     * @param {number} [options.decimals=0] - Decimal places
     * @returns {string} Formatted coordinate string
     */
    formatCoordinates(x, y, options = {}) {
        const { decimals = 0 } = options;
        return `(${x.toFixed(decimals)}, ${y.toFixed(decimals)})`;
    },
    
    // ========================================================================
    // Measurement Helpers for Annotation Types
    // ========================================================================
    
    /**
     * Get all measurements for a line annotation
     * @param {{start: {x, y}, end: {x, y}}} data - Line data
     * @param {number} [pixelsPerMm] - Optional calibration
     * @returns {Object} Measurements object
     */
    measureLine(data, pixelsPerMm = null) {
        const length = this.lineLength(data.start, data.end);
        const midpoint = this.lineMidpoint(data.start, data.end);
        const angle = this.lineAngleDegrees(data.start, data.end);
        
        return {
            length,
            lengthMm: this.toRealUnits(length, pixelsPerMm),
            midpoint,
            angle,
            formatted: {
                length: this.formatLength(length, pixelsPerMm),
                angle: this.formatAngle(angle)
            }
        };
    },
    
    /**
     * Get all measurements for a circle annotation
     * @param {{center: {x, y}, radius: number}} data - Circle data
     * @param {number} [pixelsPerMm] - Optional calibration
     * @returns {Object} Measurements object
     */
    measureCircle(data, pixelsPerMm = null) {
        const radius = data.radius;
        const diameter = radius * 2;
        const circumference = this.circleCircumference(radius);
        const area = this.circleArea(radius);
        
        return {
            radius,
            radiusMm: this.toRealUnits(radius, pixelsPerMm),
            diameter,
            diameterMm: this.toRealUnits(diameter, pixelsPerMm),
            circumference,
            circumferenceMm: this.toRealUnits(circumference, pixelsPerMm),
            area,
            areaMm2: this.toRealArea(area, pixelsPerMm),
            formatted: {
                radius: this.formatLength(radius, pixelsPerMm),
                diameter: this.formatLength(diameter, pixelsPerMm),
                circumference: this.formatLength(circumference, pixelsPerMm),
                area: this.formatArea(area, pixelsPerMm)
            }
        };
    },
    
    /**
     * Get all measurements for a rectangle annotation
     * @param {{topLeft: {x, y}, bottomRight: {x, y}}|{center: {x, y}, width: number, height: number}} data - Rectangle data
     * @param {number} [pixelsPerMm] - Optional calibration
     * @returns {Object} Measurements object
     */
    measureRectangle(data, pixelsPerMm = null) {
        let width, height, center;
        
        if (data.topLeft && data.bottomRight) {
            const dims = this.rectangleDimensions(data.topLeft, data.bottomRight);
            width = dims.width;
            height = dims.height;
            center = this.rectangleCenter(data.topLeft, data.bottomRight);
        } else {
            width = data.width;
            height = data.height;
            center = data.center;
        }
        
        const area = width * height;
        const perimeter = 2 * (width + height);
        const diagonal = Math.sqrt(width * width + height * height);
        
        return {
            width,
            widthMm: this.toRealUnits(width, pixelsPerMm),
            height,
            heightMm: this.toRealUnits(height, pixelsPerMm),
            area,
            areaMm2: this.toRealArea(area, pixelsPerMm),
            perimeter,
            perimeterMm: this.toRealUnits(perimeter, pixelsPerMm),
            diagonal,
            diagonalMm: this.toRealUnits(diagonal, pixelsPerMm),
            center,
            formatted: {
                width: this.formatLength(width, pixelsPerMm),
                height: this.formatLength(height, pixelsPerMm),
                area: this.formatArea(area, pixelsPerMm),
                perimeter: this.formatLength(perimeter, pixelsPerMm)
            }
        };
    },
    
    /**
     * Get all measurements for a polygon annotation
     * @param {{points: Array<{x, y}>}} data - Polygon data
     * @param {number} [pixelsPerMm] - Optional calibration
     * @returns {Object} Measurements object
     */
    measurePolygon(data, pixelsPerMm = null) {
        const points = data.points;
        const perimeter = this.polygonPerimeter(points, true);
        const area = this.polygonArea(points);
        const centroid = this.polygonCentroid(points);
        const bbox = this.boundingBox(points);
        
        return {
            vertexCount: points.length,
            perimeter,
            perimeterMm: this.toRealUnits(perimeter, pixelsPerMm),
            area,
            areaMm2: this.toRealArea(area, pixelsPerMm),
            centroid,
            boundingBox: bbox,
            formatted: {
                perimeter: this.formatLength(perimeter, pixelsPerMm),
                area: this.formatArea(area, pixelsPerMm)
            }
        };
    },
    
    /**
     * Get all measurements for an angle annotation
     * @param {{point1: {x, y}, vertex: {x, y}, point2: {x, y}}} data - Angle data
     * @param {number} [pixelsPerMm] - Optional calibration
     * @returns {Object} Measurements object
     */
    measureAngle(data, pixelsPerMm = null) {
        const angle = this.angle(data.point1, data.vertex, data.point2);
        const arm1Length = this.lineLength(data.vertex, data.point1);
        const arm2Length = this.lineLength(data.vertex, data.point2);
        
        return {
            angle,
            arm1Length,
            arm1LengthMm: this.toRealUnits(arm1Length, pixelsPerMm),
            arm2Length,
            arm2LengthMm: this.toRealUnits(arm2Length, pixelsPerMm),
            formatted: {
                angle: this.formatAngle(angle),
                arm1Length: this.formatLength(arm1Length, pixelsPerMm),
                arm2Length: this.formatLength(arm2Length, pixelsPerMm)
            }
        };
    }
};

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.Measurements = Measurements;
}
