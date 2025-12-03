/**
 * Homepage menu functionality with filtering and animations
 * @module menu
 */

document.addEventListener('DOMContentLoaded', function() {
    // Filter functionality
    const filterInput = document.getElementById('filterAnnotationName');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const tableBody = document.getElementById('annotationsTableBody');
    
    let activeTypeFilter = '';
    
    function applyFilters() {
        if (!tableBody) return;
        
        const searchTerm = filterInput ? filterInput.value.toLowerCase().trim() : '';
        const rows = tableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const name = row.querySelector('.td-name')?.textContent.toLowerCase() || '';
            const rowType = row.dataset.type || '';
            
            const nameMatch = !searchTerm || name.includes(searchTerm);
            const typeMatch = !activeTypeFilter || rowType === activeTypeFilter;
            
            row.style.display = (nameMatch && typeMatch) ? '' : 'none';
        });
    }
    
    // Search input handler
    if (filterInput) {
        filterInput.addEventListener('input', applyFilters);
    }
    
    // Filter button handlers
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('filter-btn-active'));
            this.classList.add('filter-btn-active');
            
            // Set filter and apply
            activeTypeFilter = this.dataset.filter || '';
            applyFilters();
        });
    });
    
    // Animate progress ring on load
    const progressRing = document.querySelector('.progress-ring-fill');
    if (progressRing) {
        const offset = progressRing.getAttribute('stroke-dashoffset');
        progressRing.style.strokeDashoffset = '326.73';
        setTimeout(() => {
            progressRing.style.strokeDashoffset = offset;
        }, 100);
    }
    
    // Animate stats on scroll into view
    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px'
    };
    
    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.stat-card, .action-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        animateOnScroll.observe(card);
    });
    
    // Trigger initial animation for visible elements
    setTimeout(() => {
        document.querySelectorAll('.stat-card, .action-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }
        });
    }, 100);
});
