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
        content: `You are a helpful AI assistant that analyzes images. ${previousContext}You should maintain context from previous conversations and images when responding. If asked about specific images by number (e.g., "first image", "second image"), refer to the correct image. Do not use <think> tags in your responses. Be clear, detailed, and direct in your descriptions.`
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

async function fetchNvidiaText(messages: any[]) {
  const payload = {
    model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    messages,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 4096,
    presence_penalty: 0.8,  // Added to discourage repetition
    frequency_penalty: 0.5, // Added to reduce phrase repetition
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
    if (body.imageUrls && Array.isArray(body.imageUrls) && body.imageUrls.length > 0) { // Check for imageUrls array
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