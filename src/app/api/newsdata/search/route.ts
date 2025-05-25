import { NextRequest } from 'next/server';

export const runtime = 'edge';

const NEWSDATA_API_KEY = "pub_70f0d506b9f949cda5492d8f0fdfaee3";

async function searchNewsData(query: string, limit: number = 10) {
  const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en&country=us&category=top,technology,science&size=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results) return [];
  return data.results.slice(0, limit).map((article: any) => ({
    title: article.title,
    description: article.description,
    url: article.link,
    source: article.source_id,
    published: article.pubDate,
    icon: '/icons/newsdata-icon.svg',
    type: 'newsdata'
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit } = body;
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), { status: 400 });
    }
    const articles = await searchNewsData(query, limit || 10);
    if (!articles.length) {
      return new Response(JSON.stringify({
        articles: [],
        summary: 'No relevant news articles found.',
        sources: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      articles,
      summary: articles.map((a: any) => `- [${a.title}](${a.url}): ${a.description || ''}`).join('\n'),
      sources: articles.map((a: any) => ({ title: a.title, url: a.url, icon: a.icon, type: a.type }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('NewsData.io search error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch NewsData.io data', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 