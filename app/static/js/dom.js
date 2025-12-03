// DOM element references
// Centralized DOM element cache for better performance and maintainability

/**
 * DOM element references used throughout the annotation tool
 * Elements are cached on page load to avoid repeated DOM queries
 */
const DOM = {
    // Main image elements
    img: document.getElementById('annotationImage'),
    imageContainer: document.getElementById('imageContainer'),
    imageWrapper: document.getElementById('imageWrapper'),
    
    // Sidebar elements
    labelList: document.getElementById('labelList'),
    labelInput: document.getElementById('labelInput'),
    createLabelBtn: document.getElementById('createLabelBtn'),
    sidebarTitle: document.getElementById('sidebarTitle'),
    
    // UI feedback elements
    messageToast: document.getElementById('messageToast'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    
    // Zoom controls
    zoomLevel: document.getElementById('zoomLevel'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    resetView: document.getElementById('resetView'),
    toggleCenters: document.getElementById('toggleCenters'),
    
    // Status indicators
    modeIndicator: document.getElementById('modeIndicator'),
    mousePosition: document.getElementById('mousePosition'),
    
    // Tool buttons
    landmarkToolBtn: document.getElementById('landmarkToolBtn'),
    polygonToolBtn: document.getElementById('polygonToolBtn'),
    figureToolBtn: document.getElementById('figureToolBtn'),
    
    // Figure configuration
    figureConfig: document.getElementById('figureConfig'),
    circleBtn: document.getElementById('circleBtn'),
    rectangleBtn: document.getElementById('rectangleBtn'),
    lineBtn: document.getElementById('lineBtn'),
    figureSize: document.getElementById('figureSize'),
    
    // Polygon tools
    polygonTools: document.getElementById('polygonTools'),
    drawPolyBtn: document.getElementById('drawPolyBtn'),
    editPolyBtn: document.getElementById('editPolyBtn'),
    movePolyBtn: document.getElementById('movePolyBtn'),
    completePolyBtn: document.getElementById('completePolyBtn'),
    cancelPolyBtn: document.getElementById('cancelPolyBtn'),
    
    // Navigation buttons
    propagateBtn: document.getElementById('propagateBtn')
};
