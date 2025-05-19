import { NextRequest } from 'next/server';

export const runtime = 'edge';

const NVIDIA_ASSETS_API = 'https://api.nvcf.nvidia.com/v2/nvcf/assets';
const API_KEY = process.env.GEMMA_API_KEY || '';

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }), { status: 400 });
  }
  const formData = await req.formData();
  const imageFile = formData.get('image');
  if (!imageFile || typeof imageFile === 'string') {
    return new Response(JSON.stringify({ error: 'No image file uploaded' }), { status: 400 });
  }
  // Step 1: Request pre-signed upload URL from NVIDIA
  const createAssetRes = await fetch(NVIDIA_ASSETS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: imageFile.type || 'image/png',
      description: imageFile.name || 'uploaded-image',
    }),
  });
  if (!createAssetRes.ok) {
    const errorText = await createAssetRes.text();
    return new Response(JSON.stringify({ error: errorText }), { status: createAssetRes.status });
  }
  const { assetId, uploadUrl, contentType: assetContentType, description } = await createAssetRes.json();
  // Step 2: Upload the image to the pre-signed URL
  const arrayBuffer = await imageFile.arrayBuffer();
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': assetContentType,
      'x-amz-meta-nvcf-asset-description': description,
    },
    body: arrayBuffer,
  });
  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    return new Response(JSON.stringify({ error: errorText }), { status: uploadRes.status });
  }
  // Step 3: Return the asset ID to the frontend
  return new Response(JSON.stringify({ assetId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} 