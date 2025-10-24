// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts,js}"],
  theme: {
    extend: {
      fontFamily: {
        military: ["Oswald"],
        ocr: ['"Azeret Mono"', "monospace"],
      },
      colors: {
        // UI theme colors (keep in sync with variables.css)
        "primary-color": "#4a5d23",
        "primary-color-hover": "#3a4a1c",
        "primary-color-disabled": "#2c3e50",
        "secondary-color": "#d4c7a5",
        "secondary-color-hover": "#c2b490",
        "alert-color": "#8b0000",
        "alert-color-hover": "#a00000",
        "accent-text-color": "#374151",
      },
    },
  },
  plugins: [],
  darkMode: "class",
};
