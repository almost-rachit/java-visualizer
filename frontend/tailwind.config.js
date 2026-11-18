/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        jvm: {
          dark: '#0d1117',
          panel: '#161b22',
          border: '#30363d',
          accent: '#58a6ff',
          stack: '#1f2937',
          heap: '#111827',
          pool: '#1e1e38',
          success: '#238636',
          danger: '#da3633',
          warning: '#d29922'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
