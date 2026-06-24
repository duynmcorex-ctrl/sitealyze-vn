/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dùng class-strategy: <html class="light"> → light mode
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          // RGB variables → opacity modifiers vẫn hoạt động: bg-bg-base/50
          base:  'rgb(var(--bg-base)  / <alpha-value>)',
          panel: 'rgb(var(--bg-panel) / <alpha-value>)',
          card:  'rgb(var(--bg-card)  / <alpha-value>)',
          dark:  'rgb(var(--bg-dark)  / <alpha-value>)',
        },
        accent: {
          teal: 'rgb(var(--accent-teal) / <alpha-value>)',
          cyan: 'rgb(var(--accent-cyan) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
