/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pool: '#16a34a',
        mount: '#dc2626',
        whist: '#2563eb',
      },
    },
  },
  plugins: [],
}
