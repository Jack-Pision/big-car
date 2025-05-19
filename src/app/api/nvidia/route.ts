import { NextRequest } from 'next/server';

export const runtime = 'edge';

const API_KEY = process.env.GEMMA_API_KEY || '';

async function fetchNvidiaAIWithImage(imageBuffer: Buffer, userMsg: any) {
  // Prepare multipart/form-data for NVIDIA API
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer]), 'image.png');
  formData.append('model', 'google/gemma-3-27b-it');
  formData.append('messages', JSON.stringify([userMsg]));
  formData.append('max_tokens', '512');
  formData.append('temperature', '0.2');
  formData.append('top_p', '0.8');
  formData.append('stream', 'false');

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json',
    },
    body: formData,
  });
  if (!res.ok) {
    const errorText = await res.text();
    return new Response(JSON.stringify({ error: errorText }), { status: res.status });
  }
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
        'Authorization': `Bearer ${API_KEY}`,
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
    const messagesStr = formData.get('messages');
    let userMsg = null;
    if (typeof messagesStr !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), { status: 400 });
    }
    try {
      const messages = JSON.parse(messagesStr);
      userMsg = messages[0];
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), { status: 400 });
    }
    if (!imageFile || typeof imageFile === 'string') {
      return new Response(JSON.stringify({ error: 'No image file uploaded' }), { status: 400 });
    }
    // Read image as ArrayBuffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const aiRes = await fetchNvidiaAIWithImage(buffer, userMsg);
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
      const aiRes = await fetchNvidiaAI(messages);
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