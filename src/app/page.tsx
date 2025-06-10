import { redirect } from 'next/navigation';

// Add system prompt for structured output formatting
const SYSTEM_PROMPT = `You are a helpful AI assistant. Format your responses using the following structure:

1. Start with a short summary paragraph that directly answers the question.
2. Organize information into sections with clear ## Section Title headers.
3. Under each section, use bullet points with bold labels followed by descriptions:
   * **Label:** Description text here.
   * **Another Label:** More descriptive content here.
4. Add as many sections as needed based on the topic.
5. Keep descriptions concise but informative - adapt length based on complexity.`;

export default function Home() {
  redirect('/search-mode');
} 