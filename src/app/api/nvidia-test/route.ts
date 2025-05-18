import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const HARDCODED_API_KEY = "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";
const IMAGE_API_KEY = "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";

async function fetchNvidiaAIWithImage(imageBuffer: Buffer, messages: any[]) {
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer]), 'image.png');
  formData.append('model', 'google/gemma-3-27b-it');
  formData.append('messages', JSON.stringify(messages));
  formData.append('max_tokens', '512');
  formData.append('temperature', '0.2');
  formData.append('top_p', '0.8');
  formData.append('stream', 'false');

  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${IMAGE_API_KEY}`,
        // 'Content-Type' will be set automatically by fetch with FormData
        'Accept': 'application/json',
      },
      body: formData,
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
      // Parse multipart form data
      const formData = await req.formData();
      const imageFile = formData.get('image');
      const messagesRaw = formData.get('messages');
      let messages = [];
      if (typeof messagesRaw === 'string') {
        messages = JSON.parse(messagesRaw);
      }
      if (imageFile && typeof imageFile === 'object' && 'arrayBuffer' in imageFile) {
        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        const aiRes = await fetchNvidiaAIWithImage(imageBuffer, messages);
        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
    return new Response(JSON.stringify({ error: 'No image or messages found in request.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to process request', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 