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
              text: `Take a close look at the image the user has uploaded. It could be anything, so analyze it carefully and describe what you see in as much useful detail as possible.\n
Start with a general overview of the image. Mention any clear objects, people, text, actions, or settings.\n
If the image is a photo or shows a real-world scene, describe the environment, what's happening in it, and any visible emotions, people, or objects. If it appears to be handwritten notes or a math problem, try to read the handwriting, interpret any math or diagrams, and solve or explain what's shown. If the image is a chart or graph, identify the type of chart, describe the data and trends, and explain what the labels or axes are showing.\n
If it looks like a piece of art or a visual design, talk about the style, layout, color scheme, and subject matter. Offer feedback or an interpretation if appropriate. If the image is a meme, try to identify the format or template, explain the joke or cultural reference, and point out any text overlays or characters involved.\n
If the image is a screenshot of an app, a website, or code, describe the layout, interface, or functionality. If there's an error or bug visible, mention what the problem might be. If the image contains a document, form, or printed text, extract and summarize the content, and try to identify what kind of document it is. If the image looks like a social media post or message, summarize the tone and content. If it refers to a trend or online topic, explain it.\n
Finally, if the image is educational — like a scientific diagram, worksheet, or textbook page — describe the topic, explain what it's teaching, and help interpret or solve anything shown.\n
After you describe and analyze the image, suggest helpful next steps for the user. For example, you could ask if they want help solving a problem, summarizing the content, getting feedback, generating a caption, or anything else relevant.\n
Keep your tone friendly, curious, and helpful, and let the user guide what happens next.`
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