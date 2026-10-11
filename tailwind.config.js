/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: "#070707",
          elevated: "#151416",
          tile: "#222124",
          dock: "rgba(20, 19, 21, 0.9)",
        },
        brand: {
          50: "#FFF1F1",
          100: "#FFE0E1",
          500: "#FF7B7D",
          600: "#F5686D",
          700: "#D95058",
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
