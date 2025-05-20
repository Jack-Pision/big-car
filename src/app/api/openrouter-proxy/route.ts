import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json();
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing OpenRouter API key' }), { status: 500 });
    }
    const requestBody = {
      model: 'google/gemma-3-27b-it',
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Describe everything you see in this image. Mention any people, objects, text, scenes, or actions. If there are charts, code, handwriting, or documents, explain what they show. If it's a photo, artwork, or design, describe the style and setting. Be as clear and helpful as possible."
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
    };
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });
    // Forward the stream to the client
    if (aiRes.body) {
      return new Response(aiRes.body, {
        status: aiRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    // fallback for non-streamed error
    const aiData = await aiRes.json();
    return new Response(JSON.stringify(aiData), {
      status: aiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
} 