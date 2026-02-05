/**
 * E2E Tests for Critical Paths - US-029
 * 
 * Tests end-to-end annotation workflows.
 * Run in browser by opening test.html
 * 
 * @module tests/e2e.test
 */

// Wait for dependencies to load
document.addEventListener('DOMContentLoaded', () => {
    // Give time for other scripts to load
    setTimeout(runE2ETests, 600);
});

function runE2ETests() {
    const { describe, it, expect } = TestRunner;
    
    // ========================================================================
    // E2E Test: Create Annotation -> Assign Label -> Verify Saved
    // ========================================================================
    
    describe('E2E: Annotation Creation Workflow', () => {
        
        it('should have AnnotationStore available', () => {
            expect(window.AnnotationStore).toBeDefined();
        });
        
        it('should create point annotation and store it', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const initialCount = Object.keys(store.state.annotations).length;
            
            // Create a test annotation
            const testLabel = `test_point_${Date.now()}`;
            store.setAnnotation(testLabel, {
                type: 'point',
                data: { x: 100, y: 200 },
                status: 'created'
            });
            
            // Verify it was stored
            const annotation = store.getAnnotation(testLabel);
            expect(annotation).toBeDefined();
            expect(annotation.type).toBe('point');
            expect(annotation.data.x).toBe(100);
            expect(annotation.data.y).toBe(200);
            
            // Cleanup
            store.removeAnnotation(testLabel);
        });
        
        it('should create line annotation with correct structure', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_line_${Date.now()}`;
            
            store.setAnnotation(testLabel, {
                type: 'line',
                data: {
                    start: { x: 50, y: 50 },
                    end: { x: 200, y: 150 }
                },
                status: 'created'
            });
            
            const annotation = store.getAnnotation(testLabel);
            expect(annotation.type).toBe('line');
            expect(annotation.data.start.x).toBe(50);
            expect(annotation.data.end.y).toBe(150);
            
            // Cleanup
            store.removeAnnotation(testLabel);
        });
        
        it('should create circle annotation with correct structure', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_circle_${Date.now()}`;
            
            store.setAnnotation(testLabel, {
                type: 'circle',
                data: {
                    center: { x: 100, y: 100 },
                    radius: 50
                },
                status: 'created'
            });
            
            const annotation = store.getAnnotation(testLabel);
            expect(annotation.type).toBe('circle');
            expect(annotation.data.center.x).toBe(100);
            expect(annotation.data.radius).toBe(50);
            
            // Cleanup
            store.removeAnnotation(testLabel);
        });
    });
    
    // ========================================================================
    // E2E Test: Pan/Zoom -> Create Annotation -> Coordinates in Image Space
    // ========================================================================
    
    describe('E2E: Pan/Zoom Coordinate Handling', () => {
        
        it('should maintain image coordinates independent of viewport state', () => {
            if (!window.AnnotationStore || !window.viewport) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_coords_${Date.now()}`;
            
            // Set up a zoomed and panned viewport
            window.viewport.setState(2.5, 100, 150);
            
            // Create annotation with image coordinates (not screen coordinates)
            const imageX = 250;
            const imageY = 300;
            
            store.setAnnotation(testLabel, {
                type: 'point',
                data: { x: imageX, y: imageY },
                status: 'created'
            });
            
            // Verify coordinates are stored as image coordinates
            const annotation = store.getAnnotation(testLabel);
            expect(annotation.data.x).toBe(imageX);
            expect(annotation.data.y).toBe(imageY);
            
            // Change viewport
            window.viewport.setState(1.0, 0, 0);
            
            // Coordinates should remain unchanged
            const annotationAfter = store.getAnnotation(testLabel);
            expect(annotationAfter.data.x).toBe(imageX);
            expect(annotationAfter.data.y).toBe(imageY);
            
            // Cleanup
            store.removeAnnotation(testLabel);
            window.viewport.reset();
        });
        
        it('should correctly convert screen to image coordinates at any zoom level', () => {
            if (!window.viewport) return;
            
            // Test at multiple zoom levels
            const zoomLevels = [0.5, 1.0, 2.0, 3.0];
            
            for (const zoom of zoomLevels) {
                window.viewport.setState(zoom, 0, 0);
                
                // A screen coordinate of (100, 100) at zoom level Z
                // should correspond to image coordinate (100/Z, 100/Z)
                const screenX = 100;
                const screenY = 100;
                
                const imageCoord = window.viewport.screenToImage(screenX, screenY);
                
                expect(imageCoord.x).toBeCloseTo(screenX / zoom, 1);
                expect(imageCoord.y).toBeCloseTo(screenY / zoom, 1);
            }
            
            window.viewport.reset();
        });
    });
    
    // ========================================================================
    // E2E Test: Select -> Delete -> Undo -> Annotation Restored
    // ========================================================================
    
    describe('E2E: Undo/Redo Workflow', () => {
        
        it('should restore deleted annotation with undo', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_undo_${Date.now()}`;
            
            // Create annotation
            store.setAnnotation(testLabel, {
                type: 'rectangle',
                data: {
                    topLeft: { x: 50, y: 50 },
                    bottomRight: { x: 150, y: 150 }
                },
                status: 'created'
            });
            
            // Verify it exists
            expect(store.getAnnotation(testLabel)).toBeDefined();
            
            // Delete it
            store.removeAnnotation(testLabel);
            
            // Verify it's gone
            expect(store.getAnnotation(testLabel)).toBeNull();
            
            // Undo
            const undoResult = store.undo();
            expect(undoResult).toBe(true);
            
            // Verify it's restored
            const restored = store.getAnnotation(testLabel);
            expect(restored).toBeDefined();
            expect(restored.type).toBe('rectangle');
            expect(restored.data.topLeft.x).toBe(50);
            
            // Cleanup - redo the delete and then undo the create
            store.redo();
            store.undo();
        });
        
        it('should support multiple undo operations', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const labels = [];
            
            // Create 3 annotations
            for (let i = 0; i < 3; i++) {
                const label = `test_multi_undo_${Date.now()}_${i}`;
                labels.push(label);
                store.setAnnotation(label, {
                    type: 'point',
                    data: { x: i * 100, y: i * 100 },
                    status: 'created'
                });
            }
            
            // Verify all exist
            expect(store.getAnnotation(labels[0])).toBeDefined();
            expect(store.getAnnotation(labels[1])).toBeDefined();
            expect(store.getAnnotation(labels[2])).toBeDefined();
            
            // Undo 3 times
            store.undo();
            expect(store.getAnnotation(labels[2])).toBeNull();
            
            store.undo();
            expect(store.getAnnotation(labels[1])).toBeNull();
            
            store.undo();
            expect(store.getAnnotation(labels[0])).toBeNull();
            
            // Redo once
            store.redo();
            expect(store.getAnnotation(labels[0])).toBeDefined();
        });
        
        it('should clear redo stack on new operation', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            
            // Create and delete
            const label1 = `test_redo_clear_1_${Date.now()}`;
            store.setAnnotation(label1, { type: 'point', data: { x: 0, y: 0 } });
            store.removeAnnotation(label1);
            
            // Undo - this puts the delete on redo stack
            store.undo();
            expect(store.canRedo()).toBe(true);
            
            // New operation - should clear redo stack
            const label2 = `test_redo_clear_2_${Date.now()}`;
            store.setAnnotation(label2, { type: 'point', data: { x: 100, y: 100 } });
            
            // Redo should no longer be available (stack was cleared)
            expect(store.canRedo()).toBe(false);
            
            // Cleanup
            store.removeAnnotation(label1);
            store.removeAnnotation(label2);
        });
    });
    
    // ========================================================================
    // E2E Test: Touch/Pointer Events Simulation
    // ========================================================================
    
    describe('E2E: Pointer Events', () => {
        
        it('should handle pointer event coordinates', () => {
            // Create a mock pointer event
            const event = new PointerEvent('pointerdown', {
                clientX: 100,
                clientY: 200,
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: 'mouse'
            });
            
            expect(event.clientX).toBe(100);
            expect(event.clientY).toBe(200);
            expect(event.pointerType).toBe('mouse');
        });
        
        it('should handle touch-type pointer events', () => {
            const touchEvent = new PointerEvent('pointerdown', {
                clientX: 150,
                clientY: 250,
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: 'touch',
                isPrimary: true
            });
            
            expect(touchEvent.pointerType).toBe('touch');
            expect(touchEvent.isPrimary).toBe(true);
        });
        
        it('should convert event coordinates to image coordinates', () => {
            if (!window.viewport) return;
            
            // Reset viewport
            window.viewport.setState(1, 0, 0);
            
            // If we have eventToImage helper, test it
            if (window.viewport.eventToImage) {
                // Create mock event with offset
                const mockEvent = {
                    offsetX: 100,
                    offsetY: 150
                };
                
                const imageCoord = window.viewport.eventToImage(mockEvent);
                expect(imageCoord.x).toBe(100);
                expect(imageCoord.y).toBe(150);
            }
        });
    });
    
    // ========================================================================
    // E2E Test: State Persistence
    // ========================================================================
    
    describe('E2E: State Persistence', () => {
        
        it('should preserve annotation properties through get/set cycle', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_persist_${Date.now()}`;
            
            const originalAnnotation = {
                type: 'polygon',
                data: {
                    points: [
                        { x: 100, y: 100 },
                        { x: 200, y: 100 },
                        { x: 150, y: 200 }
                    ],
                    closed: true
                },
                status: 'created',
                category: 'anatomy',
                color: '#ff0000'
            };
            
            store.setAnnotation(testLabel, originalAnnotation);
            
            const retrieved = store.getAnnotation(testLabel);
            
            expect(retrieved.type).toBe(originalAnnotation.type);
            expect(retrieved.status).toBe(originalAnnotation.status);
            expect(retrieved.category).toBe(originalAnnotation.category);
            expect(retrieved.color).toBe(originalAnnotation.color);
            expect(retrieved.data.points).toHaveLength(3);
            expect(retrieved.data.closed).toBe(true);
            
            // Cleanup
            store.removeAnnotation(testLabel);
        });
        
        it('should update annotation while preserving other properties', () => {
            if (!window.AnnotationStore) return;
            
            const store = window.AnnotationStore;
            const testLabel = `test_update_${Date.now()}`;
            
            // Create initial annotation
            store.setAnnotation(testLabel, {
                type: 'point',
                data: { x: 100, y: 100 },
                status: 'created',
                category: 'landmark'
            });
            
            // Update position
            store.setAnnotation(testLabel, {
                type: 'point',
                data: { x: 200, y: 200 },
                status: 'updated',
                category: 'landmark'
            });
            
            const updated = store.getAnnotation(testLabel);
            expect(updated.data.x).toBe(200);
            expect(updated.data.y).toBe(200);
            expect(updated.status).toBe('updated');
            expect(updated.category).toBe('landmark');
            
            // Cleanup
            store.removeAnnotation(testLabel);
        });
    });
    
    // Run the tests
    TestRunner.run();
}
