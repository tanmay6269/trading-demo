/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-dark)',
        foreground: 'var(--text-primary)',
        card: {
          DEFAULT: 'var(--bg-card)',
          foreground: 'var(--text-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        primary: {
          DEFAULT: 'var(--accent-primary)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: 'var(--bg-surface-hover)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'var(--bg-inset)',
          foreground: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-primary-soft)',
          foreground: 'var(--accent-primary)',
        },
        destructive: {
          DEFAULT: 'var(--accent-rose)',
          foreground: '#ffffff',
        },
        border: 'var(--border-color)',
        input: 'var(--border-color)',
        ring: 'var(--border-focus)',
        'chart-1': 'var(--accent-primary)',
        'chart-2': 'var(--accent-emerald)',
        'chart-3': 'var(--accent-rose)',
        'chart-4': 'var(--accent-amber)',
        'chart-5': 'var(--accent-violet)',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
    },
  },
  plugins: [],
};
