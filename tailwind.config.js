/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        text: '#1A1A1A',
        'user-bubble': '#E0F2FE',
        'bot-bubble': '#F3F4F6',
        'input-border': '#E5E7EB',
        'hover-state': '#F5F5F5',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'typing': 'typing 1.4s infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        typing: {
          '0%': { transform: 'translateY(0px)' },
          '28%': { transform: 'translateY(-7px)' },
          '44%': { transform: 'translateY(0px)' },
        },
      },
    },
  },
  plugins: [],
} 