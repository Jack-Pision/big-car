import { NextRequest } from 'next/server';

export const runtime = 'edge';

const HARDCODED_API_KEY = "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";
const IMAGE_API_KEY = "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";

async function fetchNvidiaAI(messages: any[], useImageModel: boolean) {
  let payload, apiKey, model, headers;
  if (useImageModel) {
    // Use the image recognition model and API key
    model = 'google/gemma-3-27b-it';
    apiKey = IMAGE_API_KEY;
    // Find the image in the user message
    const userMsg = messages.find((m: any) => m.role === 'user');
    payload = {
      model,
      messages: [userMsg],
      max_tokens: 512,
      temperature: 0.2,
      top_p: 0.8,
      stream: false,
    };
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  } else {
    // Use the regular chat model and API key
    model = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
    apiKey = HARDCODED_API_KEY;
    payload = {
      model,
      messages,
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 4096,
      stream: false,
    };
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers,
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
    const body = await req.json();
    const { messages } = body;
    // Check if the first user message contains an image (data:image)
    const userMsg = messages.find((m: any) => m.role === 'user');
    const useImageModel = userMsg && /data:image\//.test(userMsg.content);
    const aiRes = await fetchNvidiaAI(messages, useImageModel);
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