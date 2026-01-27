/**
 * Export functionality for annotations
 * @module export
 */

let selectedFormat = 'json';
let selectedImages = new Set();

/**
 * Select the export format
 * @param {string} format - Format: 'json', 'csv', or 'coco'
 */
function selectFormat(format) {
    selectedFormat = format;
    document.querySelectorAll('.format-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelector(`[data-format="${format}"]`).classList.add('selected');
}

/**
 * Update image selection state
 * @param {HTMLElement} item - Image item element
 * @param {boolean} selected - Whether to select or deselect
 */
function setImageSelection(item, selected) {
    item.classList.toggle('selected', selected);
    item.querySelector('.image-checkbox').checked = selected;
}

/**
 * Toggle image selection
 * @param {HTMLElement} element - Clicked image element
 */
function toggleImage(element) {
    const key = `${element.dataset.patient}/${element.dataset.image}`;

    if (selectedImages.has(key)) {
        selectedImages.delete(key);
        setImageSelection(element, false);
    } else {
        selectedImages.add(key);
        setImageSelection(element, true);
    }

    updateSelectedCount();
}

/**
 * Select all images
 */
function selectAll() {
    document.querySelectorAll('.image-item').forEach(item => {
        const key = `${item.dataset.patient}/${item.dataset.image}`;
        selectedImages.add(key);
        setImageSelection(item, true);
    });
    updateSelectedCount();
}

/**
 * Deselect all images
 */
function deselectAll() {
    selectedImages.clear();
    document.querySelectorAll('.image-item').forEach(item => {
        setImageSelection(item, false);
    });
    updateSelectedCount();
}

/**
 * Select only annotated images
 */
function selectAnnotated() {
    deselectAll();
    document.querySelectorAll('.image-item').forEach(item => {
        const annotCount = item.querySelector('.image-annotations').textContent;
        if (parseInt(annotCount) > 0) {
            const key = `${item.dataset.patient}/${item.dataset.image}`;
            selectedImages.add(key);
            setImageSelection(item, true);
        }
    });
    updateSelectedCount();
}

/**
 * Update selected count display and export button state
 */
function updateSelectedCount() {
    const count = selectedImages.size;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('exportBtn').disabled = count === 0;
}

/**
 * Export selected annotations in the chosen format
 * Downloads the result as a file
 * @async
 * @returns {Promise<void>}
 */
async function exportAnnotations() {
    if (selectedImages.size === 0) {
        showExportMessage('Please select at least one image to export', 'error');
        return;
    }
    
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.disabled = true;
    exportBtn.textContent = '⏳ Exporting...';
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                format: selectedFormat,
                images: Array.from(selectedImages)
            })
        });
        
        if (!response.ok) {
            throw new Error('Export failed');
        }
        
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition
            ? contentDisposition.split('filename=')[1].replace(/"/g, '')
            : `annotations.${selectedFormat}`;

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showExportMessage(`Successfully exported ${selectedImages.size} image(s) as ${selectedFormat.toUpperCase()}`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showExportMessage('Failed to export annotations. Please try again.', 'error');
    } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = '📥 Export Selected';
    }
}

/**
 * Display export message
 * @param {string} text - Message text
 * @param {string} type - Message type ('success' or 'error')
 */
function showExportMessage(text, type) {
    const message = document.getElementById('message');
    if (!message) return;

    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';

    setTimeout(() => {
        message.style.display = 'none';
    }, 5000);
}

// Expose functions globally for onclick handlers
window.selectFormat = selectFormat;
window.toggleImage = toggleImage;
window.selectAll = selectAll;
window.deselectAll = deselectAll;
window.selectAnnotated = selectAnnotated;
window.exportAnnotations = exportAnnotations;
