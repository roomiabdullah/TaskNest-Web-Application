// js/theme.js

// 1. On load, check local storage or system preference
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

// 2. Function to toggle theme
export function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
}

// 3. Optional: Export a function to initialize the toggle button event listener
export function setupThemeToggle(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.addEventListener('click', toggleTheme);
    }
}
