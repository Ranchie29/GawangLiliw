document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');

    // Toggle sidebar and overlay, and switch icon
    navToggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
        navToggle.innerHTML = sidebar.classList.contains('show') 
            ? '<i class="bx bx-x"></i>' 
            : '<i class="bx bx-menu"></i>';
    });

    // Close sidebar and overlay when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 767 && 
            !sidebar.contains(e.target) && 
            !navToggle.contains(e.target) && 
            sidebar.classList.contains('show')) {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
            navToggle.innerHTML = '<i class="bx bx-menu"></i>';
        }
    });
});