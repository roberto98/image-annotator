/**
 * View annotations page functionality with lightbox and filtering
 * @module view_annotations
 */

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
    if (!section) return;

    const imageGrid = section.querySelector('.image-grid');
    if (!imageGrid) return;

    const toggleIcon = element.querySelector('.toggle-icon');
    const toggleText = element.querySelector('.toggle-text');
    const isCollapsed = imageGrid.style.display === 'none';

    imageGrid.style.display = isCollapsed ? '' : 'none';

    if (toggleIcon) {
        toggleIcon.classList.toggle('closed', !isCollapsed);
    }
    if (toggleText) {
        toggleText.textContent = isCollapsed ? 'Collapse' : 'Expand';
    }
}

window.togglePatientSection = togglePatientSection;

document.addEventListener('DOMContentLoaded', function() {
    patientFilter = document.getElementById('patientFilter');
    imageFilter = document.getElementById('imageFilter');
    patientsContainer = document.getElementById('patientsContainer');
    lightbox = document.getElementById('imageLightbox');
    lightboxImage = document.getElementById('lightboxImage');
    lightboxCaption = document.getElementById('lightboxCaption');
    prevImageBtn = document.getElementById('prevImageBtn');
    nextImageBtn = document.getElementById('nextImageBtn');
    loadingOverlay = document.getElementById('loadingOverlay');

    if (patientFilter) patientFilter.addEventListener('input', filterPatients);
    if (imageFilter) imageFilter.addEventListener('input', filterImages);
    setupEventDelegation();

    window.closeLightbox = closeLightbox;
    window.navigateLightbox = navigateLightbox;
    window.refreshAnnotations = refreshAnnotations;
});

function setupEventDelegation() {
    if (patientsContainer) {
        patientsContainer.addEventListener('click', function(e) {
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

/**
 * Filter patient sections by patient ID
 */
function filterPatients() {
    const filterValue = patientFilter.value.toLowerCase();
    document.querySelectorAll('.patient-section').forEach(section => {
        const patientId = section.dataset.patient.toLowerCase();
        section.style.display = patientId.includes(filterValue) ? '' : 'none';
    });
}

/**
 * Filter images by filename
 */
function filterImages() {
    const filterValue = imageFilter.value.toLowerCase();
    document.querySelectorAll('.image-container').forEach(container => {
        const imageName = container.dataset.image.toLowerCase();
        container.style.display = imageName.includes(filterValue) ? '' : 'none';
    });
}

let currentLightboxIndex = 0;
let lightboxImages = [];

function initializeLightbox() {
    lightboxImages = Array.from(document.querySelectorAll('.image-container'))
        .filter(container => container.style.display !== 'none')
        .map(container => {
            const img = container.querySelector('img');
            const patientSection = container.closest('.patient-section');
            return {
                src: img.src,
                caption: `${patientSection.dataset.patient} - ${container.dataset.image}`
            };
        });
}

/**
 * Open lightbox with specified image
 * @param {string} imageSrc - Image source URL
 * @param {string} caption - Image caption
 */
function openLightbox(imageSrc, caption) {
    initializeLightbox();

    currentLightboxIndex = Math.max(0, lightboxImages.findIndex(img => img.src === imageSrc));

    lightboxImage.src = imageSrc;
    lightboxCaption.textContent = caption;
    lightbox.style.display = 'block';
    document.body.style.overflow = 'hidden';

    updateLightboxNavButtons();
    document.addEventListener('keydown', handleLightboxKeyPress);
}

/**
 * Close the lightbox
 */
function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleLightboxKeyPress);
}

/**
 * Navigate lightbox by step
 * @param {number} step - Navigation step (-1 or 1)
 */
function navigateLightbox(step) {
    if (lightboxImages.length === 0) return;

    currentLightboxIndex = Math.max(0, Math.min(lightboxImages.length - 1, currentLightboxIndex + step));

    const image = lightboxImages[currentLightboxIndex];
    lightboxImage.src = image.src;
    lightboxCaption.textContent = image.caption;

    updateLightboxNavButtons();
}

/**
 * Update lightbox navigation button states
 */
function updateLightboxNavButtons() {
    prevImageBtn.disabled = currentLightboxIndex === 0;
    nextImageBtn.disabled = currentLightboxIndex === lightboxImages.length - 1;
}

/**
 * Handle keyboard navigation in lightbox
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleLightboxKeyPress(e) {
    const actions = {
        'ArrowLeft': () => navigateLightbox(-1),
        'ArrowRight': () => navigateLightbox(1),
        'Escape': closeLightbox
    };

    actions[e.key]?.();
}

/**
 * Refresh annotations by regenerating annotated images
 */
async function refreshAnnotations() {
    if (!loadingOverlay) return;

    loadingOverlay.style.display = 'flex';

    try {
        const response = await fetch('/regenerate-annotations');
        if (!response.ok) throw new Error('Failed to regenerate annotations');
        window.location.reload();
    } catch (error) {
        console.error('Error refreshing annotations:', error);

        const loadingMessage = document.querySelector('.loading-message');
        if (loadingMessage) {
            loadingMessage.textContent = 'Error refreshing annotations. Reloading page...';
        }

        setTimeout(() => window.location.reload(), 2000);
    }
}
