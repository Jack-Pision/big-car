import { NextRequest } from 'next/server';

export const runtime = 'edge';

const SERPER_API_KEY = "2ae2160086988d4517b81c0dade49cbd98bcb772";

async function searchSerper(query: string, limit: number = 10) {
  const url = "https://google.serper.dev/search";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q: query })
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.organic) return [];
  return data.organic.slice(0, limit).map((item: any) => ({
    title: item.title,
    description: item.snippet,
    url: item.link,
    icon: '/icons/web-icon.svg', // Use a custom icon if you add one
    type: 'serper'
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit } = body;
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { status: 400 });
    }
    const results = await searchSerper(query, limit || 10);
    if (!results.length) {
      return new Response(JSON.stringify({
        articles: [],
        summary: 'No relevant Serper search results found.',
        sources: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      articles: results,
      summary: results.map((a: any) => `- [${a.title}](${a.url}): ${a.description || ''}`).join('\n'),
      sources: results.map((a: any) => ({ title: a.title, url: a.url, icon: a.icon, type: a.type }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Serper API search error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch Serper API data', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 