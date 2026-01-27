/**
 * Homepage menu functionality with filtering and animations
 * @module menu
 */

document.addEventListener('DOMContentLoaded', function() {
    const filterInput = document.getElementById('filterAnnotationName');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const tableBody = document.getElementById('annotationsTableBody');
    let activeTypeFilter = '';

    function applyFilters() {
        if (!tableBody) return;

        const searchTerm = filterInput ? filterInput.value.toLowerCase().trim() : '';

        tableBody.querySelectorAll('tr').forEach(row => {
            const name = row.querySelector('.td-name')?.textContent.toLowerCase() || '';
            const rowType = row.dataset.type || '';
            const nameMatch = !searchTerm || name.includes(searchTerm);
            const typeMatch = !activeTypeFilter || rowType === activeTypeFilter;
            row.style.display = (nameMatch && typeMatch) ? '' : 'none';
        });
    }

    if (filterInput) {
        filterInput.addEventListener('input', applyFilters);
    }

    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            filterButtons.forEach(b => b.classList.remove('filter-btn-active'));
            this.classList.add('filter-btn-active');
            activeTypeFilter = this.dataset.filter || '';
            applyFilters();
        });
    });

    const progressRing = document.querySelector('.progress-ring-fill');
    if (progressRing) {
        const targetOffset = progressRing.getAttribute('stroke-dashoffset');
        progressRing.style.strokeDashoffset = '326.73';
        requestAnimationFrame(() => {
            progressRing.style.strokeDashoffset = targetOffset;
        });
    }

    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.2 });

    document.querySelectorAll('.stat-card, .action-card').forEach(card => {
        animateOnScroll.observe(card);
    });
});
