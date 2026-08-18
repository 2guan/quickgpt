import { db } from '../db/sqlite.js';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(query: string, maxResults = 5): Promise<SearchResultItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  try {
    // 1. Check system settings for custom search engine
    const providerStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_provider'");
    const endpointStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_endpoint'");
    const keyStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_api_key'");
    
    const provider = (providerStmt.get() as { value: string } | undefined)?.value || 'builtin';
    const endpoint = (endpointStmt.get() as { value: string } | undefined)?.value || '';
    const apiKey = (keyStmt.get() as { value: string } | undefined)?.value || '';

    // Tavily AI Search Provider
    if (provider === 'tavily' && apiKey) {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: cleanQuery,
            search_depth: 'basic',
            max_results: maxResults,
          }),
          signal: AbortSignal.timeout(6000),
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
      } catch (err: any) {
        console.warn(`[Search] Tavily search error: ${err.message}`);
      }
    }

    // SerpAPI Google Search Provider
    if (provider === 'serpapi' && apiKey) {
      try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(cleanQuery)}&api_key=${encodeURIComponent(apiKey)}&hl=zh-cn&gl=cn&num=${maxResults}`;
        const res = await fetch(serpUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.organic_results)) {
            return data.organic_results.slice(0, maxResults).map((r: any) => ({
              title: r.title || '网页结果',
              url: r.link || '',
              snippet: r.snippet || '',
            }));
          }
        }
      } catch (err: any) {
        console.warn(`[Search] SerpAPI search error: ${err.message}`);
      }
    }

    // SearXNG / Custom JSON Search API Provider
    if (provider === 'searxng' && endpoint) {
      try {
        const url = new URL(endpoint);
        url.searchParams.set('q', cleanQuery);
        url.searchParams.set('format', 'json');
        url.searchParams.set('language', 'zh-CN');
        
        const res = await fetch(url.toString(), {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(6000),
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
      } catch (err: any) {
        console.warn(`[Search] SearXNG search error: ${err.message}`);
      }
    }

    // 2. High-speed Built-in Multi-Source Search (Bing RSS & SearXNG JSON)
    // Attempt A: Official Bing Search Real-Time RSS Stream
    try {
      const bingRssUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}&format=rss`;
      const response = await fetch(bingRssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const xml = await response.text();
        const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g)];
        
        if (itemMatches.length > 0) {
          const results: SearchResultItem[] = [];
          for (let i = 0; i < Math.min(itemMatches.length, maxResults); i++) {
            const rawTitle = itemMatches[i][1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
            const rawLink = itemMatches[i][2].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
            const rawSnippet = itemMatches[i][3].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
            if (rawTitle && rawLink.startsWith('http')) {
              results.push({
                title: rawTitle,
                url: rawLink,
                snippet: rawSnippet,
              });
            }
          }
          if (results.length > 0) {
            return results;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Search] Bing RSS fallback notice: ${err.message}`);
    }

    // Attempt B: High-availability SearXNG fallback instances
    const fallbackSearx = [
      'https://search.mdosch.de',
      'https://priv.au',
      'https://searx.be',
    ];

    for (const inst of fallbackSearx) {
      try {
        const searxUrl = `${inst}/search?q=${encodeURIComponent(cleanQuery)}&format=json&language=zh-CN`;
        const res = await fetch(searxUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.results) && data.results.length > 0) {
            return data.results.slice(0, maxResults).map((r: any) => ({
              title: r.title || '网页结果',
              url: r.url || '',
              snippet: r.content || r.snippet || '',
            }));
          }
        }
      } catch {
        // try next instance
      }
    }

    return [];
  } catch (err: any) {
    console.error(`[Search] Error performing web search for "${query}":`, err.message);
    return [];
  }
}

export function formatSearchResultsForPrompt(results: SearchResultItem[]): string {
  if (!results || results.length === 0) return '';
  
  let formatted = '\n\n【最新实时联网检索结果参考】\n';
  results.forEach((item, index) => {
    formatted += `[${index + 1}] 标题: ${item.title}\n    链接: ${item.url}\n    摘要: ${item.snippet}\n\n`;
  });
  formatted += '【要求】：请严格结合上述最新检索结果中的实时信息回答用户的问题。在正文中引用具体信息时，请在对应句子后使用 [序号] 标注来源。\n';
  return formatted;
}
