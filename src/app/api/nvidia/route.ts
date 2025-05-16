import { NextRequest } from 'next/server';

export const runtime = 'edge';

async function fetchNvidiaAI(messages: any[], stream = false) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NVIDIA API key not set in environment.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const payload = {
    model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    messages,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 4096,
    stream,
  };
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('NVIDIA API error:', res.status, errorText);
    }
    return res;
  } catch (err) {
    console.error('NVIDIA API fetch failed:', err);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  console.log('Received request at /api/nvidia');
  try {
    const body = await req.json();
    const { messages, ...rest } = body;
    // Only get initial AI response
    const initialRes = await fetchNvidiaAI(messages, false);
    const initialData = await initialRes.json();
    return new Response(JSON.stringify(initialData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('POST /api/nvidia error:', err);
    return new Response(JSON.stringify({ error: 'Failed to process request', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 