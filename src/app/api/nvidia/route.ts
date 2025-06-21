import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const TEXT_API_KEY2 = process.env.NVIDIA_API_KEY2 || '';
const TEXT_API_KEY3 = process.env.NVIDIA_API_KEY3 || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Function to select the appropriate API key based on mode
function getApiKeyForMode(mode: string): string {
  switch (mode) {
    case 'reasoning':
      return TEXT_API_KEY; // Use original key for reasoning mode
    case 'image_analysis':
      return TEXT_API_KEY2; // Use second key for image analysis
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
    case 'reasoning':
      return 'deepseek-ai/deepseek-r1'; // Reasoning model with thinking capability
    case 'image_analysis':
      return 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1'; // Updated NVIDIA vision model
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

// Helper function to detect if this is an artifact generation request
function isArtifactRequest(messages: any[]): boolean {
  if (!messages || messages.length === 0) return false;
  
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content) return false;
  
  const content = lastMessage.content.toLowerCase();
  
  // Check for artifact-related keywords in the prompt
  const artifactKeywords = [
    'create a document',
    'write a guide',
    'generate a report',
    'create an essay',
    'write an article',
    'create a tutorial',
    'generate content',
    'artifact',
    'document generation',
    'respond with valid json',
    'json format',
    'structured output'
  ];
  
  return artifactKeywords.some(keyword => content.includes(keyword));
}

// Enhanced prompt modification for artifact requests
function enhanceArtifactPrompt(messages: any[]): any[] {
  if (!isArtifactRequest(messages)) {
    return messages;
  }
  
  const lastMessage = messages[messages.length - 1];
  const enhancedContent = `${lastMessage.content}

IMPORTANT INSTRUCTIONS:
- At the end of your response, provide a valid JSON object with the document structure
- The JSON should include: title, content, type, category, tags, wordCount, readingTime
- Format the JSON clearly and ensure it's valid
- You can include your reasoning in <think> tags, but end with clean JSON
- Example format:
{
  "title": "Document Title",
  "content": "Full document content...",
  "type": "document",
  "category": "Educational",
  "tags": ["example", "guide"],
  "wordCount": 500,
  "readingTime": "3 min"
}`;

  return [
    ...messages.slice(0, -1),
    {
      ...lastMessage,
      content: enhancedContent
    }
  ];
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
  
  // Enhance messages for artifact requests
  const enhancedMessages = enhanceArtifactPrompt(messages);
  
  // Check if this is an artifact request - if so, remove response_format to avoid compatibility issues
  const isArtifact = isArtifactRequest(messages);
  
  // If not in cache or expired, make the API call
  const selectedModel = getModelForMode(options.mode || 'default');
  const payload = {
    model: selectedModel,
    messages: enhancedMessages,
    temperature: options.temperature || 0.6,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens || (isArtifact ? 8192 : 8139), // Increased tokens for default chat and artifacts
    presence_penalty: options.presence_penalty || 0.8,
    frequency_penalty: options.frequency_penalty || 0.5,
    stream: options.stream !== undefined ? options.stream : true,
    // Add Qwen3 specific parameters for multilingual support
    ...(selectedModel === 'qwen/qwen3-235b-a22b' && {
      enable_thinking: false, // Disable thinking mode for default chat
      language: 'auto', // Auto-detect input language for proper multilingual response
    }),
    // Remove response_format for DeepSeek R1 to avoid compatibility issues
    // DeepSeek R1 doesn't properly support response_format and will return streaming anyway
    // We'll parse JSON from the streaming content instead
  };
  
  console.log(`[NVIDIA API] Making request - Mode: ${options.mode || 'default'}, Model: ${payload.model}, Artifact: ${isArtifact}, Stream: ${payload.stream}, Max Tokens: ${payload.max_tokens}, API Key: ${options.mode === 'reasoning' ? 'NVIDIA_API_KEY' : options.mode === 'image_analysis' ? 'NVIDIA_API_KEY2' : 'NVIDIA_API_KEY3'}`);
  
  try {
    // Using fetchWithTimeout with increased timeout for NVIDIA API call
  const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
      'Authorization': `Bearer ${getApiKeyForMode(options.mode || 'default')}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'text/event-stream; charset=utf-8',
      },
      body: JSON.stringify(payload),
    }, isArtifact ? 45000 : 25000); // 45-second timeout for artifacts, 25-second for regular chats

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
    // Skip truncation for image analysis mode as base64 data needs to be complete
    const optimizedMessages = body.messages.map((msg: any) => ({
      ...msg,
      content: (typeof msg.content === 'string' && msg.content.length > 4000 && mode !== 'image_analysis')
        ? msg.content.substring(0, 4000) + "..." 
        : msg.content
    }));
    
    // Extract any model parameters with reasonable defaults
    const modelParams = {
      temperature: body.temperature || 0.6,
      top_p: body.top_p || 0.95,
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