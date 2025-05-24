import { NextRequest } from 'next/server';

export const runtime = 'edge';

async function searchWikipedia(query: string, limit: number = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  // data[1] = titles, data[2] = descriptions, data[3] = URLs
  const titles: string[] = data[1];
  const descriptions: string[] = data[2];
  const urls: string[] = data[3];
  const results = titles.map((title, i) => ({
    title,
    summary: descriptions[i],
    url: urls[i],
    icon: '/icons/wikipedia-icon.svg',
    type: 'wikipedia'
  }));
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit } = body;
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { status: 400 });
    }
    const articles = await searchWikipedia(query, limit || 5);
    if (!articles.length) {
      return new Response(JSON.stringify({
        articles: [],
        summary: 'No relevant Wikipedia articles found.',
        sources: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      articles,
      summary: articles.map(a => `- [${a.title}](${a.url}): ${a.summary}`).join('\n'),
      sources: articles.map(a => ({ title: a.title, url: a.url, icon: a.icon, type: a.type }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch Wikipedia data', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 