// Global state management for the annotation tool

/**
 * Application state object
 * Contains all mutable state for the annotation tool
 */
const STATE = {
    // Current tool mode
    currentTool: 'landmark', // 'landmark', 'polygon', 'figure'
    selectedLabel: null,
    
    // Annotations data
    annotations: window.currentAnnotations || {},
    allLabels: [], // Unified list of all labels
    visibilityToggles: {}, // Track which labels are visible
    
    // Image state
    imageLoaded: false,
    naturalWidth: 0,
    naturalHeight: 0,
    
    // Zoom and pan state
    currentZoom: 1,
    maxZoom: 1000,
    translateX: 0,
    translateY: 0,
    
    // Interaction modes
    isAnnotationMode: true,
    isDragging: false,
    startDragX: 0,
    startDragY: 0,
    
    // Polygon drawing state
    activePolygonPoints: [],
    activePolygonElements: { points: [], lines: [] },
    polygonTool: 'draw', // 'draw', 'edit', 'move'
    polygonDragging: false,
    selectedPointIndex: -1,
    polygonMoveStart: null,
    
    // Figure drawing state
    figureShape: 'circle',
    figureSize: 50,
    figureDrawing: false,
    figureStartX: 0,
    figureStartY: 0,
    figurePreview: null,
    
    // Figure interaction state
    selectedFigure: null,
    figureDragging: false,
    figureResizing: false,
    figureDragStartX: 0,
    figureDragStartY: 0,
    figureOriginalX: 0,
    figureOriginalY: 0,
    figureOriginalSize: 0,
    resizeHandle: null,
    figureDragOffsetX: 0,
    figureDragOffsetY: 0,
    showCenterIndicators: true,
    
    // Line drawing state
    linePoints: [],
    lineDrawing: false,
    linePointDragging: false,
    linePointDraggedFigure: null,
    linePointDraggedType: null,
    figureOriginalStartX: 0,
    figureOriginalStartY: 0,
    figureOriginalEndX: 0,
    figureOriginalEndY: 0,
    
    // Undo/Redo state
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    
    // Unsaved changes tracking
    hasUnsavedChanges: false,
    
    // Image adjustments
    brightness: 100,
    contrast: 100
};

/**
 * Color palette for annotations
 * Each annotation type gets a unique color from this palette
 */
const COLORS = Object.freeze([
    '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#ff8000', '#8000ff',
    '#ff0080', '#80ff00', '#0080ff', '#8000ff'
]);
