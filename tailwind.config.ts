import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#4AADE0',
          DEFAULT: '#185FA5',
          dark: '#1a4a6b',
        },
      },
    },
  },
  plugins: [],
}
export default config
