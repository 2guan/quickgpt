import { db } from '../db/sqlite.js';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(query: string, maxResults = 4): Promise<SearchResultItem[]> {
  try {
    // 1. Check system settings for custom search engine
    const providerStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_provider'");
    const endpointStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_endpoint'");
    const keyStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_api_key'");
    
    const provider = (providerStmt.get() as { value: string } | undefined)?.value || 'builtin';
    const endpoint = (endpointStmt.get() as { value: string } | undefined)?.value || '';
    const apiKey = (keyStmt.get() as { value: string } | undefined)?.value || '';

    // SearXNG / Custom JSON Search API
    if (provider === 'searxng' && endpoint) {
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('language', 'zh-CN');
      
      const res = await fetch(url.toString(), {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.results)) {
          return data.results.slice(0, maxResults).map((r: any) => ({
            title: r.title || '网页结果',
            url: r.url || '',
            snippet: r.content || r.snippet || '',
          }));
        }
      }
    }

    // Default Built-in DuckDuckGo HTML Lite Scraper (Zero external API key needed, high reliability)
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      console.warn(`[Search] DuckDuckGo response status: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const results: SearchResultItem[] = [];

    // Simple regex parser for DuckDuckGo HTML Lite results
    const resultRegex = /<a class="result__url" href="([^"]+)".*?>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    const titleRegex = /<a class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

    let match;
    const titles: { url: string; title: string }[] = [];
    while ((match = titleRegex.exec(html)) !== null && titles.length < 10) {
      let rawUrl = match[1];
      // Decode DuckDuckGo redirect url
      if (rawUrl.includes('uddg=')) {
        const urlParam = new URL('https://duckduckgo.com' + rawUrl).searchParams.get('uddg');
        if (urlParam) rawUrl = decodeURIComponent(urlParam);
      }
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      titles.push({ url: rawUrl, title: rawTitle });
    }

    const snippetRegex = /<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 10) {
      snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < titles.length && i < maxResults; i++) {
      if (titles[i].title && (titles[i].url.startsWith('http://') || titles[i].url.startsWith('https://'))) {
        results.push({
          title: titles[i].title,
          url: titles[i].url,
          snippet: snippets[i] || '',
        });
      }
    }

    return results;
  } catch (err: any) {
    console.error(`[Search] Error performing web search for "${query}":`, err.message);
    return [];
  }
}

export function formatSearchResultsForPrompt(results: SearchResultItem[]): string {
  if (!results || results.length === 0) return '';
  
  let formatted = '\n\n【实时联网检索信息参考】\n';
  results.forEach((item, index) => {
    formatted += `[${index + 1}] 标题: ${item.title}\n    来源: ${item.url}\n    摘要: ${item.snippet}\n\n`;
  });
  formatted += '请结合上述最新检索结果，用准确、客观且有条理的语言回答用户的问题。如果引用了检索结果，请在正文中以 [序号] 标注来源。\n';
  return formatted;
}
