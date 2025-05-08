export const ThemeMenu = {
    init() {
        this.createMenu();
        this.loadSavedTheme();
        this.setupEventListeners();
    },

    createMenu() {
        const menu = document.createElement('div');
        menu.className = 'theme-menu';
        menu.innerHTML = `
            <div class="theme-menu-content">
                <h2>Settings</h2>
                <div class="theme-option">
                    <label>
                        <input type="radio" name="theme" value="dark" checked>
                        Dark Theme
                    </label>
                </div>
                <div class="theme-option">
                    <label>
                        <input type="radio" name="theme" value="light">
                        Light Theme
                    </label>
                </div>
            </div>
        `;
        document.body.appendChild(menu);
    },

    loadSavedTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const radio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
        if (radio) radio.checked = true;
    },

    setupEventListeners() {
        // Theme selection
        document.querySelectorAll('input[name="theme"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const theme = e.target.value;
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            });
        });

        // Toggle menu on title click
        const title = document.querySelector('.app-title');
        if (title) {
            title.addEventListener('click', () => {
                document.querySelector('.theme-menu').classList.toggle('active');
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.querySelector('.theme-menu');
            const title = document.querySelector('.app-title');
            if (menu.classList.contains('active') && 
                !menu.contains(e.target) && 
                !title.contains(e.target)) {
                menu.classList.remove('active');
            }
        });
    }
}; 