/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/js/**/*.js"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["Cairo", "sans-serif"],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"], // You can configure themes here
  },
};
