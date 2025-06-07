import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Type definitions
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

interface ModelOptions {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

interface RequestBody {
  messages?: Message[];
  imageUrls?: string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  previousImageDescriptions?: string[];
}

class NvidiaApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'NvidiaApiError';
  }
}

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Add validation for required API keys
if (!TEXT_API_KEY) {
  throw new Error('NVIDIA_API_KEY is required');
}
if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required');
}

// Backend in-memory cache for NVIDIA API results to prevent duplicate calls
const nvidiaBackendCache: Record<string, CacheEntry> = {};
// In-flight request lock map
const nvidiaInFlight: Record<string, Promise<unknown>> = {};
const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

// Generate a cache key for deduplication
function getNvidiaBackendCacheKey(messages: Message[]): string {
  // Extract user message content for deduplication (normalize to lowercase)
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => {
      if (typeof m.content === 'string') {
        return m.content.trim().toLowerCase();
      } else if (Array.isArray(m.content)) {
        // Handle array content (e.g., for images)
        return m.content
          .filter(c => c.type === 'text')
          .map(c => c.text?.trim().toLowerCase() || '')
          .join(' ');
      }
      return '';
    })
    .join('|');
  
  // Extract system message content for deduplication (normalize to lowercase)
  const systemMessage = messages
    .find(m => m.role === 'system')?.content || '';
  
  const systemKey = typeof systemMessage === 'string' 
    ? systemMessage.trim().toLowerCase().substring(0, 100) // First 100 chars
    : '';
  
  // Combine to create a unique key
  return `${systemKey}::${userMessages}`;
}

// Helper function for fetch with timeout
async function fetchWithTimeout(
  resource: string, 
  options: RequestInit = {}, 
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err: unknown) {
    clearTimeout(id);
    if (err instanceof Error && err.name === 'AbortError') {
      // Re-throw a specific error for timeout to be caught by the main handler
      throw new NvidiaApiError('Request timed out', 504);
    }
    throw err; // Re-throw other errors
  }
}

// Replace all system prompt content for AI responses with the following:
const DETAILED_SYSTEM_PROMPT = `You are a helpful, knowledgeable, and friendly AI assistant. Your goal is to assist the user in a way that is clear, thoughtful, and genuinely useful. Follow these guidelines:

1. Clarity & Helpfulness

Always prioritize being helpful over being brief.

Provide clear, step-by-step explanations when appropriate.

Use examples to clarify complex ideas.

When explaining code, math, or technical topics, break it down gradually.

When the user asks "why" or "how," go into depth—don't oversimplify.

Offer analogies where helpful for deeper understanding.

Use diagrams or markdown formatting if supported by the interface.

If a question has multiple interpretations, briefly address each or ask for clarification.

Tailor your answer based on the user's apparent skill level or prior context.

Include potential edge cases, caveats, or alternatives if relevant.

2. Structure & Readability

Format responses with short paragraphs, bullet points, and headings where appropriate.

Use bold or italics to highlight key concepts.

Keep sentences concise, but don't sacrifice meaning or flow.

Avoid overly technical jargon unless the user is advanced or has used it first.

Always ensure readability and user comprehension.

Use code blocks for code, and quote blocks for referenced text.

End complex answers with a brief summary or takeaway.

3. Tone & Interaction

Be warm, polite, and conversational—like a thoughtful expert or tutor.

Express enthusiasm when users make progress or ask great questions.

Be curious about what the user might mean—anticipate needs.

Never be dismissive, sarcastic, or cold.

Empathize with confusion—encourage curiosity.

When the user asks for help, always respond with care and detail.

Use phrases like "Here's what I found", "Let's walk through it", or "A good way to think about this is…"

If appropriate, say "Does that help?" to invite clarification or follow-up.

 4. Flexibility & Adaptation

Adjust your tone and detail based on user behavior and input.

If the user asks for brevity or a summary, comply immediately.

If the user asks for code, generate clean, idiomatic, and well-commented examples.

When explaining code, describe what it does and why it works that way.

Support common formats: pseudocode, markdown, JSON, tables, etc.

Offer optional follow-up steps or related ideas after answering.

Recognize when a user is stuck and offer encouragement or a different approach.

Use emojis sparingly for friendliness if tone supports it.

Offer references or links when applicable (if available).

Mention limitations of an approach if relevant, but not excessively.

 5. AI Behavior Standards

Never make up facts; admit what you don't know.

If unsure, say "I'm not sure, but here's what I think based on available info."

Be transparent when you're making a guess or using assumptions.

Never fake citations or sources.

Don't argue—acknowledge and adapt.

Clarify misunderstandings gently if a user is incorrect.

Respect user intent—respond to what they mean, not just what they said.

6. Learning & Discovery

Encourage users to think critically and ask deeper questions.

When appropriate, suggest ways the user can verify or test an answer.

Share insights that go beyond the surface-level answer.

Encourage iterative problem solving—"try this and see what happens."

If there's a better way to do something, suggest it tactfully.

7. Conversation Management

Avoid repeating previously given information unless the user requests it.

If the user references earlier parts of the conversation, follow up accordingly.

Use memory (if supported) to improve helpfulness across multiple turns.

For long threads, help summarize or anchor back to the main topic.

When ending a conversation, offer follow-up options or future guidance.`;

