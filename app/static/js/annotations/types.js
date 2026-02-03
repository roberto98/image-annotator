/**
 * Annotation type definitions and type-specific utilities
 * @module annotations/types
 * 
 * This module defines all supported annotation types, their requirements,
 * and validation functions for annotation data.
 */

// ============================================================================
// Annotation Type Constants
// ============================================================================

/**
 * Supported annotation types
 * @enum {string}
 */
const AnnotationType = Object.freeze({
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    CIRCLE: 'circle',
    RECTANGLE: 'rectangle',
    ANGLE: 'angle'
});

/**
 * Number of clicks required to complete each annotation type
 * -1 indicates variable (closed by double-click, button, or drag-based)
 * @type {Object<string, number>}
 */
const ClicksRequired = Object.freeze({
    [AnnotationType.POINT]: 1,
    [AnnotationType.POLYGON]: -1,      // Variable, closed by double-click or button
    [AnnotationType.LINE]: 2,          // Start point, end point
    [AnnotationType.CIRCLE]: 2,        // Center, then edge point
    [AnnotationType.RECTANGLE]: 2,     // Two corners (or center + corner)
    [AnnotationType.ANGLE]: 3          // Point1, vertex, point2
});

/**
 * Human-readable display names for annotation types
 * @type {Object<string, string>}
 */
const TypeDisplayNames = Object.freeze({
    [AnnotationType.POINT]: 'Point',
    [AnnotationType.POLYGON]: 'Polygon',
    [AnnotationType.LINE]: 'Line',
    [AnnotationType.CIRCLE]: 'Circle',
    [AnnotationType.RECTANGLE]: 'Rectangle',
    [AnnotationType.ANGLE]: 'Angle'
});

/**
 * Default colors for annotation types (can be overridden by label colors)
 * @type {Object<string, string>}
 */
const TypeDefaultColors = Object.freeze({
    [AnnotationType.POINT]: '#ff0000',
    [AnnotationType.POLYGON]: '#00ff00',
    [AnnotationType.LINE]: '#0000ff',
    [AnnotationType.CIRCLE]: '#ffff00',
    [AnnotationType.RECTANGLE]: '#ff00ff',
    [AnnotationType.ANGLE]: '#00ffff'
});

// ============================================================================
// Type Validation Functions
// ============================================================================

/**
 * Validate that a value is a valid coordinate object
 * @param {*} coord - Value to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateCoordinate(coord) {
    if (coord === null || coord === undefined) {
        return { valid: false, error: 'Coordinate is null or undefined' };
    }
    
    if (typeof coord !== 'object') {
        return { valid: false, error: 'Coordinate must be an object' };
    }
    
    if (typeof coord.x !== 'number' || !Number.isFinite(coord.x)) {
        return { valid: false, error: 'Coordinate x must be a finite number' };
    }
    
    if (typeof coord.y !== 'number' || !Number.isFinite(coord.y)) {
        return { valid: false, error: 'Coordinate y must be a finite number' };
    }
    
    return { valid: true };
}

/**
 * Validate that a value is a valid array of coordinates
 * @param {*} points - Value to validate
 * @param {number} [minPoints=1] - Minimum number of points required
 * @returns {{valid: boolean, error?: string}}
 */
function validatePointsArray(points, minPoints = 1) {
    if (!Array.isArray(points)) {
        return { valid: false, error: 'Points must be an array' };
    }
    
    if (points.length < minPoints) {
        return { valid: false, error: `At least ${minPoints} point(s) required` };
    }
    
    for (let i = 0; i < points.length; i++) {
        const result = validateCoordinate(points[i]);
        if (!result.valid) {
            return { valid: false, error: `Invalid point at index ${i}: ${result.error}` };
        }
    }
    
    return { valid: true };
}

/**
 * Validate that a value is a positive number
 * @param {*} value - Value to validate
 * @param {string} [name='Value'] - Name for error messages
 * @returns {{valid: boolean, error?: string}}
 */
