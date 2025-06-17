import { NextRequest } from 'next/server';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Update the fetchWithTimeout function to optimize timeout handling
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 25000) { // Increased to 25 seconds
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

// Add a simple in-memory cache for NVIDIA API responses
const apiCache = new Map<string, {data: any, timestamp: number}>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Generates a cache key for NVIDIA API calls
function generateCacheKey(messages: any[], options: any = {}): string {
  // Create a simplified version of messages for the cache key (just the content)
  const simplifiedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content.slice(0, 200) // Only use first 200 chars of content for key
  }));
  
  // Create a key combining the messages and any other options that affect the response
  return JSON.stringify({
    messages: simplifiedMessages,
    temperature: options.temperature || 0.6,
    max_tokens: options.max_tokens || 1000
  });
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

// Update the fetchNvidiaText function to use caching and handle timeouts better
async function fetchNvidiaText(messages: any[], options: any = {}) {
  // Generate a cache key for this request
  const cacheKey = generateCacheKey(messages, options);
  
  // Check if we have a cached response
  const cachedItem = apiCache.get(cacheKey);
  if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_TTL) {
    console.log('Using cached NVIDIA API response');
    return new Response(cachedItem.data, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=900' // 15 minutes
      }
    });
  }
  
  // If not in cache or expired, make the API call
  const payload = {
    model: 'deepseek-ai/deepseek-r1',
    messages,
    temperature: options.temperature || 0.6,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens || 1000, // Reduced from 10000 to 1000 for faster responses
    presence_penalty: options.presence_penalty || 0.8,
    frequency_penalty: options.frequency_penalty || 0.5,
    stream: options.stream !== undefined ? options.stream : true,
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
    }, 25000); // 25-second timeout for NVIDIA API

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
          error: 'Gateway Timeout: The AI service took too long to respond. Please try again with a simpler query.',
          details: errorText
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // For streaming requests, we can't cache the response
      if (!payload.stream) {
        // Cache the error response too to avoid repeated failures
        const errorData = JSON.stringify({
          error: `Nvidia API Error: ${errorText}`,
          status: res.status
        });
        apiCache.set(cacheKey, { data: errorData, timestamp: Date.now() });
      }
      
      return new Response(JSON.stringify({
        error: `Nvidia API Error: ${errorText}`,
        status: res.status
      }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // For streaming responses, we just return the stream
    if (payload.stream) {
    return res;
    }
    
    // For non-streaming responses, cache the result
    const responseData = await res.text();
    apiCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    
    return new Response(responseData, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=900' // 15 minutes
      }
    });
  } catch (err: any) {
    console.error('Error in fetchNvidiaText:', err);
    const isTimeout = err.message.includes('timed out');
    
    // Create a fallback response for timeouts
    if (isTimeout) {
      const fallbackResponse = JSON.stringify({
        error: 'Gateway Timeout: The AI service took too long to respond. Please try again with a simpler query.',
        details: err.message,
        choices: [
          {
            message: {
              content: "I apologize, but the request took too long to process. Please try a simpler query or try again later."
            }
          }
        ]
      });
      
      // Don't cache timeout errors as they may be temporary
      return new Response(fallbackResponse, {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // For other errors, create a generic error response
    const errorResponse = JSON.stringify({
      error: 'Failed to process request',
      details: err.message
    });
    
    // Cache the error to prevent repeated failures
    if (!payload.stream) {
      apiCache.set(cacheKey, { data: errorResponse, timestamp: Date.now() });
    }
    
    return new Response(errorResponse, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  // Validate required API keys at runtime
  if (!TEXT_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Configuration Error',
      details: 'NVIDIA_API_KEY is not configured'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Configuration Error', 
      details: 'OPENROUTER_API_KEY is not configured'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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
    
    // Limit message content length to reduce token size and response time
    const optimizedMessages = body.messages.map((msg: any) => ({
      ...msg,
      content: typeof msg.content === 'string' && msg.content.length > 4000 
        ? msg.content.substring(0, 4000) + "..." 
        : msg.content
    }));
    
    // Extract any model parameters with reasonable defaults
    const modelParams = {
      temperature: body.temperature || 0.6,
      top_p: body.top_p || 0.95,
      max_tokens: body.max_tokens || 1000, // Reduced from 10000 to 1000 for faster responses
      presence_penalty: body.presence_penalty || 0.8,
      frequency_penalty: body.frequency_penalty || 0.5,
      stream: body.stream !== undefined ? body.stream : true,
    };
      
    // Make the API call with optimized messages and parameters
    return fetchNvidiaText(optimizedMessages, modelParams);
  } catch (err: any) {
    console.error('Error in NVIDIA API route:', err);
    const isTimeout = err.message.includes('timed out');
    
    return new Response(JSON.stringify({
      error: isTimeout 
        ? 'Gateway Timeout: The AI service took too long to respond. Please try again with a simpler query.'
        : 'Internal Server Error',
      details: err.message,
      timestamp: new Date().toISOString()
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 