// New function to fetch image analysis from OpenRouter (via our existing proxy)
async function fetchOpenRouterImageAnalysis(
  imageUrls: string[], 
  openRouterApiKey: string,
  previousMessages: Message[] = [],
  previousImageDescriptions: string[] = []
): Promise<Response> {
  // If multiple images, pick the first one for now, or adapt the prompt for multiple images.
  const targetImageUrl = imageUrls[0]; 

  // Create context from previous image descriptions
  let previousContext = "";
  if (previousImageDescriptions.length > 0) {
    // Format the previous image descriptions in a more structured way
    const formattedDescriptions = previousImageDescriptions.map((desc, idx) => 
      `Image ${idx + 1}: "${desc}"`
    ).join(' | ');
    
    previousContext = `Previous image descriptions: ${formattedDescriptions}. `;
  }

  // Format previous messages for Gemma
  const formattedPreviousMessages = previousMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // Limit context to prevent token overflow (keep last 5 messages)
  const limitedPreviousMessages = formattedPreviousMessages.slice(-5);

  const requestBody = {
    model: 'google/gemma-3-27b-it',
    messages: [
      // Add system message to maintain context
      {
        role: 'system',
        content: DETAILED_SYSTEM_PROMPT
      },
      // Include previous messages for context
      ...limitedPreviousMessages,
      // Add current request
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: imageUrls.length > 1 
              ? `Describe the first image in this set of images. ${previousContext ? "Reference previous images if relevant." : ""}`
              : `Describe this image. ${previousContext ? "Reference previous images if relevant." : ""}`
          },
          {
            type: 'image_url',
            image_url: {
              url: targetImageUrl
            }
          }
        ]
      }
    ],
  };

  // Using fetchWithTimeout for the OpenRouter API call
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey}`,
    },
    body: JSON.stringify(requestBody),
  }, 10000); // 10-second timeout for OpenRouter

  if (!res.ok) {
    const errorText = await res.text();
    console.error('OpenRouter API error:', errorText);
    throw new NvidiaApiError(`OpenRouter API Error: ${errorText}`, res.status);
  }
  return res;
}

async function fetchNvidiaText(
  messages: Message[], 
  options: ModelOptions = {}
): Promise<Response> {
  const payload = {
    model: 'deepseek-ai/deepseek-r1',
    messages,
    temperature: options.temperature || 0.6,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens || 10000,
    presence_penalty: options.presence_penalty || 0.8,
    frequency_penalty: options.frequency_penalty || 0.5,
    stream: true,
  };
  
  // Using fetchWithTimeout for the NVIDIA API call
  const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEXT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, 12000); // 12-second timeout for NVIDIA Nemotron

  if (!res.ok) {
    const errorText = await res.text();
    throw new NvidiaApiError(`Nvidia API Error: ${errorText}`, res.status);
  }
  return res;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Unsupported content type' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const body = await req.json() as RequestBody;
    
    // Create a cache key based on messages
    const cacheKey = getNvidiaBackendCacheKey(body.messages || []);
    console.log(`[NVIDIA] Request with cache key: ${cacheKey.substring(0, 50)}...`);
    
    // Extract model parameters if provided
    const modelParams: ModelOptions = {
      temperature: body.temperature,
      top_p: body.top_p,
      max_tokens: body.max_tokens || 10000,
      presence_penalty: body.presence_penalty,
      frequency_penalty: body.frequency_penalty
    };
    
    // Check cache first (for non-streaming requests only)
    if (!body.stream) {
      const cached = nvidiaBackendCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
        console.log(`[NVIDIA] Returning cached result for key: ${cacheKey.substring(0, 50)}...`);
        return new Response(cached.data as string, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Deduplication: If a request is already in flight, wait for it
    if (typeof nvidiaInFlight[cacheKey] !== "undefined" && !body.stream) {
      console.log(`[NVIDIA] Waiting for in-flight request for key: ${cacheKey.substring(0, 50)}...`);
      try {
        const data = await nvidiaInFlight[cacheKey];
        return new Response(String(data), {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      } catch (err) {
        // If the in-flight request failed, proceed with a new request
        console.error(`[NVIDIA] In-flight request failed:`, err);
        delete nvidiaInFlight[cacheKey];
      }
    }
    
    if (body.imageUrls && Array.isArray(body.imageUrls) && body.imageUrls.length > 0) {
      console.log(`[API /api/nvidia] Received image request for URLs: ${body.imageUrls.join(', ')}`);
      
      // Extract previous user messages and image descriptions
      const previousUserMessages = body.messages?.filter((m): m is Message => 
        m.role === 'user'
      ) || [];
      
      // Extract previous image descriptions from the conversation
      const previousImageDescriptions = body.previousImageDescriptions || [];
      
      try {
        // 1. Get image description from OpenRouter with context
        console.log("[API /api/nvidia] Calling OpenRouter with conversation context...");
        const openRouterRes = await fetchOpenRouterImageAnalysis(
          body.imageUrls, 
          OPENROUTER_API_KEY,
          previousUserMessages,
          previousImageDescriptions
        );
        
        const openRouterData = await openRouterRes.json();
        const imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image(s).';
        console.log("[API /api/nvidia] OpenRouter description received:", imageDescription.substring(0, 100) + "...");

        // 2. Construct prompt for Nemotron
        const userImagePrompt = body.messages?.filter((m): m is Message => 
          m.role === 'user'
        ).pop()?.content || (body.imageUrls.length > 1 ? "Tell me more about these images." : "Tell me more about what was found in the image.");

        // Get the system message from the request
        const systemMessage = body.messages?.find((m): m is Message => 
          m.role === 'system'
        )?.content || '';
        
        // Extract the image context part if present
        const imageContext = body.imageUrls.length > 1 
          ? `A set of ${body.imageUrls.length} images were provided.` 
          : "An image was provided.";
        
        // Create a comprehensive system prompt
        const nemotronSystemPrompt = `${systemMessage}\n\nLatest image analysis: "${imageDescription}"\n\nThe user has provided the following specific query: "${userImagePrompt}". Based on the image description(s) and the user's query, provide a helpful and detailed response.`;
        
        const nemotronMessages: Message[] = [
          { role: "system", content: nemotronSystemPrompt },
          { role: "user", content: "Please proceed with the analysis based on my query and the image description." }
        ];
        
        // 3. Call Nemotron and stream its response
        console.log("[API /api/nvidia] Calling Nemotron with streaming enabled...");
        const nemotronRes = await fetchNvidiaText(nemotronMessages, modelParams);
        
        // Return the stream directly to the client
        const headers = new Headers(nemotronRes.headers);
        headers.set('Content-Type', 'text/event-stream');
        headers.set('Cache-Control', 'no-cache');
        headers.set('Connection', 'keep-alive');

        return new Response(nemotronRes.body, {
          status: 200,
          headers: headers,
        });
      } catch (err) {
        if (err instanceof NvidiaApiError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: err.statusCode || 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw err; // Re-throw other errors to be caught by the outer try-catch
      }
    } else {
      console.log("[API /api/nvidia] Received text-only request (streaming)...");
      const { messages } = body;
      
      if (!messages) {
        throw new NvidiaApiError('No messages provided in request', 400);
      }
      
      // For text-only, also enable streaming
      if (!body.stream) {
        nvidiaInFlight[cacheKey] = (async () => {
          console.log(`[NVIDIA] Making new NVIDIA API call for key: ${cacheKey.substring(0, 50)}...`);
          const nemotronRes = await fetchNvidiaText(messages, modelParams);
          const data = await nemotronRes.text(); // Always treat as text
          nvidiaBackendCache[cacheKey] = { data, timestamp: Date.now() };
          return data;
        })();
        
        try {
          const data = await nvidiaInFlight[cacheKey];
          return new Response(String(data), {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          });
        } finally {
          delete nvidiaInFlight[cacheKey];
        }
      }
      
      // For streaming, we can't use the same deduplication mechanism
      const nemotronRes = await fetchNvidiaText(messages, modelParams);
      
      const headers = new Headers(nemotronRes.headers);
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');
      
      return new Response(nemotronRes.body, {
        status: 200,
        headers: headers,
      });
    }
  } catch (err: unknown) {
    console.error("[API /api/nvidia] Error in POST:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage === 'Request timed out';
    
    return new Response(JSON.stringify({
      error: isTimeout ? 'Gateway Timeout: The AI service took too long to respond.' : 'Failed to process request',
      details: errorMessage
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 