import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NVIDIA API key not set in environment.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Stream response if possible
  if (nvidiaRes.body) {
    return new Response(nvidiaRes.body, {
      status: nvidiaRes.status,
      headers: {
        'Content-Type': nvidiaRes.headers.get('Content-Type') || 'application/json',
      },
    });
  } else {
    const text = await nvidiaRes.text();
    return new Response(text, {
      status: nvidiaRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 