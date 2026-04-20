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
          light: '#c9a870',
          DEFAULT: '#b8895a',
          dark: '#2f5a5e',
        },
        sand: {
          50: '#faf7f2',
          100: '#f3ede3',
        },
        ink: {
          500: '#5a6a6e',
          700: '#3a4a4e',
          900: '#1f2a2e',
        },
        brass: {
          500: '#c9a870',
          600: '#b8895a',
        },
        teal: {
          700: '#2f5a5e',
          800: '#24494d',
        },
      },
    },
  },
  plugins: [],
}
export default config
