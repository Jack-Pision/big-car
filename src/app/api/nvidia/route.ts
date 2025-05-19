import { NextRequest } from 'next/server';

export const runtime = 'edge';

const TEXT_API_KEY = process.env.NVIDIA_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

// Add validation for required API keys
if (!TEXT_API_KEY) {
  throw new Error('NVIDIA_API_KEY is required');
}
if (!GOOGLE_VISION_API_KEY) {
  throw new Error('GOOGLE_VISION_API_KEY is required');
}

async function fetchGoogleVisionWithImageUrl(imageUrl: string) {
  const payload = { requests: [{ image: { source: { imageUri: imageUrl } }, features: [{ type: 'LABEL_DETECTION', maxResults: 5 }] }] };
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
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
  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      if (body.imageUrl) {
        // Image request: integrate Google Cloud Vision API (for labels) with Nemotron (for text generation)
        const visionRes = await fetchGoogleVisionWithImageUrl(body.imageUrl);
        if (!visionRes.ok) {
          const errorText = await visionRes.text();
          return new Response(JSON.stringify({ error: errorText }), { status: visionRes.status });
        }
        const visionData = await visionRes.json();
        // Extract labels from Vision API response
        const labels = (visionData.responses?.[0]?.labelAnnotations || [])
          .map((l: any) => l.description)
          .join(", ");
        
        // Construct a prompt for Nemotron using the labels
        const prompt = `The image is labeled as: ${labels}. Describe this image in one sentence.`;
        
        // Call Nemotron with the generated prompt
        const aiRes = await fetchNvidiaText([{ role: "user", content: prompt }]);
        const aiData = await aiRes.json();
        
        return new Response(JSON.stringify(aiData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // Text request: use existing Nemotron text generation
        const { messages } = body;
        const aiRes = await fetchNvidiaText(messages);
        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to process request', details: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Unsupported content type' }), { status: 400 });
  }
} 