import Link from 'next/link';

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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">AI Study App</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
        <Link href="/streaming-chat" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Chat</h2>
            <p className="text-gray-600">Engage in a conversation with the AI assistant for personalized help and guidance.</p>
          </div>
        </Link>
        
        <Link href="/search-mode" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Search Mode</h2>
            <p className="text-gray-600">Use enhanced search capabilities to find comprehensive answers from multiple sources.</p>
          </div>
        </Link>
        
        <Link href="/templated-chat" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Templated Chat</h2>
            <p className="text-gray-600">Access specialized chat templates for specific learning scenarios and use cases.</p>
          </div>
        </Link>
        
        <Link href="/visual-learning" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Visual Learning</h2>
            <p className="text-gray-600">Learn through visual explanations, diagrams, and interactive visual content.</p>
          </div>
        </Link>
        
        <Link href="/mind-flow" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Mind Flow</h2>
            <p className="text-gray-600">Explore interconnected ideas and concepts through an interactive knowledge graph.</p>
          </div>
        </Link>
        
        <Link href="/help" className="block">
          <div className="p-6 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-3">Help & Tips</h2>
            <p className="text-gray-600">Get guidance on how to use the app effectively and make the most of its features.</p>
          </div>
        </Link>
      </div>
    </div>
  );
} 