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

  // Directly call OpenRouter API here since we are in a backend route
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('OpenRouter API error:', errorText);
    // Return a Response object in case of error to be consistent
    return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errorText}` }), { status: res.status });
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
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEXT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      return new Response(JSON.stringify({ error: `Nvidia API Error: ${errorText}` }), { status: res.status });
    }
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      if (body.imageUrl) {
        // 1. Get image description from OpenRouter
        const openRouterRes = await fetchOpenRouterImageAnalysis(body.imageUrl, OPENROUTER_API_KEY);
        if (!openRouterRes.ok) {
          // openRouterRes is already a Response object if not ok, so just return it
          return openRouterRes; 
        }
        const openRouterData = await openRouterRes.json();
        const imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image.';

        // 2. Construct a new prompt for Nemotron using the image description
        const nemotronSystemPrompt = `You are an advanced AI assistant. An image was analyzed, and the following description was generated: "${imageDescription}". Based on this image description, provide a helpful and detailed response. If the description suggests a question or problem, try to answer or solve it. If it's a scene, you can describe it further, tell a short story about it, or provide interesting facts related to it. Be creative and informative.`;
        
        const nemotronMessages = [
          { role: "system", content: nemotronSystemPrompt },
          // Optionally, include the original user prompt if it was related to the image, e.g. body.originalPrompt
          // For now, we'll assume the primary goal is to react to the image analysis.
          { role: "user", content: "Tell me more about what was found in the image." }
        ];
        
        // 3. Call Nemotron with the new prompt
        const nemotronRes = await fetchNvidiaText(nemotronMessages);
        if (!nemotronRes.ok) {
            return nemotronRes; // nemotronRes is already a Response object
        }
        const nemotronData = await nemotronRes.json();
        
        // Return the Nemotron response
        return new Response(JSON.stringify(nemotronData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      } else {
        // Text-only request: use existing Nemotron text generation
        const { messages } = body;
        const aiRes = await fetchNvidiaText(messages);
         if (!aiRes.ok) {
            return aiRes; // aiRes is already a Response object
        }
        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err: any) {
      console.error("Error in POST /api/nvidia:", err);
      return new Response(JSON.stringify({ error: 'Failed to process request', details: err.message || String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Unsupported content type' }), { status: 400 });
  }
} 