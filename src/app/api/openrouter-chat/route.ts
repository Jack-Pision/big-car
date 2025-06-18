import { NextRequest } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

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
    const { messages, model, temperature, max_tokens, stream, top_p } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request format', details: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const requestBody = {
      model: model || 'google/gemini-2.0-flash-exp:free',
      messages,
      temperature: temperature !== undefined ? temperature : 0.6,
      max_tokens: max_tokens !== undefined ? max_tokens : 8192,
      top_p: top_p !== undefined ? top_p : 0.95,
      stream: stream !== undefined ? stream : true
    };

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    // Stream the response back to the client
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

    // Fallback for non-streaming
    const data = await aiRes.json();
    return new Response(JSON.stringify(data), {
      status: aiRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error in OpenRouter Chat route:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 