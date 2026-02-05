/**
 * Help page navigation and smooth scrolling
 * @module help
 */

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.nav-link').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetElement = document.querySelector(this.getAttribute('href'));

            if (targetElement) {
                window.scrollTo({ top: targetElement.offsetTop - 20, behavior: 'smooth' });
                document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });

    window.addEventListener('scroll', function() {
        const navLinks = document.querySelectorAll('.nav-link');
        let currentSection = '';

        document.querySelectorAll('.help-section').forEach(section => {
            const top = section.offsetTop;
            if (window.pageYOffset >= top - 100 && window.pageYOffset < top + section.clientHeight - 100) {
                currentSection = '#' + section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === currentSection);
        });
    });
});
