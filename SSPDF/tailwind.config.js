/** @type {import('tailwindcss').Config} */
// كانت الأنماط تُولَّد في المتصفح من cdn.tailwindcss.com عند كل فتح، وهو
// سكربت يحجب العرض ولا يصلح للإنتاج. الآن تُبنى مرة واحدة مع Vite.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
};
