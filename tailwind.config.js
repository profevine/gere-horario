/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        school: {
          green: {
            light: '#e8f5e9',
            DEFAULT: '#2e7d32',
            dark: '#1b5e20',
          },
          gold: {
            light: '#fffde7',
            DEFAULT: '#fbc02d',
            dark: '#f9a825',
          },
          pastel: {
            green: '#f1f8e9',
            gold: '#fff9c4',
            cream: '#fafafa'
          }
        }
      }
    },
  },
  plugins: [],
}
