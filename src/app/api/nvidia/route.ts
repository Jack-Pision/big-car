import { NextRequest } from 'next/server';

export const runtime = 'edge';

async function fetchNvidiaAI(messages: any[], stream = false) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NVIDIA API key not set in environment.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const payload = {
    model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    messages,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 4096,
    stream,
  };
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, selfRefine = true, ...rest } = body;
    // 1. Get initial AI response
    const initialRes = await fetchNvidiaAI(messages, false);
    const initialData = await initialRes.json();
    let aiContent = initialData.choices?.[0]?.message?.content || '';
    // 2. Self-refinement: Only if enabled
    let improvedContent = aiContent;
    let refinementError = null;
    if (selfRefine) {
      const refinementPrompt = {
        role: 'system',
        content: `You are a markdown formatter. Here is some markdown output. Check for formatting, structure, and readability. Fix any markdown mistakes, add blank lines where needed, and ensure lists, headings, and bold/italic are correct. Return only the improved markdown.`
      };
      const refinementMessages = [refinementPrompt, { role: 'user', content: aiContent }];
      try {
        const refineRes = await fetchNvidiaAI(refinementMessages, false);
        const refineData = await refineRes.json();
        if (refineData.choices?.[0]?.message?.content) {
          improvedContent = refineData.choices[0].message.content;
        } else {
          refinementError = refineData.error || 'No content from refinement.';
        }
      } catch (err) {
        refinementError = String(err);
      }
    }
    // Always return a response, fallback to initial output if refinement fails or is disabled
    return new Response(JSON.stringify({
      ...initialData,
      choices: [{ ...initialData.choices[0], message: { ...initialData.choices[0].message, content: improvedContent } }],
      refinementError,
      selfRefine,
    }), {
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