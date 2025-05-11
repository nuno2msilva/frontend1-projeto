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
    
    if (savedTheme === 'dark') {
      themeToggle.checked = true;
    } else {
      themeToggle.checked = false;
    }
  } else {
    // Otherwise use system preference (default to light)
    let initialTheme;
    if (prefersDark) {
      initialTheme = 'dark';
    } else {
      initialTheme = 'light';
    }
    
    document.documentElement.setAttribute('data-theme', initialTheme);
    
    if (initialTheme === 'dark') {
      themeToggle.checked = true;
    } else {
      themeToggle.checked = false;
    }
  }
  
  // Handle toggle changes (checked now means dark theme)
  themeToggle.addEventListener('change', function() {
    let newTheme;
    if (this.checked) {
      newTheme = 'dark';
    } else {
      newTheme = 'light';
    }
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update theme-color meta tag
    const themeColorMeta = document.getElementById('theme-color-main');
    if (themeColorMeta) {
      if (newTheme === 'dark') {
        themeColorMeta.setAttribute('content', '#1a1a1a');
      } else {
        themeColorMeta.setAttribute('content', '#f5f5f5');
      }
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
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  } else {
    return 'light';
  }
}

// Returns the currently active theme
export function getCurrentTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) {
    return theme;
  } else {
    return 'light';
  }
}

export default { setupThemeToggle, getSystemThemePreference, getCurrentTheme };