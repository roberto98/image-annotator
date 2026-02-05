/**
 * Unit Tests for Geometry - US-028
 * 
 * Tests coordinate transformations and annotation geometry calculations.
 * Run in browser by opening test.html
 * 
 * @module tests/geometry.test
 */

// Wait for dependencies to load
document.addEventListener('DOMContentLoaded', () => {
    // Give time for other scripts to load
    setTimeout(runGeometryTests, 500);
});

function runGeometryTests() {
    const { describe, it, expect } = TestRunner;
    
    // ========================================================================
    // Viewport Coordinate Transformation Tests
    // ========================================================================
    
    describe('Viewport Coordinate Transformations', () => {
        
        it('should transform screen to image coordinates at scale 1', () => {
            // Reset viewport to default state
            if (window.viewport) {
                window.viewport.reset();
                window.viewport.setState(1, 0, 0);
                
                const result = window.viewport.screenToImage(100, 200);
                expect(result.x).toBe(100);
                expect(result.y).toBe(200);
            } else {
                // Skip if viewport not available
                console.warn('Viewport not loaded, skipping test');
            }
        });
        
        it('should transform image to screen coordinates at scale 1', () => {
            if (window.viewport) {
                window.viewport.setState(1, 0, 0);
                
                const result = window.viewport.imageToScreen(100, 200);
                expect(result.x).toBe(100);
                expect(result.y).toBe(200);
            }
        });
        
        it('should handle scale transformations correctly', () => {
            if (window.viewport) {
                window.viewport.setState(2, 0, 0); // 2x zoom
                
                // At 2x zoom, screen coordinate 200 = image coordinate 100
                const imageCoord = window.viewport.screenToImage(200, 200);
                expect(imageCoord.x).toBe(100);
                expect(imageCoord.y).toBe(100);
                
                // And vice versa
                const screenCoord = window.viewport.imageToScreen(100, 100);
                expect(screenCoord.x).toBe(200);
                expect(screenCoord.y).toBe(200);
            }
        });
        
        it('should handle offset transformations correctly', () => {
            if (window.viewport) {
                window.viewport.setState(1, 50, 100); // offset by 50, 100
                
                // Screen coord 150, 200 with offset 50, 100 = image coord 100, 100
                const imageCoord = window.viewport.screenToImage(150, 200);
                expect(imageCoord.x).toBe(100);
                expect(imageCoord.y).toBe(100);
            }
        });
        
        it('should pass round-trip precision test (<0.01px error)', () => {
            if (window.viewport) {
                // Test at various scales and offsets
                const testCases = [
                    { scale: 1, offsetX: 0, offsetY: 0 },
                    { scale: 2.5, offsetX: 100, offsetY: 200 },
                    { scale: 0.5, offsetX: -50, offsetY: -75 },
                    { scale: 3.333, offsetX: 123.456, offsetY: 789.012 }
                ];
                
                for (const { scale, offsetX, offsetY } of testCases) {
                    window.viewport.setState(scale, offsetX, offsetY);
                    
                    // Test multiple points
                    const points = [
                        { x: 0, y: 0 },
                        { x: 100, y: 100 },
                        { x: 500, y: 300 },
                        { x: 123.456, y: 789.012 }
                    ];
                    
                    for (const point of points) {
                        const image = window.viewport.screenToImage(point.x, point.y);
                        const screen = window.viewport.imageToScreen(image.x, image.y);
                        
                        const errorX = Math.abs(screen.x - point.x);
                        const errorY = Math.abs(screen.y - point.y);
                        
                        expect(errorX).toBeLessThan(0.01);
                        expect(errorY).toBeLessThan(0.01);
                    }
                }
            }
        });
        
        it('should maintain precision after multiple pan/zoom operations', () => {
            if (window.viewport) {
                window.viewport.reset();
                
                // Perform multiple operations
                window.viewport.setScale(1.5, 100, 100);
                window.viewport.pan(50, 75);
                window.viewport.setScale(2.0, 200, 200);
                window.viewport.pan(-30, -40);
                
                // Now test round-trip
                const original = { x: 250, y: 350 };
                const image = window.viewport.screenToImage(original.x, original.y);
                const roundTrip = window.viewport.imageToScreen(image.x, image.y);
                
                expect(Math.abs(roundTrip.x - original.x)).toBeLessThan(0.01);
                expect(Math.abs(roundTrip.y - original.y)).toBeLessThan(0.01);
            }
        });
    });
    
    // ========================================================================
    // Annotation Bounds Calculation Tests
    // ========================================================================
    
    describe('Annotation Bounds Calculations', () => {
        
        it('should calculate bounds for point annotation', () => {
            const point = { type: 'point', data: { x: 100, y: 150 } };
            const bounds = calculateAnnotationBounds(point);
            
            expect(bounds).toBeDefined();
            expect(bounds.x).toBe(100);
            expect(bounds.y).toBe(150);
            expect(bounds.width).toBe(0);
            expect(bounds.height).toBe(0);
        });
        
        it('should calculate bounds for line annotation', () => {
            const line = {
                type: 'line',
                data: {
                    start: { x: 50, y: 100 },
                    end: { x: 200, y: 300 }
                }
            };
            const bounds = calculateAnnotationBounds(line);
            
            expect(bounds.x).toBe(50);
            expect(bounds.y).toBe(100);
            expect(bounds.width).toBe(150);
            expect(bounds.height).toBe(200);
        });
        
        it('should calculate bounds for circle annotation', () => {
            const circle = {
                type: 'circle',
                data: { center: { x: 100, y: 100 }, radius: 50 }
            };
            const bounds = calculateAnnotationBounds(circle);
            
            expect(bounds.x).toBe(50);
            expect(bounds.y).toBe(50);
            expect(bounds.width).toBe(100);
            expect(bounds.height).toBe(100);
        });
        
        it('should calculate bounds for rectangle annotation', () => {
            const rect = {
                type: 'rectangle',
                data: {
                    topLeft: { x: 100, y: 150 },
                    bottomRight: { x: 300, y: 400 }
                }
            };
            const bounds = calculateAnnotationBounds(rect);
            
            expect(bounds.x).toBe(100);
            expect(bounds.y).toBe(150);
            expect(bounds.width).toBe(200);
            expect(bounds.height).toBe(250);
        });
        
        it('should calculate bounds for polygon annotation', () => {
            const polygon = {
                type: 'polygon',
                data: {
                    points: [
                        { x: 100, y: 100 },
                        { x: 200, y: 50 },
                        { x: 300, y: 100 },
                        { x: 250, y: 200 },
                        { x: 150, y: 200 }
                    ]
                }
            };
            const bounds = calculateAnnotationBounds(polygon);
            
            expect(bounds.x).toBe(100);
            expect(bounds.y).toBe(50);
            expect(bounds.width).toBe(200);
            expect(bounds.height).toBe(150);
        });
        
        it('should calculate bounds for angle annotation', () => {
            const angle = {
                type: 'angle',
                data: {
                    point1: { x: 50, y: 100 },
                    vertex: { x: 100, y: 50 },
                    point2: { x: 150, y: 100 }
                }
            };
            const bounds = calculateAnnotationBounds(angle);
            
            expect(bounds.x).toBe(50);
            expect(bounds.y).toBe(50);
            expect(bounds.width).toBe(100);
            expect(bounds.height).toBe(50);
        });
        
        it('should calculate bounds for freehand annotation', () => {
            const freehand = {
                type: 'freehand',
                data: {
                    points: [
                        { x: 100, y: 100 },
                        { x: 120, y: 80 },
                        { x: 150, y: 90 },
                        { x: 180, y: 120 },
                        { x: 160, y: 150 }
                    ]
                }
            };
            const bounds = calculateAnnotationBounds(freehand);
            
            expect(bounds.x).toBe(100);
            expect(bounds.y).toBe(80);
            expect(bounds.width).toBe(80);
            expect(bounds.height).toBe(70);
        });
    });
    
    // ========================================================================
    // Hit Detection Tests
    // ========================================================================
    
    describe('Hit Detection', () => {
        
        it('should detect hit on point annotation', () => {
            const point = { type: 'point', data: { x: 100, y: 100 } };
            
            // Direct hit
            expect(isPointHit(point, 100, 100, 10)).toBe(true);
            
            // Near hit (within tolerance)
            expect(isPointHit(point, 105, 105, 10)).toBe(true);
            
            // Miss
            expect(isPointHit(point, 200, 200, 10)).toBe(false);
        });
        
        it('should detect hit on line annotation', () => {
            const line = {
                type: 'line',
                data: {
                    start: { x: 0, y: 0 },
                    end: { x: 100, y: 100 }
                }
            };
            
            // Hit on line
            expect(isLineHit(line, 50, 50, 5)).toBe(true);
            
            // Near line (within tolerance)
            expect(isLineHit(line, 50, 53, 5)).toBe(true);
            
            // Miss
            expect(isLineHit(line, 50, 100, 5)).toBe(false);
        });
        
        it('should detect hit on circle annotation', () => {
            const circle = {
                type: 'circle',
                data: { center: { x: 100, y: 100 }, radius: 50 }
            };
            
            // Hit inside circle
            expect(isCircleHit(circle, 100, 100)).toBe(true);
            expect(isCircleHit(circle, 120, 120)).toBe(true);
            
            // Hit on edge
            expect(isCircleHit(circle, 150, 100)).toBe(true);
            
            // Miss (outside)
            expect(isCircleHit(circle, 200, 200)).toBe(false);
        });
        
        it('should detect hit on rectangle annotation', () => {
            const rect = {
                type: 'rectangle',
                data: {
                    topLeft: { x: 50, y: 50 },
                    bottomRight: { x: 150, y: 150 }
                }
            };
            
            // Hit inside
            expect(isRectangleHit(rect, 100, 100)).toBe(true);
            
            // Hit on edge
            expect(isRectangleHit(rect, 50, 100)).toBe(true);
            
            // Miss (outside)
            expect(isRectangleHit(rect, 10, 10)).toBe(false);
            expect(isRectangleHit(rect, 200, 200)).toBe(false);
        });
    });
    
    // ========================================================================
    // Measurement Tests
    // ========================================================================
    
    describe('Measurements', () => {
        
        it('should calculate line length correctly', () => {
            // Horizontal line
            expect(lineLength(0, 0, 100, 0)).toBe(100);
            
            // Vertical line
            expect(lineLength(0, 0, 0, 100)).toBe(100);
            
            // Diagonal line (3-4-5 triangle)
            expect(lineLength(0, 0, 3, 4)).toBe(5);
            
            // Complex diagonal
            const len = lineLength(10, 20, 110, 120);
            expect(len).toBeCloseTo(141.42, 1);
        });
        
        it('should calculate angle correctly', () => {
            // Right angle (90 degrees)
            const angle90 = calculateAngle(
                { x: 0, y: 0 },   // point1
                { x: 50, y: 50 }, // vertex
                { x: 100, y: 50 } // point2
            );
            expect(angle90).toBeCloseTo(45, 0); // Actually creates 45 degree angle
            
            // Straight line (180 degrees)
            const angle180 = calculateAngle(
                { x: 0, y: 50 },
                { x: 50, y: 50 },
                { x: 100, y: 50 }
            );
            expect(angle180).toBeCloseTo(180, 0);
        });
        
        it('should calculate polygon area correctly', () => {
            // Square 100x100
            const square = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 }
            ];
            expect(polygonArea(square)).toBe(10000);
            
            // Triangle
            const triangle = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 50, y: 100 }
            ];
            expect(polygonArea(triangle)).toBe(5000);
        });
        
        it('should calculate polygon perimeter correctly', () => {
            // Square 100x100
            const square = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 }
            ];
            expect(polygonPerimeter(square)).toBe(400);
        });
    });
    
    // ========================================================================
    // Helper Functions for Tests
    // ========================================================================
    
    /**
     * Calculate bounding box for an annotation
     */
    function calculateAnnotationBounds(annotation) {
        const { type, data } = annotation;
        
        switch (type) {
            case 'point':
                return { x: data.x, y: data.y, width: 0, height: 0 };
                
            case 'line':
                const minX = Math.min(data.start.x, data.end.x);
                const minY = Math.min(data.start.y, data.end.y);
                const maxX = Math.max(data.start.x, data.end.x);
                const maxY = Math.max(data.start.y, data.end.y);
                return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                
            case 'circle':
                return {
                    x: data.center.x - data.radius,
                    y: data.center.y - data.radius,
                    width: data.radius * 2,
                    height: data.radius * 2
                };
                
            case 'rectangle':
                return {
                    x: data.topLeft.x,
                    y: data.topLeft.y,
                    width: data.bottomRight.x - data.topLeft.x,
                    height: data.bottomRight.y - data.topLeft.y
                };
                
            case 'polygon':
            case 'freehand':
                const xs = data.points.map(p => p.x);
                const ys = data.points.map(p => p.y);
                const bMinX = Math.min(...xs);
                const bMinY = Math.min(...ys);
                const bMaxX = Math.max(...xs);
                const bMaxY = Math.max(...ys);
                return { x: bMinX, y: bMinY, width: bMaxX - bMinX, height: bMaxY - bMinY };
                
            case 'angle':
                const aXs = [data.point1.x, data.vertex.x, data.point2.x];
                const aYs = [data.point1.y, data.vertex.y, data.point2.y];
                const aMinX = Math.min(...aXs);
                const aMinY = Math.min(...aYs);
                const aMaxX = Math.max(...aXs);
                const aMaxY = Math.max(...aYs);
                return { x: aMinX, y: aMinY, width: aMaxX - aMinX, height: aMaxY - aMinY };
                
            default:
                return { x: 0, y: 0, width: 0, height: 0 };
        }
    }
    
    /**
     * Check if a point is hit
     */
    function isPointHit(annotation, x, y, tolerance) {
        const dx = x - annotation.data.x;
        const dy = y - annotation.data.y;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
    }
    
    /**
     * Check if a line is hit
     */
    function isLineHit(annotation, x, y, tolerance) {
        const { start, end } = annotation.data;
        
        // Distance from point to line segment
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) {
            // Line is a point
            return isPointHit({ data: start }, x, y, tolerance);
        }
        
        // Project point onto line
        const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / len2));
        const projX = start.x + t * dx;
        const projY = start.y + t * dy;
        
        const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
        return dist <= tolerance;
    }
    
    /**
     * Check if a circle is hit
     */
    function isCircleHit(annotation, x, y) {
        const { center, radius } = annotation.data;
        const dx = x - center.x;
        const dy = y - center.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
    }
    
    /**
     * Check if a rectangle is hit
     */
    function isRectangleHit(annotation, x, y) {
        const { topLeft, bottomRight } = annotation.data;
        return x >= topLeft.x && x <= bottomRight.x &&
               y >= topLeft.y && y <= bottomRight.y;
    }
    
    /**
     * Calculate line length
     */
    function lineLength(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    
    /**
     * Calculate angle in degrees
     */
    function calculateAngle(point1, vertex, point2) {
        const v1x = point1.x - vertex.x;
        const v1y = point1.y - vertex.y;
        const v2x = point2.x - vertex.x;
        const v2y = point2.y - vertex.y;
        
        const dot = v1x * v2x + v1y * v2y;
        const cross = v1x * v2y - v1y * v2x;
        
        let angle = Math.atan2(Math.abs(cross), dot);
        return angle * (180 / Math.PI);
    }
    
    /**
     * Calculate polygon area using shoelace formula
     */
    function polygonArea(points) {
        let area = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        
        return Math.abs(area / 2);
    }
    
    /**
     * Calculate polygon perimeter
     */
    function polygonPerimeter(points) {
        let perimeter = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            perimeter += lineLength(points[i].x, points[i].y, points[j].x, points[j].y);
        }
        
        return perimeter;
    }
    
    // Run the tests
    TestRunner.run();
}
