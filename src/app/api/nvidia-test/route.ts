import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const HARDCODED_API_KEY = "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";
const IMAGE_API_KEY = "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";

async function proxyToNvidiaAPI(req: NextRequest) {
  // Copy all headers except host and content-length
  const headers = new Headers(req.headers);
  headers.set('Authorization', `Bearer ${IMAGE_API_KEY}`);
  headers.set('Accept', 'application/json');
  headers.delete('host');
  headers.delete('content-length');

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: req.body,
  });
  return res;
}

async function fetchNvidiaAI(messages: any[]) {
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
        'Authorization': `Bearer ${HARDCODED_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('NVIDIA API error:', res.status, errorText);
      return new Response(JSON.stringify({ error: errorText }), { status: res.status });
    }
    return res;
  } catch (err) {
    console.error('NVIDIA API fetch failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.startsWith('multipart/form-data')) {
      // Proxy the multipart request directly to NVIDIA API
      const aiRes = await proxyToNvidiaAPI(req);
      const aiData = await aiRes.json();
      return new Response(JSON.stringify(aiData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Fallback to JSON body for text-only requests
      const body = await req.json();
      const { messages } = body;
      const aiRes = await fetchNvidiaAI(messages);
      const aiData = await aiRes.json();
      return new Response(JSON.stringify(aiData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to process request', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 