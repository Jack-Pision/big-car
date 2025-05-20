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

// New function to fetch image analysis from OpenRouter (via our existing proxy)
async function fetchOpenRouterImageAnalysis(imageUrl: string, openRouterApiKey: string) {
  // The prompt for OpenRouter is already set in the /api/openrouter-proxy route
  const requestBody = {
    model: 'google/gemma-3-27b-it',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            // The actual prompt text is defined in /api/openrouter-proxy/route.ts
            // We just need to ensure the structure is what OpenRouter expects for an image query via proxy
            text: "Describe this image."
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
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

async function fetchNvidiaText(messages: any[]) {
  const payload = {
    model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    messages,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 4096,
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

  try {
    const body = await req.json();
    if (body.imageUrl) {
      console.log(`[API /api/nvidia] Received image request for URL: ${body.imageUrl}`);
      // 1. Get image description from OpenRouter (non-streamed for now)
      console.log("[API /api/nvidia] Calling OpenRouter...");
      const openRouterRes = await fetchOpenRouterImageAnalysis(body.imageUrl, OPENROUTER_API_KEY);
      if (!openRouterRes.ok) {
        return openRouterRes; 
      }
      const openRouterData = await openRouterRes.json();
      const imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image.';
      console.log("[API /api/nvidia] OpenRouter description received:", imageDescription.substring(0, 100) + "...");

      // 2. Construct prompt for Nemotron
      // Extract the last user message from the payload, which should be the user's prompt related to the image
      const userImagePrompt = body.messages?.filter((m:any) => m.role === 'user').pop()?.content || "Tell me more about what was found in the image.";

      const nemotronSystemPrompt = `You are an advanced AI assistant. An image was analyzed, and the following description was generated: "${imageDescription}". The user has provided the following specific query about this image: "${userImagePrompt}". Based on both the image description and the user's query, provide a helpful and detailed response. If the user's query is a question, answer it. If it's a request, fulfill it.`;
      
      const nemotronMessages = [
        { role: "system", content: nemotronSystemPrompt },
        // The user's direct prompt about the image is now part of the system prompt for better context.
        // We can send a generic follow-up here, or make it more dynamic if needed.
        { role: "user", content: "Please proceed with the analysis based on my query and the image description." } 
      ];
      
      // 3. Call Nemotron and stream its response
      console.log("[API /api/nvidia] Calling Nemotron with streaming enabled...");
      const nemotronRes = await fetchNvidiaText(nemotronMessages); // Always streaming
      
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
      const nemotronRes = await fetchNvidiaText(messages); // Always streaming
      
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