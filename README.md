# AI Study Chat

A modern, responsive chatbot interface built with Next.js and Tailwind CSS.

## Features

- 🎨 Clean, modern UI with smooth animations
- 📱 Fully responsive design for all devices
- 💬 Real-time message updates with typing indicators
- 📝 Markdown support in messages
- 🌙 Dark mode support (coming soon)
- ⌨️ Keyboard shortcuts for better UX
- 🎯 Accessible design with proper ARIA labels

## Tech Stack

- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- Framer Motion for animations
- React Markdown for message formatting
- Date-fns for timestamp formatting

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Development

The project uses:
- ESLint for code linting
- TypeScript for type safety
- Tailwind CSS for styling
- Framer Motion for animations

## Project Structure

```
src/
├── app/
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Main chat interface
│   └── globals.css   # Global styles
├── components/       # Reusable components
├── lib/
│   └── utils.ts      # Utility functions
└── types/           # TypeScript type definitions
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT 