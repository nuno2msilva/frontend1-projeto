// Theme management module for handling light/dark mode preferences
export function setupThemeToggle() {
  const themeToggle = document.querySelector('.theme-checkbox');
  if (!themeToggle) return;
  
  // Set initial state based on saved preference or system preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // If theme was saved before, use it
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.checked = savedTheme === 'dark'; // Checked = dark now
  } else {
    // Otherwise use system preference (default to light)
    const initialTheme = prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', initialTheme);
    themeToggle.checked = initialTheme === 'dark'; // Checked = dark now
  }
  
  // Handle toggle changes (checked now means dark theme)
  themeToggle.addEventListener('change', function() {
    const newTheme = this.checked ? 'dark' : 'light'; // Reversed from original
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update theme-color meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', 
        newTheme === 'dark' ? '#1a1a1a' : '#f5f5f5'
      );
    }
    
    // Add class for smooth transition
    document.body.classList.add('theme-transition');
    setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 1000);
  });
}

// Returns the system's preferred theme (dark or light)
export function getSystemThemePreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Returns the currently active theme
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

export default { setupThemeToggle, getSystemThemePreference, getCurrentTheme };