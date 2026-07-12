/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e', // Green
          600: '#16a34a',
          900: '#14532d',
        },
        secondary: {
          50: '#fefce8',
          100: '#fef9c3',
          500: '#eab308', // Yellow
          600: '#ca8a04',
          900: '#713f12',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444', // Red
          600: '#dc2626',
          900: '#7f1d1d',
        },
        background: '#f8fafc',
        surface: '#ffffff',
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['"Sora"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 8px 32px -8px rgba(34,197,94,0.35)',
        'glow-lg': '0 20px 60px -15px rgba(34,197,94,0.45)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
      },
      backdropBlur: {
        glass: '10px',
      }
    },
  },
  plugins: [
    require("tailwindcss-animate")
  ],
}
