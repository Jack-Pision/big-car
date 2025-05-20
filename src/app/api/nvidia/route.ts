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
    model: 'moonshotai/kimi-vl-a3b-thinking:free', // This should match the model in openrouter-proxy or be made dynamic
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
    stream: false,
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
      // 1. Get image description from OpenRouter
      console.log("[API /api/nvidia] Calling OpenRouter...");
      const openRouterRes = await fetchOpenRouterImageAnalysis(body.imageUrl, OPENROUTER_API_KEY);
      if (!openRouterRes.ok) {
        return openRouterRes; 
      }
      const openRouterData = await openRouterRes.json();
      const imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image.';
      console.log("[API /api/nvidia] OpenRouter description received:", imageDescription.substring(0, 100) + "...");

      // 2. Construct prompt for Nemotron
      const nemotronSystemPrompt = `You are an advanced AI assistant. An image was analyzed, and the following description was generated: "${imageDescription}". Based on this image description, provide a helpful and detailed response. If the description suggests a question or problem, try to answer or solve it. If it's a scene, you can describe it further, tell a short story about it, or provide interesting facts related to it. Be creative and informative.`;
      const nemotronMessages = [
        { role: "system", content: nemotronSystemPrompt },
        // Optionally, include the original user prompt if it was related to the image, e.g. body.originalPrompt
        // For now, we'll assume the primary goal is to react to the image analysis.
        { role: "user", content: "Tell me more about what was found in the image." }
      ];
      
      // 3. Call Nemotron
      console.log("[API /api/nvidia] Calling Nemotron...");
      const nemotronRes = await fetchNvidiaText(nemotronMessages);
      if (!nemotronRes.ok) {
          return nemotronRes;
      }
      const nemotronData = await nemotronRes.json();
      console.log("[API /api/nvidia] Nemotron response received.");
      
      return new Response(JSON.stringify(nemotronData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } else {
      console.log("[API /api/nvidia] Received text-only request.");
      const { messages } = body;
      const aiRes = await fetchNvidiaText(messages);
       if (!aiRes.ok) {
          return aiRes;
      }
      const aiData = await aiRes.json();
      console.log("[API /api/nvidia] Text-only Nemotron response received.");
      return new Response(JSON.stringify(aiData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
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