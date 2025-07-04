import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const TEXT_API_KEY2 = process.env.NVIDIA_API_KEY2 || '';
const TEXT_API_KEY3 = process.env.NVIDIA_API_KEY3 || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Function to select the appropriate API key based on mode
function getApiKeyForMode(mode: string): string {
  switch (mode) {
    case 'browser_chat':
      return TEXT_API_KEY3; // Use third key for browser chat mode
    case 'reasoning':
      return TEXT_API_KEY3; // Use third key for reasoning mode with DeepSeek
    case 'image_analysis':
      return TEXT_API_KEY2; // Use second key for image analysis
    case 'artifact':
      return TEXT_API_KEY3; // Use third key for artifact generation
    case 'chat':
    case 'default':
      return TEXT_API_KEY3; // Use third key for default chat mode
    default:
      return TEXT_API_KEY; // Fallback to original key
  }
}

// Function to select the appropriate model based on mode
function getModelForMode(mode: string): string {
  switch (mode) {
    case 'browser_chat':
      return 'nvidia/llama-3.1-nemotron-ultra-253b-v1'; // Nemotron for search
    case 'reasoning':
      return 'nvidia/llama-3.1-nemotron-ultra-253b-v1'; // Nemotron for think mode
    case 'image_analysis':
      return 'mistralai/mistral-large'; // Updated NVIDIA vision model
    case 'artifact':
      return 'nvidia/llama-3.1-nemotron-ultra-253b-v1'; // Nemotron model for artifact generation
    case 'chat':
    case 'default':
      return 'qwen/qwen3-235b-a22b'; // Qwen model for default chat
    default:
      return 'qwen/qwen3-235b-a22b'; // Fallback to Qwen model
  }
}

