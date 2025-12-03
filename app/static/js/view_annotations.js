/**
 * View annotations page functionality with lightbox and filtering
 * @module view_annotations
 */

// Cache DOM elements for better performance (will be initialized when DOM is ready)
let patientFilter;
let imageFilter;
let patientsContainer;
let lightbox;
let lightboxImage;
let lightboxCaption;
let prevImageBtn;
let nextImageBtn;
let loadingOverlay;

/**
 * Toggle the visibility of a patient's image section
 * @param {HTMLElement} element - The clicked toggle element
 */
function togglePatientSection(element) {
    const section = element.closest('.patient-section');
    if (!section) {
        return;
    }
    const imageGrid = section.querySelector('.image-grid');
    const toggleIcon = element.querySelector('.toggle-icon');
    const toggleText = element.querySelector('.toggle-text');
    
    if (!imageGrid) {
        return;
    }
    
    // Check if currently collapsed using data attribute
    const isCollapsed = imageGrid.getAttribute('data-collapsed') === 'true';
    
    if (isCollapsed) {
        // Expand
        imageGrid.removeAttribute('data-collapsed');
        imageGrid.style.display = '';
        if (toggleIcon) toggleIcon.classList.remove('closed');
        if (toggleText) toggleText.textContent = 'Collapse';
    } else {
        // Collapse - use direct property assignment
        imageGrid.setAttribute('data-collapsed', 'true');
        imageGrid.style.setProperty('display', 'none', 'important');
        if (toggleIcon) toggleIcon.classList.add('closed');
        if (toggleText) toggleText.textContent = 'Expand';
    }
}

// Expose functions globally for onclick handlers immediately
window.togglePatientSection = togglePatientSection;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    patientFilter = document.getElementById('patientFilter');
    imageFilter = document.getElementById('imageFilter');
    patientsContainer = document.getElementById('patientsContainer');
    lightbox = document.getElementById('imageLightbox');
    lightboxImage = document.getElementById('lightboxImage');
    lightboxCaption = document.getElementById('lightboxCaption');
    prevImageBtn = document.getElementById('prevImageBtn');
    nextImageBtn = document.getElementById('nextImageBtn');
    loadingOverlay = document.getElementById('loadingOverlay');
    
    // Setup event listeners
    if (patientFilter) patientFilter.addEventListener('input', filterPatients);
    if (imageFilter) imageFilter.addEventListener('input', filterImages);
    setupEventDelegation();
    
    // Expose remaining functions globally for onclick handlers
    window.closeLightbox = closeLightbox;
    window.navigateLightbox = navigateLightbox;
    window.refreshAnnotations = refreshAnnotations;
});

// Use event delegation for improved performance
function setupEventDelegation() {
    if (patientsContainer) {
        patientsContainer.addEventListener('click', function(e) {
            // Handle clicks on images (toggle sections handled by onclick attribute)
            const imageElement = e.target.closest('.image-thumbnail');
            if (imageElement) {
                const container = imageElement.closest('.image-container');
                const imageName = container.dataset.image;
                const patientName = container.dataset.patient;
                
                openLightbox(imageElement.src, `${patientName} - ${imageName}`);
            }
        });
    }
}

// Filter functions
function filterPatients() {
    const filterValue = patientFilter.value.toLowerCase();
    const patientSections = document.querySelectorAll('.patient-section');
    
    patientSections.forEach(section => {
        const patientId = section.dataset.patient.toLowerCase();
        const display = patientId.includes(filterValue) ? 'block' : 'none';
        section.style.display = display;
    });
}

function filterImages() {
    const filterValue = imageFilter.value.toLowerCase();
    const imageContainers = document.querySelectorAll('.image-container');
    
    imageContainers.forEach(container => {
        const imageName = container.dataset.image.toLowerCase();
        const display = imageName.includes(filterValue) ? 'block' : 'none';
        container.style.display = display;
    });
}

// Lightbox functionality
let currentLightboxIndex = 0;
let lightboxImages = [];

function initializeLightbox() {
    // Collect all visible images in an array
    const imageContainers = document.querySelectorAll('.image-container:not([style*="display: none"])');
    lightboxImages = [];
    
    imageContainers.forEach(container => {
        const img = container.querySelector('img');
        const imageName = container.dataset.image;
        const patientSection = container.closest('.patient-section');
        const patientName = patientSection.dataset.patient;
        
        lightboxImages.push({
            src: img.src,
            caption: `${patientName} - ${imageName}`
        });
    });
}

function openLightbox(imageSrc, caption) {
    initializeLightbox();
    
    // Find the index of the clicked image
    currentLightboxIndex = lightboxImages.findIndex(img => img.src === imageSrc);
    if (currentLightboxIndex === -1) {
        currentLightboxIndex = 0;
    }
    
    // Show the lightbox
    lightboxImage.src = imageSrc;
    lightboxCaption.textContent = caption;
    lightbox.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling
    
    // Enable/disable navigation buttons
    updateLightboxNavButtons();
    
    // Add keyboard listeners
    document.addEventListener('keydown', handleLightboxKeyPress);
}

function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
    document.removeEventListener('keydown', handleLightboxKeyPress);
}

function navigateLightbox(step) {
    if (lightboxImages.length === 0) return;
    
    currentLightboxIndex += step;
    
    // Apply bounds checking
    if (currentLightboxIndex < 0) {
        currentLightboxIndex = 0;
    } else if (currentLightboxIndex >= lightboxImages.length) {
        currentLightboxIndex = lightboxImages.length - 1;
    }
    
    // Update the image and caption
    const image = lightboxImages[currentLightboxIndex];
    lightboxImage.src = image.src;
    lightboxCaption.textContent = image.caption;
    
    // Update button states
    updateLightboxNavButtons();
}

function updateLightboxNavButtons() {
    prevImageBtn.disabled = currentLightboxIndex === 0;
    nextImageBtn.disabled = currentLightboxIndex === lightboxImages.length - 1;
}

function handleLightboxKeyPress(e) {
    if (e.key === 'ArrowLeft') {
        navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
        navigateLightbox(1);
    } else if (e.key === 'Escape') {
        closeLightbox();
    }
}

// Refresh annotations functionality
function refreshAnnotations() {
    if (!loadingOverlay) return;
    
    // Show loading overlay
    loadingOverlay.style.display = 'flex';
    
    // Make API request to regenerate annotated images
    fetch('/regenerate-annotations')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Reload the page when processing is complete
            window.location.reload();
        })
        .catch(error => {
            console.error('Error:', error);
            // Show error in loading message
            const loadingMessage = document.querySelector('.loading-message');
            if (loadingMessage) {
                loadingMessage.textContent = 'Error refreshing annotations. Reloading page...';
            }
            
            // Reload the page after a short delay even if there's an error
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        });
}
