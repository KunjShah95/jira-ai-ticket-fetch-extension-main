/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          950: '#0a0a0a',
          900: '#121212',
          850: '#181818',
          800: '#1e1e1e',
          700: '#2d2d2d',
          600: '#424242',
          500: '#555555',
          400: '#737373',
          300: '#969696',
          200: '#b3b3b3',
          100: '#d1d1d1',
          50: '#f0f0f0',
        },
        blue: {
          950: '#172554',
          900: '#1e3a8a',
          800: '#1e40af',
          700: '#1d4ed8',
          600: '#2563eb',
          500: '#3b82f6',
          400: '#60a5fa',
          300: '#93c5fd',
          200: '#bfdbfe',
          100: '#dbeafe',
          50: '#eff6ff',
        },
      },
      boxShadow: {
        'glow': '0 0 10px rgba(59, 130, 246, 0.5)',
      },
      animation: {
        'fade-in': 'fade-in 1s cubic-bezier(.4,0,.2,1) both',
      },
      keyframes: {
        'fade-in': {
          'from': { opacity: '0', transform: 'translateY(40px)' },
          'to': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
};
