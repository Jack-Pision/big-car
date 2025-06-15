import { NextRequest, NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch the webpage with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15 seconds
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove unwanted elements more comprehensively
    const elementsToRemove = document.querySelectorAll(`
      script, style, nav, header, footer, aside, 
      .advertisement, .ads, .sidebar, .menu, .navigation,
      .social-share, .comments, .related-posts, .popup,
      .cookie-notice, .newsletter, .subscription,
      [class*="ad-"], [class*="advertisement"], [id*="ad-"],
      .breadcrumb, .pagination, .tags, .categories
    `);
    elementsToRemove.forEach(el => el.remove());

    // Extract main content with priority order
    let content = '';
    let title = '';
    let contentSource = 'unknown';
    
    // Get page title
    const titleElement = document.querySelector('title, h1');
    title = titleElement?.textContent?.trim() || '';

    // Try content selectors in priority order
    const contentSelectors = [
      { selector: 'main', priority: 1 },
      { selector: 'article', priority: 2 },
      { selector: '[role="main"]', priority: 3 },
      { selector: '.content', priority: 4 },
      { selector: '.main-content', priority: 5 },
      { selector: '.post-content', priority: 6 },
      { selector: '.entry-content', priority: 7 },
      { selector: '#content', priority: 8 },
      { selector: '.article-body', priority: 9 },
      { selector: '.story-body', priority: 10 },
      { selector: '.text-content', priority: 11 },
      { selector: '.page-content', priority: 12 }
    ];

    for (const { selector, priority } of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        content = element.textContent?.trim() || '';
        contentSource = `${selector} (priority ${priority})`;
        break;
      }
    }

    // If no specific content area found, get body text
    if (!content) {
      const bodyElement = document.querySelector('body');
      content = bodyElement?.textContent?.trim() || '';
      contentSource = 'body fallback';
    }

    // Clean up the content more thoroughly
    content = content
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/\r/g, '') // Remove carriage returns
      .trim();

    // Content quality validation
    const wordCount = content.split(/\s+/).length;
    const isQualityContent = wordCount >= 50 && content.length >= 200;
    
    // Increased content length limits for better analysis
    const maxLength = 8000; // Increased from 3000 to 8000
    let truncated = false;
    
    if (content.length > maxLength) {
      // Smart truncation - try to end at sentence boundary
      const truncatedContent = content.substring(0, maxLength);
      const lastSentenceEnd = Math.max(
        truncatedContent.lastIndexOf('.'),
        truncatedContent.lastIndexOf('!'),
        truncatedContent.lastIndexOf('?')
      );
      
      if (lastSentenceEnd > maxLength * 0.8) {
        content = truncatedContent.substring(0, lastSentenceEnd + 1);
      } else {
        content = truncatedContent + '...';
      }
      truncated = true;
    }

    // Extract key sections for better structure
    const extractKeyInfo = (doc: Document) => {
      const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => h.textContent?.trim())
        .filter(Boolean)
        .slice(0, 10); // Top 10 headings

      const paragraphs = Array.from(doc.querySelectorAll('p'))
        .map(p => p.textContent?.trim())
        .filter(text => text && text.length > 50)
        .slice(0, 5); // Top 5 substantial paragraphs

      return { headings, paragraphs };
    };

    const keyInfo = extractKeyInfo(document);

    return NextResponse.json({ 
      content,
      title,
      url,
      length: content.length,
      wordCount,
      isQualityContent,
      truncated,
      contentSource,
      keyInfo,
      metadata: {
        headings: keyInfo.headings,
        topParagraphs: keyInfo.paragraphs,
        extractedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Scraping error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 408 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to scrape content',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 