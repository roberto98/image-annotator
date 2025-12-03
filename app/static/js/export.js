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

function toggleImage(element) {
    const patient = element.dataset.patient;
    const image = element.dataset.image;
    const key = `${patient}/${image}`;
    const checkbox = element.querySelector('.image-checkbox');
    
    if (selectedImages.has(key)) {
        selectedImages.delete(key);
        element.classList.remove('selected');
        checkbox.checked = false;
    } else {
        selectedImages.add(key);
        element.classList.add('selected');
        checkbox.checked = true;
    }
    
    updateSelectedCount();
}

function selectAll() {
    document.querySelectorAll('.image-item').forEach(item => {
        const patient = item.dataset.patient;
        const image = item.dataset.image;
        const key = `${patient}/${image}`;
        selectedImages.add(key);
        item.classList.add('selected');
        item.querySelector('.image-checkbox').checked = true;
    });
    updateSelectedCount();
}

function deselectAll() {
    selectedImages.clear();
    document.querySelectorAll('.image-item').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('.image-checkbox').checked = false;
    });
    updateSelectedCount();
}

function selectAnnotated() {
    deselectAll();
    document.querySelectorAll('.image-item').forEach(item => {
        const annotCount = item.querySelector('.image-annotations').textContent;
        if (parseInt(annotCount) > 0) {
            const patient = item.dataset.patient;
            const image = item.dataset.image;
            const key = `${patient}/${image}`;
            selectedImages.add(key);
            item.classList.add('selected');
            item.querySelector('.image-checkbox').checked = true;
        }
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = selectedImages.size;
    document.getElementById('exportBtn').disabled = selectedImages.size === 0;
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
        
        // Get the filename from the header
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition 
            ? contentDisposition.split('filename=')[1].replace(/"/g, '')
            : `annotations.${selectedFormat}`;
        
        // Download the file
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

// showMessage is imported from utilities.js
// For export page, we use a local message element
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
