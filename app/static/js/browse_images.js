/**
 * Image browser functionality for directory navigation
 * @module browse_images
 */

let directoryStructure = null;
let currentPath = '';
let currentPatient = '';
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
    dirItem.style.paddingLeft = `${level * 15 + 10}px`;

    const icon = document.createElement('span');
    icon.className = 'directory-icon';
    icon.textContent = '📁';

    dirItem.appendChild(icon);
    dirItem.appendChild(document.createTextNode(directory.name));

    dirItem.addEventListener('click', () => {
        document.querySelectorAll('.directory-item').forEach(item => {
            item.classList.remove('active');
        });

        dirItem.classList.add('active');
        currentPath = directory.path;
        currentPatient = directory.name;

        showDirectoryContents(directory);
        updateBreadcrumb();
    });

    directoryTree.appendChild(dirItem);

    if (directory.children && directory.children.length > 0) {
        const directories = directory.children.filter(child => child.type === 'directory');
        directories.forEach(child => renderDirectoryTree(child, level + 1));
    }
}

/**
 * Display the contents of a directory (subdirectories and images)
 * @param {Object} directory - Directory object to display
 */
function showDirectoryContents(directory) {
    if (!directory.children || directory.children.length === 0) {
        directoryContent.innerHTML = `
            <div class="empty">
                <div class="empty-icon">📁</div>
                <div class="empty-message">This directory is empty</div>
            </div>
        `;
        return;
    }

    directoryContent.innerHTML = '';

    const directories = directory.children.filter(child => child.type === 'directory');
    const images = directory.children.filter(child => child.type === 'image');

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

            const icon = document.createElement('span');
            icon.className = 'directory-icon';
            icon.textContent = '📁';

            folderItem.appendChild(icon);
            folderItem.appendChild(document.createTextNode(dir.name));

            folderItem.addEventListener('click', () => {
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

            const img = document.createElement('img');
            img.src = `/images/${image.patient}/${image.name}`;
            img.className = 'image-thumbnail';
            img.alt = image.name;

            const imageInfo = document.createElement('div');
            imageInfo.className = 'image-info';

            const imageName = document.createElement('p');
            imageName.className = 'image-name';
            imageName.textContent = image.name;

            imageInfo.appendChild(imageName);
            imageItem.appendChild(img);
            imageItem.appendChild(imageInfo);

            imageItem.addEventListener('click', () => {
                window.location.href = `/annotate/${image.patient}/${image.name}`;
            });
            imageGrid.appendChild(imageItem);
        });

        directoryContent.appendChild(imageGrid);
    }

    if (directories.length === 0 && images.length === 0) {
        directoryContent.innerHTML = `
            <div class="empty">
                <div class="empty-icon">📁</div>
                <div class="empty-message">No images or directories found</div>
            </div>
        `;
    }
}

/**
 * Update breadcrumb navigation
 */
function updateBreadcrumb() {
    if (!currentPath) {
        breadcrumb.innerHTML = '<strong>Home</strong>';
        return;
    }

    const pathParts = currentPath.split('/').filter(Boolean);
    const crumbs = [];

    const homeLink = document.createElement('a');
    homeLink.href = '#';
    homeLink.textContent = 'Home';
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoot();
    });
    crumbs.push(homeLink);

    let currentBuildPath = '';
    pathParts.forEach((part, index) => {
        currentBuildPath += `/${part}`;

        if (index === pathParts.length - 1) {
            const strong = document.createElement('strong');
            strong.textContent = part;
            crumbs.push(strong);
        } else {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = part;
            const path = currentBuildPath;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPath(path);
            });
            crumbs.push(link);
        }
    });

    breadcrumb.innerHTML = '';
    crumbs.forEach((crumb, index) => {
        if (index > 0) {
            breadcrumb.appendChild(document.createTextNode(' / '));
        }
        breadcrumb.appendChild(crumb);
    });
}

/**
 * Navigate to root directory
 */
function navigateToRoot() {
    if (!directoryStructure) return;

    currentPath = directoryStructure.path;
    currentPatient = '';

    document.querySelectorAll('.directory-item').forEach(item => {
        item.classList.remove('active');
    });

    const rootItem = directoryTree.querySelector('.directory-item');
    if (rootItem) {
        rootItem.classList.add('active');
    }

    showDirectoryContents(directoryStructure);
    updateBreadcrumb();
}

/**
 * Navigate to specific directory path
 * @param {string} path - Target directory path
 */
function navigateToPath(path) {
    const directory = findDirectoryByPath(directoryStructure, path);
    if (!directory) return;

    document.querySelectorAll('.directory-item').forEach(item => {
        item.classList.remove('active');
    });

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

/**
 * Find directory by path recursively
 * @param {Object} dir - Directory object to search
 * @param {string} targetPath - Path to find
 * @returns {Object|null} Directory object or null
 */
function findDirectoryByPath(dir, targetPath) {
    if (dir.path === targetPath) return dir;

    if (dir.children) {
        for (const child of dir.children) {
            if (child.type === 'directory') {
                const found = findDirectoryByPath(child, targetPath);
                if (found) return found;
            }
        }
    }

    return null;
}

document.addEventListener('DOMContentLoaded', function() {
    directoryTree = document.getElementById('directoryTree');
    directoryContent = document.getElementById('directoryContent');
    breadcrumb = document.getElementById('breadcrumb');
    loadDirectoryStructure();
});

