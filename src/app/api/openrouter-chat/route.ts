import { NextRequest } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

export const runtime = 'edge';

// Update the fetchWithTimeout function to optimize timeout handling
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 45000) { // 45 seconds timeout
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

// Add a simple in-memory cache for API responses
const apiCache = new Map<string, {data: any, timestamp: number}>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Generates a cache key for API calls
function generateCacheKey(messages: any[], options: any = {}): string {
  // Create a simplified version of messages for the cache key (just the content)
  const simplifiedMessages = messages.map(msg => ({
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content.slice(0, 200) : 'image_content' // Handle image content
  }));
  
  // Create a key combining the messages and any other options that affect the response
  return JSON.stringify({
    messages: simplifiedMessages,
    temperature: options.temperature || 0.6,
    max_tokens: options.max_tokens || 1000
  });
}

// Helper function to detect if this is an artifact generation request
function isArtifactRequest(messages: any[]): boolean {
  if (!messages || messages.length === 0) return false;
  
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content) return false;
  
  const content = typeof lastMessage.content === 'string' ? lastMessage.content.toLowerCase() : '';
  
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

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Configuration Error', details: 'OPENROUTER_API_KEY is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Unsupported content type', details: 'Request must be application/json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { messages, model, temperature, max_tokens, stream, top_p, imageUrls, previousImageDescriptions } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request format', details: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if this is an image analysis request
    if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
      // Format previous messages for context
      const formattedPreviousMessages = messages.map(msg => {
        return {
          role: msg.role,
          content: msg.content
        };
      });

      // Limit context to prevent token overflow (keep last 5 messages)
      const limitedPreviousMessages = formattedPreviousMessages.slice(-5);
      
      // Create context from previous image descriptions
      let previousContext = "";
      if (previousImageDescriptions && previousImageDescriptions.length > 0) {
        const formattedDescriptions = previousImageDescriptions.map((desc: string, idx: number) => 
          `Image ${idx + 1}: "${desc}"`
        ).join(' | ');
        
        previousContext = `Previous image descriptions: ${formattedDescriptions}. `;
      }
      
      // Use the first image URL for now (can be expanded for multiple images)
      const targetImageUrl = imageUrls[0];
      
      const requestBody = {
        model: model || 'google/gemini-2.0-flash-exp:free',
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
                  url: targetImageUrl
                }
              }
            ]
          }
        ],
        stream: stream !== undefined ? stream : true
      };

      const aiRes = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      }, 10000); // 10-second timeout for image analysis

      if (!aiRes.ok) {
        const errorText = await aiRes.text();
        console.error('OpenRouter API error for image analysis:', errorText);
        return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errorText}` }), { 
          status: aiRes.status, 
          headers: { 'Content-Type': 'application/json'} 
        });
      }

      // Stream the image analysis response back to the client
      if (aiRes.body) {
        return new Response(aiRes.body, {
          status: aiRes.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
      }

      // Fallback for non-streaming image analysis
      const data = await aiRes.json();
      return new Response(JSON.stringify(data), {
        status: aiRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // For regular text requests (non-image)
    
    // Check if this is an artifact request
    const isArtifact = isArtifactRequest(messages);
    
    // Enhance messages for artifact requests
    const enhancedMessages = isArtifact ? enhanceArtifactPrompt(messages) : messages;
    
    // Generate a cache key for this request
    const cacheKey = generateCacheKey(messages, { temperature, max_tokens });
    
    // Check if we have a cached response (only for non-streaming, non-artifact requests)
    if (!stream && !isArtifact) {
      const cachedItem = apiCache.get(cacheKey);
      if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_TTL) {
        console.log('Using cached API response');
        return new Response(cachedItem.data, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=900' // 15 minutes
          }
        });
      }
    }
    
    const requestBody = {
      model: model || 'google/gemini-2.0-flash-exp:free',
      messages: enhancedMessages,
      temperature: temperature !== undefined ? temperature : 0.6,
      max_tokens: max_tokens !== undefined ? max_tokens : (isArtifact ? 8192 : 4096),
      top_p: top_p !== undefined ? top_p : 0.95,
      stream: stream !== undefined ? stream : true
    };

    // Using fetchWithTimeout with increased timeout for artifact requests
    const aiRes = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    }, isArtifact ? 45000 : 25000); // 45-second timeout for artifacts, 25-second for regular chats

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error('OpenRouter API error:', errorText);
      
      // Handle specific error cases
      if (aiRes.status === 504) {
        return new Response(JSON.stringify({
          error: 'Gateway Timeout: The AI service took too long to respond. Please try again with a simpler query.',
          details: errorText
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errorText}` }), {
        status: aiRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Stream the response back to the client
    if (aiRes.body && requestBody.stream) {
      return new Response(aiRes.body, {
        status: aiRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // For non-streaming responses, cache the result
    const responseData = await aiRes.text();
    if (!isArtifact) { // Only cache non-artifact responses
      apiCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    }
    
    return new Response(responseData, {
      status: aiRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error in OpenRouter Chat route:', err);
    
    const isTimeout = err.message.includes('timed out');
    
    // Create a fallback response for timeouts
    if (isTimeout) {
      return new Response(JSON.stringify({
        error: 'Gateway Timeout: The AI service took too long to respond. Please try again with a simpler query.',
        details: err.message,
        choices: [
          {
            message: {
              content: "I apologize, but the request took too long to process. Please try a simpler query or try again later."
            }
          }
        ]
      }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 