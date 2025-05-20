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
      model: 'moonshotai/kimi-vl-a3b-thinking:free',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Please analyze the following image and provide a detailed description. Try to identify the main objects, people, text, diagrams, scenes, or any notable features.\n\nIf the image includes:\n- **Text**: Extract and summarize it.\n- **Charts or graphs**: Describe the data and trends.\n- **Math or handwriting**: Try to interpret and solve it if it's a problem.\n- **Screenshots or code**: Summarize what's shown and highlight any issues.\n- **Photos or artwork**: Describe the style, setting, or visual elements.\n- **UI designs**: Describe layout and functionality if applicable.\n\nAfter your analysis, offer to help the user with options like summarizing, answering questions, solving a problem, or providing feedback.\n\nKeep the response open-ended and helpful so the user can decide how to proceed.`
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
    const aiData = await aiRes.json();
    return new Response(JSON.stringify(aiData), {
      status: aiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
} 