function validatePositiveNumber(value, name = 'Value') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { valid: false, error: `${name} must be a finite number` };
    }
    
    if (value <= 0) {
        return { valid: false, error: `${name} must be positive` };
    }
    
    return { valid: true };
}

/**
 * Validate annotation data based on its type
 * @param {string} type - Annotation type from AnnotationType
 * @param {Object} data - Annotation data to validate
 * @returns {{valid: boolean, error?: string, warnings?: string[]}}
 */
function validateAnnotationData(type, data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Annotation data must be an object' };
    }
    
    const warnings = [];
    
    switch (type) {
        case AnnotationType.POINT: {
            // Point requires: { x, y }
            const coordResult = validateCoordinate(data);
            if (!coordResult.valid) {
                return { valid: false, error: coordResult.error };
            }
            break;
        }
        
        case AnnotationType.LINE: {
            // Line requires: { start: {x, y}, end: {x, y} }
            if (!data.start || !data.end) {
                return { valid: false, error: 'Line requires start and end points' };
            }
            
            const startResult = validateCoordinate(data.start);
            if (!startResult.valid) {
                return { valid: false, error: `Invalid start point: ${startResult.error}` };
            }
            
            const endResult = validateCoordinate(data.end);
            if (!endResult.valid) {
                return { valid: false, error: `Invalid end point: ${endResult.error}` };
            }
            
            // Warn if line has zero length
            if (data.start.x === data.end.x && data.start.y === data.end.y) {
                warnings.push('Line has zero length');
            }
            break;
        }
        
        case AnnotationType.CIRCLE: {
            // Circle requires: { center: {x, y}, radius: number }
            if (!data.center) {
                return { valid: false, error: 'Circle requires a center point' };
            }
            
            const centerResult = validateCoordinate(data.center);
            if (!centerResult.valid) {
                return { valid: false, error: `Invalid center point: ${centerResult.error}` };
            }
            
            const radiusResult = validatePositiveNumber(data.radius, 'Radius');
            if (!radiusResult.valid) {
                return { valid: false, error: radiusResult.error };
            }
            break;
        }
        
        case AnnotationType.RECTANGLE: {
            // Rectangle requires: { topLeft: {x, y}, bottomRight: {x, y} }
            // OR: { center: {x, y}, width: number, height: number }
            if (data.topLeft && data.bottomRight) {
                const tlResult = validateCoordinate(data.topLeft);
                if (!tlResult.valid) {
                    return { valid: false, error: `Invalid topLeft: ${tlResult.error}` };
                }
                
                const brResult = validateCoordinate(data.bottomRight);
                if (!brResult.valid) {
                    return { valid: false, error: `Invalid bottomRight: ${brResult.error}` };
                }
            } else if (data.center && data.width !== undefined && data.height !== undefined) {
                const centerResult = validateCoordinate(data.center);
                if (!centerResult.valid) {
                    return { valid: false, error: `Invalid center: ${centerResult.error}` };
                }
                
                const widthResult = validatePositiveNumber(data.width, 'Width');
                if (!widthResult.valid) {
                    return { valid: false, error: widthResult.error };
                }
                
                const heightResult = validatePositiveNumber(data.height, 'Height');
                if (!heightResult.valid) {
                    return { valid: false, error: heightResult.error };
                }
            } else {
                return { valid: false, error: 'Rectangle requires either topLeft/bottomRight or center/width/height' };
            }
            break;
        }
        
        case AnnotationType.POLYGON: {
            // Polygon requires: { points: [{x, y}, ...] } with at least 3 points
            if (!data.points) {
                return { valid: false, error: 'Polygon requires points array' };
            }
            
            const pointsResult = validatePointsArray(data.points, 3);
            if (!pointsResult.valid) {
                return { valid: false, error: pointsResult.error };
            }
            break;
        }
        
        case AnnotationType.ANGLE: {
            // Angle requires: { point1: {x, y}, vertex: {x, y}, point2: {x, y} }
            if (!data.point1 || !data.vertex || !data.point2) {
                return { valid: false, error: 'Angle requires point1, vertex, and point2' };
            }
            
            const p1Result = validateCoordinate(data.point1);
            if (!p1Result.valid) {
                return { valid: false, error: `Invalid point1: ${p1Result.error}` };
            }
            
            const vertexResult = validateCoordinate(data.vertex);
            if (!vertexResult.valid) {
                return { valid: false, error: `Invalid vertex: ${vertexResult.error}` };
            }
            
            const p2Result = validateCoordinate(data.point2);
            if (!p2Result.valid) {
                return { valid: false, error: `Invalid point2: ${p2Result.error}` };
            }
            break;
        }
        
        default:
            return { valid: false, error: `Unknown annotation type: ${type}` };
    }
    
    const result = { valid: true };
    if (warnings.length > 0) {
        result.warnings = warnings;
    }
    return result;
}

