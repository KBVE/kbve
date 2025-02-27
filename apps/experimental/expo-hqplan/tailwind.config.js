/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
      "./apps/experimental/expo-hqplan/**/*.{js,jsx,ts,tsx}",
      "./src/app/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    plugins: [],
  };