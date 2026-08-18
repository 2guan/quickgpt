import { db } from '../db/sqlite.js';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(query: string, maxResults = 4): Promise<SearchResultItem[]> {
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

    // 2. Built-in Multi-Source Free Search Engine (DuckDuckGo Lite & Bing HTML)
    const results: SearchResultItem[] = [];

    // Attempt 1: DuckDuckGo HTML
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const html = await response.text();
        const titleRegex = /<a class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const titles: { url: string; title: string }[] = [];
        let match;
        while ((match = titleRegex.exec(html)) !== null && titles.length < 10) {
          let rawUrl = match[1];
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

        for (let i = 0; i < titles.length && results.length < maxResults; i++) {
          if (titles[i].title && (titles[i].url.startsWith('http://') || titles[i].url.startsWith('https://'))) {
            results.push({
              title: titles[i].title,
              url: titles[i].url,
              snippet: snippets[i] || '',
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Search] DuckDuckGo search fallback notice: ${err.message}`);
    }

    if (results.length > 0) {
      return results;
    }

    // Attempt 2: Bing Search HTML Fallback
    try {
      const bingUrl = `https://cn.bing.com/search?q=${encodeURIComponent(cleanQuery)}&setmkt=zh-CN&setlang=zh-Hans`;
      const response = await fetch(bingUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const html = await response.text();
        const itemRegex = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
        let match;
        while ((match = itemRegex.exec(html)) !== null && results.length < maxResults) {
          const itemUrl = match[1];
          const itemTitle = match[2].replace(/<[^>]+>/g, '').trim();
          const itemSnippet = match[3].replace(/<[^>]+>/g, '').trim();
          if (itemUrl.startsWith('http')) {
            results.push({
              title: itemTitle,
              url: itemUrl,
              snippet: itemSnippet,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Search] Bing fallback notice: ${err.message}`);
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
