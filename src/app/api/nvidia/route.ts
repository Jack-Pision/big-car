import { NextRequest } from 'next/server';

export const runtime = 'edge';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const HF_API_KEY = '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';

async function fetchGemmaVisionWithImageUrl(imageUrl: string) {
  const payload = {
    model: 'google/gemma-3-27b-it',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in one sentence.'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }
    ]
  };
  const res = await fetch('https://api.endpoints.huggingface.cloud/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    return new Response(JSON.stringify({ error: errorText }), { status: res.status });
  }
  return res;
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
      return new Response(JSON.stringify({ error: errorText }), { status: res.status });
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
        // Image request: use Hugging Face
        const aiRes = await fetchGemmaVisionWithImageUrl(body.imageUrl);
        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // Text request: use NVIDIA
        const { messages } = body;
        const aiRes = await fetchNvidiaText(messages);
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
  } else {
    return new Response(JSON.stringify({ error: 'Unsupported content type' }), { status: 400 });
  }
} 