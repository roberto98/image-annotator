/**
 * Image browser functionality for directory navigation
 * @module browse_images
 */

// State variables
let directoryStructure = null;
let currentPath = '';
let currentPatient = '';

// DOM elements (will be initialized when DOM is ready)
let directoryTree;
let directoryContent;
let breadcrumb;

/**
 * Load the directory structure from the API
 * @async
 * @returns {Promise<void>}
 */
async function loadDirectoryStructure() {
    try {
        directoryTree.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <div class="loading-message">Loading directory structure...</div>
            </div>
        `;
        
        const response = await fetch('/api/image-directory');
        if (!response.ok) {
            throw new Error('Failed to load directory structure');
        }
        
        directoryStructure = await response.json();
        renderDirectoryTree(directoryStructure);
        updateBreadcrumb();
    } catch (error) {
        console.error('Error loading directory structure:', error);
        directoryTree.innerHTML = `
            <div class="empty">
                <div class="empty-icon">❌</div>
                <div class="empty-message">Error loading directory structure</div>
                <div class="error-details">${error.message}</div>
            </div>
        `;
    }
}

/**
 * Render the directory tree recursively
 * @param {Object} directory - Directory object with name, path, and children
 * @param {number} [level=0] - Current nesting level for indentation
 */
function renderDirectoryTree(directory, level = 0) {
    if (level === 0) {
        directoryTree.innerHTML = '';
    }
    
    const dirItem = document.createElement('div');
    dirItem.className = 'directory-item directory-folder';
    dirItem.innerHTML = `
        <span class="directory-icon">📁</span>
        ${directory.name}
    `;
    dirItem.style.paddingLeft = `${level * 15 + 10}px`;
    dirItem.addEventListener('click', () => {
        // Remove active class from all items
        document.querySelectorAll('.directory-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to clicked item
        dirItem.classList.add('active');
        
        // Update current path
        currentPath = directory.path;
        currentPatient = directory.name;
        
        // Show directory contents
        showDirectoryContents(directory);
        updateBreadcrumb();
    });
    
    directoryTree.appendChild(dirItem);
    
    if (directory.children && directory.children.length > 0) {
        const directories = directory.children.filter(child => child.type === 'directory');
        
        directories.forEach(child => {
            renderDirectoryTree(child, level + 1);
        });
    }
}

/**
 * Display the contents of a directory (subdirectories and images)
 * @param {Object} directory - Directory object to display
 */
function showDirectoryContents(directory) {
    // Show loading state
    directoryContent.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div class="loading-message">Loading directory contents...</div>
        </div>
    `;
    
    // Short delay to show loading animation
    setTimeout(() => {
        if (!directory.children || directory.children.length === 0) {
            directoryContent.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">📁</div>
                    <div class="empty-message">This directory is empty</div>
                </div>
            `;
            return;
        }
        
        // Clear previous content
        directoryContent.innerHTML = '';
        
        // Filter directories and images
        const directories = directory.children.filter(child => child.type === 'directory');
        const images = directory.children.filter(child => child.type === 'image');
        
        // Display subdirectories if any
        if (directories.length > 0) {
            const foldersContainer = document.createElement('div');
            foldersContainer.className = 'folder-list';
            
            const foldersTitle = document.createElement('h3');
            foldersTitle.textContent = 'Directories';
            foldersTitle.style.marginBottom = '1rem';
            foldersTitle.style.color = 'var(--dark)';
            foldersContainer.appendChild(foldersTitle);
            
            directories.forEach(dir => {
                const folderItem = document.createElement('div');
                folderItem.className = 'directory-item directory-folder';
                folderItem.innerHTML = `
                    <span class="directory-icon">📁</span>
                    ${dir.name}
                `;
                folderItem.addEventListener('click', () => {
                    // Find and click the corresponding item in the directory tree
                    const treeItems = directoryTree.querySelectorAll('.directory-item');
                    for (const item of treeItems) {
                        if (item.textContent.trim() === dir.name) {
                            item.click();
                            break;
                        }
                    }
                });
                foldersContainer.appendChild(folderItem);
            });
            
            directoryContent.appendChild(foldersContainer);
        }
        
        // Display images if any
        if (images.length > 0) {
            const imagesTitle = document.createElement('h3');
            imagesTitle.textContent = 'Images';
            imagesTitle.style.marginBottom = '1rem';
            imagesTitle.style.marginTop = directories.length ? '2rem' : '0';
            imagesTitle.style.color = 'var(--dark)';
            directoryContent.appendChild(imagesTitle);
            
            const imageGrid = document.createElement('div');
            imageGrid.className = 'image-grid';
            
            images.forEach(image => {
                const imageItem = document.createElement('div');
                imageItem.className = 'image-item';
                imageItem.innerHTML = `
                    <img src="/images/${image.patient}/${image.name}" class="image-thumbnail" alt="${image.name}">
                    <div class="image-info">
                        <p class="image-name">${image.name}</p>
                    </div>
                `;
                imageItem.addEventListener('click', () => {
                    window.location.href = `/annotate/${image.patient}/${image.name}`;
                });
                imageGrid.appendChild(imageItem);
            });
            
            directoryContent.appendChild(imageGrid);
        }
        
        // Show empty state if no directories or images
        if (directories.length === 0 && images.length === 0) {
            directoryContent.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">📁</div>
                    <div class="empty-message">No images or directories found</div>
                </div>
            `;
        }
    }, 300); // Short delay for loading animation
}

// Update breadcrumb navigation
function updateBreadcrumb() {
    if (!currentPath) {
        breadcrumb.innerHTML = '<strong>Home</strong>';
        return;
    }
    
    const pathParts = currentPath.split('/');
    let html = `<a href="#" onclick="navigateToRoot()">Home</a>`;
    
    // Build path navigation
    let currentBuildPath = '';
    pathParts.forEach((part, index) => {
        if (!part) return;
        
        currentBuildPath += `/${part}`;
        if (index === pathParts.length - 1) {
            html += ` / <strong>${part}</strong>`;
        } else {
            html += ` / <a href="#" onclick="navigateToPath('${currentBuildPath}')">${part}</a>`;
        }
    });
    
    breadcrumb.innerHTML = html;
}

// Navigation functions
function navigateToRoot() {
    if (directoryStructure) {
        currentPath = directoryStructure.path;
        currentPatient = '';
        
        // Reset active class
        document.querySelectorAll('.directory-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find and activate the root item
        const rootItems = directoryTree.querySelectorAll('.directory-item');
        if (rootItems.length > 0) {
            rootItems[0].classList.add('active');
        }
        
        showDirectoryContents(directoryStructure);
        updateBreadcrumb();
    }
}

function navigateToPath(path) {
    // Find the directory corresponding to the path
    function findDirectory(dir, targetPath) {
        if (dir.path === targetPath) {
            return dir;
        }
        
        if (dir.children) {
            for (const child of dir.children) {
                if (child.type === 'directory') {
                    const found = findDirectory(child, targetPath);
                    if (found) {
                        return found;
                    }
                }
            }
        }
        
        return null;
    }
    
    const directory = findDirectory(directoryStructure, path);
    if (directory) {
        // Update active class
        document.querySelectorAll('.directory-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find and activate the corresponding item
        const treeItems = directoryTree.querySelectorAll('.directory-item');
        for (const item of treeItems) {
            if (item.textContent.trim() === directory.name) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            }
        }
        
        currentPath = directory.path;
        currentPatient = directory.name;
        showDirectoryContents(directory);
        updateBreadcrumb();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    directoryTree = document.getElementById('directoryTree');
    directoryContent = document.getElementById('directoryContent');
    breadcrumb = document.getElementById('breadcrumb');
    
    // Load directory structure
    loadDirectoryStructure();
});

// Expose functions globally for onclick handlers
window.navigateToRoot = navigateToRoot;
window.navigateToPath = navigateToPath;