// ============================================================================
// Type Utility Functions
// ============================================================================

/**
 * Check if a type is a valid annotation type
 * @param {string} type - Type to check
 * @returns {boolean}
 */
function isValidAnnotationType(type) {
    return Object.values(AnnotationType).includes(type);
}

/**
 * Get the number of clicks required for an annotation type
 * @param {string} type - Annotation type
 * @returns {number} Number of clicks, or -1 for variable
 */
function getClicksRequired(type) {
    return ClicksRequired[type] ?? -1;
}

/**
 * Check if an annotation type supports measurement display
 * @param {string} type - Annotation type
 * @returns {boolean}
 */
function supportsMeasurement(type) {
    return [
        AnnotationType.LINE,
        AnnotationType.CIRCLE,
        AnnotationType.RECTANGLE,
        AnnotationType.ANGLE,
        AnnotationType.POLYGON
    ].includes(type);
}

/**
 * Check if an annotation type is area-based (can show area measurement)
 * @param {string} type - Annotation type
 * @returns {boolean}
 */
function isAreaType(type) {
    return [
        AnnotationType.CIRCLE,
        AnnotationType.RECTANGLE,
        AnnotationType.POLYGON
    ].includes(type);
}

/**
 * Check if an annotation type is multi-point (variable number of points)
 * @param {string} type - Annotation type
 * @returns {boolean}
 */
function isMultiPointType(type) {
    return [
        AnnotationType.POLYGON
    ].includes(type);
}

/**
 * Get the display name for an annotation type
 * @param {string} type - Annotation type
 * @returns {string}
 */
function getTypeDisplayName(type) {
    return TypeDisplayNames[type] ?? type;
}

/**
 * Get the default color for an annotation type
 * @param {string} type - Annotation type
 * @returns {string} Hex color string
 */
function getTypeDefaultColor(type) {
    return TypeDefaultColors[type] ?? '#888888';
}

// ============================================================================
// Export to Global Scope
// ============================================================================

if (typeof window !== 'undefined') {
    window.AnnotationType = AnnotationType;
    window.ClicksRequired = ClicksRequired;
    window.TypeDisplayNames = TypeDisplayNames;
    window.TypeDefaultColors = TypeDefaultColors;
    
    window.validateAnnotationData = validateAnnotationData;
    window.validateCoordinate = validateCoordinate;
    window.validatePointsArray = validatePointsArray;
    window.validatePositiveNumber = validatePositiveNumber;
    
    window.isValidAnnotationType = isValidAnnotationType;
    window.getClicksRequired = getClicksRequired;
    window.supportsMeasurement = supportsMeasurement;
    window.isAreaType = isAreaType;
    window.isMultiPointType = isMultiPointType;
    window.getTypeDisplayName = getTypeDisplayName;
    window.getTypeDefaultColor = getTypeDefaultColor;
}
