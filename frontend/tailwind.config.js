/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Texto principal themeable: blanco en oscuro, navy oscuro en claro.
        white: "rgb(var(--c-white) / <alpha-value>)",
        // Paleta Vestra — valores reales en CSS variables (styles/index.css) para
        // soportar tema claro/oscuro. Canales RGB → compatibles con opacidad (/NN).
        navy: {
          50:  "rgb(var(--navy-50) / <alpha-value>)",
          100: "rgb(var(--navy-100) / <alpha-value>)",
          200: "rgb(var(--navy-200) / <alpha-value>)",
          300: "rgb(var(--navy-300) / <alpha-value>)",
          400: "rgb(var(--navy-400) / <alpha-value>)",
          500: "rgb(var(--navy-500) / <alpha-value>)",
          600: "rgb(var(--navy-600) / <alpha-value>)",
          700: "rgb(var(--navy-700) / <alpha-value>)",
          800: "rgb(var(--navy-800) / <alpha-value>)",
          900: "rgb(var(--navy-900) / <alpha-value>)",
          950: "rgb(var(--navy-950) / <alpha-value>)",
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
