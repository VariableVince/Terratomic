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
        // Existing colors
        "olive-green": "#6B8E23",
        "dark-gray": "#36454F",
        steel: "#4682B4",
        tan: "#D2B48C",
        "muted-red": "#CC5500",
        "muted-orange": "#FF8C00",
        "crt-green": "#00FF00",

        // Extended Cold War / WWII palette
        "olive-dark": "#2F3223", // Deep command console background
        "olive-mid": "#3B3E2C", // Mid-tone panel sections
        "khaki-light": "#D8D1B1", // Text on dark surfaces
        "warning-red": "#B0504E", // Alerts & critical indicators
        "accent-green": "#4EB057", // Positive/active indicators

        // Matches your variables.css for consistent styling
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
