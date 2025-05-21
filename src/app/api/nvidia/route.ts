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
async function fetchOpenRouterImageAnalysis(imageUrls: string[], openRouterApiKey: string) {
  // If multiple images, pick the first one for now, or adapt the prompt for multiple images.
  // TODO: Enhance this to potentially describe multiple images if the model supports it well,
  // or create a summary if multiple images are present.
  const targetImageUrl = imageUrls[0]; 

  const requestBody = {
    model: 'google/gemma-3-27b-it',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: imageUrls.length > 1 ? "Describe the first image in this set of images." : "Describe this image."
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

// Utility to strip <think>...</think> tags from a string
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
      // 1. Get image description from OpenRouter
      console.log("[API /api/nvidia] Calling OpenRouter...");
      // Send all imageUrls to fetchOpenRouterImageAnalysis
      const openRouterRes = await fetchOpenRouterImageAnalysis(body.imageUrls, OPENROUTER_API_KEY);
      if (!openRouterRes.ok) {
        return openRouterRes; 
      }
      const openRouterData = await openRouterRes.json();
      let imageDescription = openRouterData.choices?.[0]?.message?.content || 'Could not get a description from the image(s).';
      imageDescription = stripThinkTags(imageDescription); // Clean the image description
      console.log("[API /api/nvidia] OpenRouter description received (cleaned):", imageDescription.substring(0, 200) + "...");

      // 2. Construct prompt for Nemotron
      const userImagePrompt = body.messages?.filter((m:any) => m.role === 'user').pop()?.content || (body.imageUrls.length > 1 ? "Tell me more about these images." : "Tell me more about what was found in the image.");

      const imageContext = body.imageUrls.length > 1 ? `A set of ${body.imageUrls.length} images were provided.` : "An image was provided.";
      const nemotronSystemPrompt = `You are an advanced AI assistant. ${imageContext} Image analysis from OpenRouter (primarily of the first image if multiple were sent) yielded: "${imageDescription}". The user has provided the following specific query: "${userImagePrompt}". Based on the image description(s) and the user's query, provide a helpful and detailed response.

IMPORTANT FORMATTING INSTRUCTIONS:
1. For mathematical content, ALWAYS use LaTeX math delimiters:
   - Inline math: Use single dollar signs, e.g., $x^2 + y^2 = z^2$
   - Block math: Use double dollar signs, e.g., $$\int_{0}^{1} x^2 dx = \frac{1}{3}$$
2. Start your response with a single, clear title using a single '#' in markdown (e.g., '# My Title')
3. Use clear, well-structured paragraphs
4. Only use bullet points or numbered lists if the query specifically requests them
5. Ensure mathematical expressions are clear, properly spaced, and mathematically correct`;
      
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

      // Clean the stream by stripping <think>...</think> tags
      if (!nemotronRes.body) {
        return new Response(JSON.stringify({ error: 'No response body from AI' }), { status: 500, headers });
      }
      const cleanedStream = new ReadableStream({
        async start(controller) {
          const reader = nemotronRes.body!.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n'));
                  continue;
    }
    try {
                  const parsed = JSON.parse(data);
                  // Clean the content field(s)
                  if (parsed.choices?.[0]?.delta?.content) {
                    parsed.choices[0].delta.content = stripThinkTags(parsed.choices[0].delta.content);
                  }
                  if (parsed.choices?.[0]?.message?.content) {
                    parsed.choices[0].message.content = stripThinkTags(parsed.choices[0].message.content);
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n`));
                } catch (err) {
                  // Pass through malformed lines
                  controller.enqueue(encoder.encode(line + '\n'));
                }
              } else {
                controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          }
          if (buffer) controller.enqueue(encoder.encode(buffer));
          controller.close();
        }
      });

      return new Response(cleanedStream, {
      status: 200,
        headers: headers,
    });

  } else {
      console.log("[API /api/nvidia] Received text-only request (streaming)...");
      const { messages } = body;
      
      // Prepend a system prompt with formatting instructions
      const textSystemPrompt = `You are an advanced AI assistant. Provide clear, concise, and helpful responses.

IMPORTANT FORMATTING INSTRUCTIONS:
1. For mathematical content, ALWAYS use LaTeX math delimiters:
   - Inline math: Use single dollar signs, e.g., $x^2 + y^2 = z^2$
   - Block math: Use double dollar signs, e.g., $$\int_{0}^{1} x^2 dx = \frac{1}{3}$$
2. Start your response with a single, clear title using a single '#' in markdown (e.g., '# My Title')
3. Use clear, well-structured paragraphs
4. Only use bullet points or numbered lists if the query specifically requests them
5. Ensure mathematical expressions are clear, properly spaced, and mathematically correct`;

      // Insert system prompt at the beginning of messages
      const nemotronMessages = [
        { role: "system", content: textSystemPrompt },
        ...messages
      ];
      
      // For text-only, also enable streaming
      const nemotronRes = await fetchNvidiaText(nemotronMessages); // Always streaming
      
      if (!nemotronRes.ok) {
          return nemotronRes;
      }

      const headers = new Headers(nemotronRes.headers);
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');
      
      // Clean the stream by stripping <think>...</think> tags
      if (!nemotronRes.body) {
        return new Response(JSON.stringify({ error: 'No response body from AI' }), { status: 500, headers });
      }
      const cleanedStreamForTextOnly = new ReadableStream({
        async start(controller) {
          const reader = nemotronRes.body!.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n'));
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  // Clean the content field(s)
                  if (parsed.choices?.[0]?.delta?.content) {
                    parsed.choices[0].delta.content = stripThinkTags(parsed.choices[0].delta.content);
                  }
                  if (parsed.choices?.[0]?.message?.content) {
                    parsed.choices[0].message.content = stripThinkTags(parsed.choices[0].message.content);
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n`));
                } catch (err) {
                  // Pass through malformed lines
                  controller.enqueue(encoder.encode(line + '\n'));
                }
              } else {
                controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          }
          if (buffer) controller.enqueue(encoder.encode(buffer));
          controller.close();
        }
      });

      return new Response(cleanedStreamForTextOnly, {
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