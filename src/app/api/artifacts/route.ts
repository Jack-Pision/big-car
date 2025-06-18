import { NextRequest } from 'next/server';
import { ArtifactService } from '@/lib/artifact-service';

export const runtime = 'edge';

export async function GET() {
  try {
    const service = ArtifactService.getInstance();
    const artifacts = await service.list();

    return new Response(JSON.stringify({ data: artifacts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[API] /api/artifacts GET error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const service = ArtifactService.getInstance();

    const { title, content, type, metadata, session_id } = body;

    if (!title || !content || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const newArtifact = await service.create({
      title,
      content,
      type,
      metadata,
      session_id: session_id || null,
    } as any);

    return new Response(JSON.stringify({ data: newArtifact }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[API] /api/artifacts POST error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 