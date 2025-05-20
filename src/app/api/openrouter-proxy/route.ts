import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Utility to strip <think>...</think> tags from a string
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

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
      // Clean the stream by stripping <think>...</think> tags
      const cleanedStream = new ReadableStream({
        async start(controller) {
          const reader = aiRes.body!.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n'));
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  // Clean the content field(s)
                  if (parsed.choices?.[0]?.delta?.content) {
                    parsed.choices[0].delta.content = stripThinkTags(parsed.choices[0].delta.content);
                  }
                  if (parsed.choices?.[0]?.message?.content) {
                    parsed.choices[0].message.content = stripThinkTags(parsed.choices[0].message.content);
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n`));
                } catch (err) {
                  // Pass through malformed lines
                  controller.enqueue(encoder.encode(line + '\n'));
                }
              } else {
                controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          }
          if (buffer) controller.enqueue(encoder.encode(buffer));
          controller.close();
        }
      });
      return new Response(cleanedStream, {
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