import { NextRequest } from 'next/server';

export const runtime = 'edge';

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
const nvidiaBackendCache: Record<string, { data: any, timestamp: number }> = {};
// In-flight request lock map
const nvidiaInFlight: Record<string, Promise<any>> = {};
const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

// Generate a cache key for deduplication
function getNvidiaBackendCacheKey(messages: any[]): string {
  // Extract user message content for deduplication (normalize to lowercase)
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => {
      if (typeof m.content === 'string') {
        return m.content.trim().toLowerCase();
      } else if (Array.isArray(m.content)) {
        // Handle array content (e.g., for images)
        return m.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text.trim().toLowerCase())
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
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      // Re-throw a specific error for timeout to be caught by the main handler
      throw new Error('Request timed out'); 
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
  previousMessages: any[] = [], // Add parameter for previous messages
  previousImageDescriptions: string[] = [] // Add parameter for previous image descriptions
) {
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
  const formattedPreviousMessages = previousMessages.map(msg => {
    // Convert to the format Gemma expects
    return {
      role: msg.role,
      content: msg.content
    };
  });

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
              url: targetImageUrl // Send only the first image URL to Gemma for now
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
    // Return a Response object with status for consistent error handling upstream
    return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errorText}` }), { status: res.status, headers: { 'Content-Type': 'application/json'} });
  }
  return res; // Return the full response object to be processed by the caller
}

async function fetchNvidiaText(messages: any[], options: any = {}) {
  const payload = {
    model: 'deepseek-ai/deepseek-r1',
    messages,
    temperature: options.temperature || 0.6,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens || 10000, // Support custom token limit, default to 10000
    presence_penalty: options.presence_penalty || 0.8,  // Discourage repetition
    frequency_penalty: options.frequency_penalty || 0.5, // Reduce phrase repetition
    stream: true, // Always stream
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
    // Return a Response object with status for consistent error handling upstream
    return new Response(JSON.stringify({ error: `Nvidia API Error: ${errorText}` }), { status: res.status, headers: { 'Content-Type': 'application/json'} });
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

  let body;
  try {
    // First get the raw request text to check for invalid JSON formatting
    const rawRequestText = await req.text();
    
    // Check if the raw text starts with 'data:' which would indicate SSE format mistakenly sent as JSON
    if (rawRequestText.trim().startsWith('data:')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON format', 
        details: 'Request body appears to be in SSE format (starts with "data:") instead of JSON'
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    // Attempt to parse the JSON
    try {
      body = JSON.parse(rawRequestText);
    } catch (parseError: any) {
      console.error("[API /api/nvidia] JSON parse error:", parseError.message);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body', 
        details: parseError.message
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    // Create a cache key based on messages
    const cacheKey = getNvidiaBackendCacheKey(body.messages || []);
    console.log(`[NVIDIA] Request with cache key: ${cacheKey.substring(0, 50)}...`);
    
    // Extract model parameters if provided
    const modelParams = {
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
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Deduplication: If a request is already in flight, wait for it
    if (typeof nvidiaInFlight[cacheKey] !== "undefined" && !body.stream) {
      console.log(`[NVIDIA] Waiting for in-flight request for key: ${cacheKey.substring(0, 50)}...`);
      try {
        const data = await nvidiaInFlight[cacheKey];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        // If the in-flight request failed, proceed with a new request
        console.error(`[NVIDIA] In-flight request failed:`, err);
        delete nvidiaInFlight[cacheKey];
      }
    }
    
    // For streaming requests, we can't deduplicate the same way
    // because we need to return a stream to each client
    
    if (body.imageUrls && Array.isArray(body.imageUrls) && body.imageUrls.length > 0) {
      console.log(`[API /api/nvidia] Received image request for URLs: ${body.imageUrls.join(', ')}`);
      
      // Extract previous user messages and image descriptions
      const previousUserMessages = body.messages?.filter((m:any) => m.role === 'user') || [];
      
      // Extract previous image descriptions from the conversation
      const previousImageDescriptions = body.previousImageDescriptions || [];
      
      // 1. Get image description from OpenRouter with context
      console.log("[API /api/nvidia] Calling OpenRouter with conversation context...");
      const openRouterRes = await fetchOpenRouterImageAnalysis(
        body.imageUrls, 
        OPENROUTER_API_KEY,
        previousUserMessages,
        previousImageDescriptions
      );
      
      if (!openRouterRes.ok) {
        return openRouterRes; 
      }
      
      const openRouterData = await openRouterRes.json();
      const imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image(s).';
      console.log("[API /api/nvidia] OpenRouter description received:", imageDescription.substring(0, 100) + "...");

      // 2. Construct prompt for Nemotron
      const userImagePrompt = body.messages?.filter((m:any) => m.role === 'user').pop()?.content || (body.imageUrls.length > 1 ? "Tell me more about these images." : "Tell me more about what was found in the image.");

      // Get the system message from the request which now includes all image contexts
      const systemMessage = body.messages?.find((m:any) => m.role === 'system')?.content || '';
      
      // Extract the image context part if present (everything after the SYSTEM_PROMPT)
      const imageContext = body.imageUrls.length > 1 
        ? `A set of ${body.imageUrls.length} images were provided.` 
        : "An image was provided.";
      
      // Create a comprehensive system prompt that includes:
      // 1. The original system message (which now includes all previous image contexts)
      // 2. The new image description
      const nemotronSystemPrompt = `${systemMessage}\n\nLatest image analysis: "${imageDescription}"\n\nThe user has provided the following specific query: "${userImagePrompt}". Based on the image description(s) and the user's query, provide a helpful and detailed response.`;
      
      const nemotronMessages = [
        { role: "system", content: nemotronSystemPrompt },
        // The user's direct prompt about the image is now part of the system prompt for better context.
        // We can send a generic follow-up here, or make it more dynamic if needed.
        { role: "user", content: "Please proceed with the analysis based on my query and the image description." } 
      ];
      
      // 3. Call Nemotron and stream its response
      console.log("[API /api/nvidia] Calling Nemotron with streaming enabled...");
      const nemotronRes = await fetchNvidiaText(nemotronMessages, modelParams); // Pass model parameters
      
      if (!nemotronRes.ok) {
          // If Nemotron returns an error (e.g. 4xx, 5xx), it won't be a stream.
          // We expect our fetchNvidiaText to already convert this to a JSON error Response.
          return nemotronRes;
      }
      
      // Return the stream directly to the client
      // Ensure appropriate headers for streaming
      const headers = new Headers(nemotronRes.headers);
      headers.set('Content-Type', 'text/event-stream'); // Or 'application/x-ndjson' depending on actual stream format
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');

      return new Response(nemotronRes.body, {
      status: 200,
        headers: headers,
    });

  } else {
      console.log("[API /api/nvidia] Received text-only request (streaming)...");
      const { messages } = body;
      
      // For text-only, also enable streaming
      // If not streaming, we can use deduplication
      if (!body.stream) {
        nvidiaInFlight[cacheKey] = (async () => {
          console.log(`[NVIDIA] Making new NVIDIA API call for key: ${cacheKey.substring(0, 50)}...`);
          const nemotronRes = await fetchNvidiaText(messages, modelParams);
          if (!nemotronRes.ok) {
            throw new Error(`Nvidia API Error: ${await nemotronRes.text()}`);
          }
          const data = await nemotronRes.json();
          nvidiaBackendCache[cacheKey] = { data, timestamp: Date.now() };
          return data;
        })();
        
        try {
          const data = await nvidiaInFlight[cacheKey];
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } finally {
          delete nvidiaInFlight[cacheKey];
        }
      }
      
      // For streaming, we can't use the same deduplication mechanism
      const nemotronRes = await fetchNvidiaText(messages, modelParams);
      
      if (!nemotronRes.ok) {
        return nemotronRes;
      }

      const headers = new Headers(nemotronRes.headers);
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');
      
      return new Response(nemotronRes.body, {
        status: 200,
        headers: headers,
      });
    }
  } catch (err: any) {
    console.error("[API /api/nvidia] Error in POST:", err);
    const isTimeout = err.message === 'Request timed out';
    return new Response(JSON.stringify({
      error: isTimeout ? 'Gateway Timeout: The AI service took too long to respond.' : 'Failed to process request',
      details: err.message || String(err)
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 