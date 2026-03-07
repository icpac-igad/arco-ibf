import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        icpac: {
          green: {
            DEFAULT: '#275740',
            50: '#e8f0ec',
            100: '#d1e1d9',
            200: '#a3c3b3',
            300: '#75a58d',
            400: '#478767',
            500: '#275740',
            600: '#1f4633',
            700: '#173426',
            800: '#0f2319',
            900: '#08110d',
          },
          gold: {
            DEFAULT: '#F7A600',
            50: '#fff8e6',
            100: '#fef0cc',
            200: '#fde199',
            300: '#fbd266',
            400: '#fac333',
            500: '#F7A600',
            600: '#c68500',
            700: '#946400',
            800: '#634200',
            900: '#312100',
          },
          light: '#F8F9FB',
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
