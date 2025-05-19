import { NextRequest } from 'next/server';

export const runtime = 'edge';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const IMAGE_API_KEY = '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';

async function fetchMistralVisionWithImageBase64(imageBase64: string) {
  const payload = {
    model: 'mistralai/mistral-small-3.1-24b-instruct-2503',
    messages: [
      {
        role: 'user',
        content: `What is in this image? <img src=\"data:image/png;base64,${imageBase64}\" />`,
      },
    ],
    max_tokens: 512,
    temperature: 0.28,
    top_p: 0.70,
    stream: false,
  };
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${IMAGE_API_KEY}`,
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
  if (contentType.includes('multipart/form-data')) {
    // Parse multipart form
    const formData = await req.formData();
    const imageFile = formData.get('image');
    if (!imageFile || typeof imageFile === 'string') {
      return new Response(JSON.stringify({ error: 'No image file uploaded' }), { status: 400 });
    }
    // Read image as base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const aiRes = await fetchMistralVisionWithImageBase64(base64);
    const aiData = await aiRes.json();
    return new Response(JSON.stringify(aiData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    // Fallback to JSON body for text-only requests
    try {
      const body = await req.json();
      const { messages } = body;
      const aiRes = await fetchNvidiaText(messages);
      const aiData = await aiRes.json();
      return new Response(JSON.stringify(aiData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to process request', details: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
} 