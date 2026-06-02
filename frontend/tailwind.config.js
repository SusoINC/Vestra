/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta Vestra — extraída del logo
        navy: {
          50:  "#eef1f7",
          100: "#d5dcea",
          200: "#adb9d5",
          300: "#7f94bc",
          400: "#5672a3",
          500: "#3a5490",
          600: "#2d4275",
          700: "#21305a",
          800: "#1b2a4a",  // navy principal (logo)
          900: "#111a30",
          950: "#0a1020",
        },
        gold: {
          50:  "#fdf8ee",
          100: "#f9efd0",
          200: "#f3db9d",
          300: "#ecc469",
          400: "#e5ad3f",
          500: "#c9922a",  // dorado base
          600: "#b07820",
          700: "#8f5e1a",
          800: "#6e4815",
          900: "#4d3310",
          950: "#2e1e08",
        },
        // Gold claro del logo (degradado superior)
        champagne: {
          DEFAULT: "#d4af6e",
          light:   "#e8cfA2",
          dark:    "#b8922a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
