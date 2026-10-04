/** @type {import('tailwindcss').Config} */
module.exports = {
  // Include every location you might use className/tw including route groups with parentheses.
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6",
        accent: "#F59E08",
        text: "#333333",
        muted: "#666666",
        bg: "#F5F5F5",
        physio: {
          dark: "#0e7468",
          primary: "#089769",
          light: "#f0fdfa",
          hover: "#067a54",
          text: "#134e4a",
          accent: "#ccfbf1",
        },
      },
    },
  },
  plugins: [],
};
