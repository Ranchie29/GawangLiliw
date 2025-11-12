fetch('sidebar.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('sidebarContainer').innerHTML = html;
        })
        .catch(error => console.error('Error loading sidebar:', error));