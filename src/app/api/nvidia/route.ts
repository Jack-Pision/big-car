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
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after ' + (timeout / 1000) + ' seconds');
    }
    throw err;
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
        content: 'You are a helpful AI assistant that provides detailed and accurate image descriptions. Focus on describing what you see in the image clearly and comprehensively.'
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
    max_tokens: options.max_tokens || 10000,
    presence_penalty: options.presence_penalty || 0.8,
    frequency_penalty: options.frequency_penalty || 0.5,
    stream: true,
  };
  
  try {
    // Using fetchWithTimeout with increased timeout for NVIDIA API call
    const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEXT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, 30000); // 30-second timeout for NVIDIA API

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Nvidia API error:', {
        status: res.status,
        statusText: res.statusText,
        error: errorText,
        timestamp: new Date().toISOString()
      });
      
      // Handle specific error cases
      if (res.status === 504) {
        return new Response(JSON.stringify({
          error: 'Gateway Timeout: The AI service took too long to respond. Please try again.',
          details: errorText
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({
        error: `Nvidia API Error: ${errorText}`,
        status: res.status
      }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return res;
  } catch (err: any) {
    console.error('Error in fetchNvidiaText:', err);
    const isTimeout = err.message.includes('timed out');
    return new Response(JSON.stringify({
      error: isTimeout 
        ? 'Gateway Timeout: The AI service took too long to respond. Please try again.'
        : 'Failed to process request',
      details: err.message
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response(JSON.stringify({ 
      error: 'Unsupported content type',
      details: 'Request must be application/json'
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({
        error: 'Invalid request format',
        details: 'messages array is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract model parameters if provided
    const modelParams = {
      temperature: body.temperature,
      top_p: body.top_p,
      max_tokens: body.max_tokens || 10000, // Use max_tokens from request or default to 10000
      presence_penalty: body.presence_penalty,
      frequency_penalty: body.frequency_penalty
    };
    
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
      const nemotronRes = await fetchNvidiaText(messages, modelParams); // Pass model parameters
      
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
    console.error('Error in NVIDIA API route:', err);
    const isTimeout = err.message.includes('timed out');
    return new Response(JSON.stringify({
      error: isTimeout 
        ? 'Gateway Timeout: The AI service took too long to respond. Please try again.'
        : 'Internal Server Error',
      details: err.message,
      timestamp: new Date().toISOString()
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 