// Update the fetchWithTimeout function to optimize timeout handling
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 45000) { // Increased to 45 seconds for artifact generation
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
    max_tokens: options.max_tokens || 8139
  });
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
  
  // Use messages as-is, no artifact detection or enhancement
  const enhancedMessages = messages;

  // If not in cache or expired, make the API call
  const selectedModel = getModelForMode(options.mode || 'default');
  const payload = {
    model: selectedModel,
    messages: enhancedMessages,
    temperature: options.temperature || 0.6,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens || (
      options.mode === 'artifact' ? 8000 : // Still allow explicit artifact mode for UI
      options.mode === 'reasoning' ? 32768 :
      options.mode === 'browser_chat' ? 8000 :
      1000
    ),
    presence_penalty: options.presence_penalty || (
      options.mode === 'artifact' ? 0.4 :
      options.mode === 'reasoning' ? 0 :
      0.8
    ),
    frequency_penalty: options.frequency_penalty || (
      options.mode === 'artifact' ? 0.4 :
      options.mode === 'reasoning' ? 0 :
      0.5
    ),
    repetition_penalty: options.repetition_penalty || (
      options.mode === 'artifact' ? 1.2 :
      undefined
    ),
    ...(options.top_k !== undefined && { top_k: options.top_k }),
    ...(options.min_p !== undefined && { min_p: options.min_p }),
    ...(options.mode === 'reasoning' && { 
      chat_template_kwargs: { thinking: false } 
    }),
    stream: options.stream !== undefined ? options.stream : true,
  };

  console.log(`[NVIDIA API] Making request - Mode: ${options.mode || 'default'}, Model: ${payload.model}, Stream: ${payload.stream}, Max Tokens: ${payload.max_tokens}, API Key: ${options.mode === 'reasoning' ? 'NVIDIA_API_KEY3' : options.mode === 'image_analysis' ? 'NVIDIA_API_KEY2' : 'NVIDIA_API_KEY3'}`);
  
  try {
    // Use a single timeout for all requests (e.g., 30 seconds)
    const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKeyForMode(options.mode || 'default')}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'text/event-stream; charset=utf-8',
      },
      body: JSON.stringify(payload),
    }, 30000); // 30-second timeout for all

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
    
    // For non-streaming, cache the response
    const data = await res.text();
    apiCache.set(cacheKey, { data, timestamp: Date.now() });
    return new Response(data, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=900'
      }
    });
  } catch (err: any) {
    console.error('Nvidia API fetch error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// New function to handle vision mode with OpenAI SDK approach
async function fetchNvidiaVision(messages: any[], options: any = {}) {
  const client = new OpenAI({
    apiKey: getApiKeyForMode('image_analysis'),
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  try {
    console.log(`[NVIDIA Vision] Making request - Model: nvidia/llama-3.1-nemotron-nano-vl-8b-v1, Stream: true`);
    
    const completion = await client.chat.completions.create({
      model: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
      messages: messages,
      temperature: options.temperature || 1.00,
      top_p: options.top_p || 0.01,
      max_tokens: options.max_tokens || 1024,
      stream: true,
    });

    // Create a ReadableStream to match the expected return format
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let accumulatedText = '';
          
          for await (const chunk of completion) {
            if (chunk.choices[0]?.delta?.content) {
              const content = chunk.choices[0].delta.content;
              accumulatedText += content;
              
              // Format the response to match the structure expected by the default chat renderer
              // This ensures Vision Mode responses get the same markdown processing
              const sseData = `data: ${JSON.stringify({
                choices: [{
                  delta: {
                    content: content
                  },
                  message: {
                    content: content
                  },
                  index: 0
                }],
                id: "vision-" + Date.now(),
                model: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
                object: "chat.completion.chunk"
              })}\n\n`;
              
              controller.enqueue(new TextEncoder().encode(sseData));
            }
          }
          
          // Send a final chunk with complete content to ensure proper rendering
          const finalData = `data: ${JSON.stringify({
            choices: [{
              delta: { content: "" },
              message: { content: accumulatedText },
              index: 0,
              finish_reason: "stop"
            }],
            id: "vision-final-" + Date.now(),
            model: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
            object: "chat.completion.chunk"
          })}\n\n`;
          
          controller.enqueue(new TextEncoder().encode(finalData));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Error in vision streaming:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Error in fetchNvidiaVision:', error);
    return new Response(JSON.stringify({
      error: 'Vision API Error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  // Validate required API keys at runtime
  if (!TEXT_API_KEY && !TEXT_API_KEY2 && !TEXT_API_KEY3) {
    return new Response(JSON.stringify({
      error: 'Configuration Error',
      details: 'None of the NVIDIA API keys (NVIDIA_API_KEY, NVIDIA_API_KEY2, NVIDIA_API_KEY3) are configured'
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
    
    // Validate mode and corresponding API key availability
    const mode = body.mode || 'default';
    const requiredApiKey = getApiKeyForMode(mode);
    
    if (!requiredApiKey) {
      const keyName = mode === 'reasoning' ? 'NVIDIA_API_KEY' : mode === 'image_analysis' ? 'NVIDIA_API_KEY2' : 'NVIDIA_API_KEY3';
      return new Response(JSON.stringify({
        error: 'Configuration Error',
        details: `${keyName} is required for ${mode} mode but is not configured`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Limit message content length to reduce token size and response time
    // (Removed 4000 character truncation to allow full prompt content)
    const optimizedMessages = body.messages;
    
    // Extract any model parameters with reasonable defaults
    const modelParams = {
      temperature: body.temperature || 0.6,
      top_p: body.top_p || 0.95,
      top_k: body.top_k || undefined,
      min_p: body.min_p || undefined,
      max_tokens: body.max_tokens || 1000, // Will be increased for artifacts in fetchNvidiaText
      presence_penalty: body.presence_penalty || 0.8,
      frequency_penalty: body.frequency_penalty || 0.5,
      stream: body.stream !== undefined ? body.stream : true,
      mode: mode,
      // Note: response_format is intentionally removed for DeepSeek R1 compatibility
    };
      
    // Route to appropriate function based on mode
    if (mode === 'image_analysis') {
      return fetchNvidiaVision(optimizedMessages, modelParams);
    } else {
      // Make the API call with optimized messages and parameters for other modes
      return fetchNvidiaText(optimizedMessages, modelParams);
    }
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