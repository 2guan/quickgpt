/**
 * Multi-Engine Search Matrix
 * Implements adapters for:
 * 1. Brave Search API (Top Developer Search API)
 * 2. DuckDuckGo (HTML / Lite)
 * 3. Bing Web Search (Enhanced Real URLs)
 * 4. Baidu Web Search (Chinese Mainland News & Docs)
 * 5. Tavily AI Search API
 * 6. SearXNG Meta Search
 * 7. Bocha (博查) AI Search API
 * 8. SerpAPI (Google Search)
 * 9. Built-in Free Search Matrix Orchestrator with Intelligent Noise Filtering & Re-ranking
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  source?: string;
  score?: number;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0183;/g, '·')
    .replace(/&#176;/g, '°')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Filter out dictionary / encyclopedia collisions where single words (e.g. "明天", "巴", "检索")
 * caused search engines to return dictionary definition pages instead of actual content.
 */
export function isNoiseResult(title: string, query: string): boolean {
  if (!title) return true;
  const isDict = /（(?:汉语词语|白话短篇小说|信息学术语|古汉语|成语|网络流行语|汉字|压强的非法定计量单位)）|《漢典》|新华字典|康熙字典|可可诗词网|大家还在搜|相关搜索|为你推荐|问过的人/.test(title);
  const isQueryAskingDefinition = /意思|定义|词语|小说|诗词|文言文|拼音|语法|字义/.test(query);
  return isDict && !isQueryAskingDefinition;
}

/**
 * Calculate relevance score based on keyword overlap between query and result item.
 */
export function calculateRelevanceScore(item: SearchResultItem, query: string): number {
  let score = 0;
  const title = (item.title || '').toLowerCase();
  const snippet = (item.snippet || '').toLowerCase();
  const cleanQ = query.toLowerCase();

  // Full phrase match bonus
  if (title.includes(cleanQ)) score += 25;
  if (snippet.includes(cleanQ)) score += 10;

  // Word token overlap
  const words = cleanQ.split(/[\s,，、。！？!?]+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (title.includes(w)) score += 10;
    if (snippet.includes(w)) score += 3;
  }

  // CJK Character overlap
  const cjk = cleanQ.replace(/[^\u4e00-\u9fa5]/g, '');
  for (const c of cjk) {
    if (title.includes(c)) score += 1;
    if (snippet.includes(c)) score += 0.2;
  }

  return score;
}

/**
 * 1. Brave Search API Adapter
 * Documentation: https://api.search.brave.com/app/documentation/web-search/get-started
 */
export async function braveSearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  if (!apiKey) return [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}&text_decorations=false`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey.trim(),
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Search:Brave] HTTP ${res.status}: ${errText.slice(0, 150)}`);
      return [];
    }

    const data = (await res.json()) as any;
    const items: any[] = data.web?.results || [];

    return items
      .slice(0, maxResults)
      .map((item) => ({
        title: decodeHtmlEntities(item.title || '网页结果'),
        url: item.url || '',
        snippet: decodeHtmlEntities(item.description || item.snippet || ''),
        source: extractDomain(item.url || ''),
      }))
      .filter(r => r.url.startsWith('http') && !isNoiseResult(r.title, query));
  } catch (err: any) {
    console.warn(`[Search:Brave] Error: ${err.message}`);
    return [];
  }
}

/**
 * 2. DuckDuckGo HTML Adapter (Clean direct URLs, no API key needed)
 */
export async function duckduckgoSearch(
  query: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(query)}&b=`,
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResultItem[] = [];

    const blockMatches = [...html.matchAll(/<div[^>]*class=[\x27\x22][^\x22\x27]*result\s+results_links[^\x22\x27]*[\x27\x22][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi)];

    for (const match of blockMatches) {
      if (results.length >= maxResults) break;
      const block = match[0];

      const linkMatch = block.match(/<a[^>]*class=[\x27\x22][^\x22\x27]*result__a[^\x22\x27]*[\x27\x22][^>]*href=[\x27\x22]([^\x27\x22]+)[\x27\x22][^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]*class=[\x27\x22][^\x22\x27]*result__snippet[^\x22\x27]*[\x27\x22][^>]*>([\s\S]*?)<\/a>/i);

      if (linkMatch) {
        let rawHref = linkMatch[1];
        let actualUrl = rawHref;

        if (rawHref.includes('uddg=')) {
          const matchUddg = rawHref.match(/uddg=([^&]+)/);
          if (matchUddg && matchUddg[1]) {
            actualUrl = decodeURIComponent(matchUddg[1]);
          }
        }

        const title = decodeHtmlEntities(linkMatch[2]);
        const snippet = snippetMatch ? decodeHtmlEntities(snippetMatch[1]) : '';

        if (title && actualUrl.startsWith('http') && !actualUrl.includes('duckduckgo.com') && !isNoiseResult(title, query)) {
          results.push({
            title,
            url: actualUrl,
            snippet,
            source: extractDomain(actualUrl),
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    return [];
  }
}

/**
 * 3. Bing Web Search Adapter
 */
export async function bingSearch(
  query: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResultItem[] = [];

    const liMatches = [...html.matchAll(/<li[^>]*class=[\x27\x22]b_algo[\x27\x22][^>]*>([\s\S]*?)<\/li>/gi)];

    for (const match of liMatches) {
      if (results.length >= maxResults) break;
      const block = match[1];
      const h2Match = block.match(/<h2[^>]*><a\s+[^>]*href=[\x27\x22](https?:\/\/[^\x27\x22]+)[\x27\x22][^>]*>([\s\S]*?)<\/a><\/h2>/i);
      const pMatch = block.match(/<div class=[\x27\x22]b_caption[\x27\x22]>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

      if (h2Match) {
        const itemUrl = h2Match[1];
        const itemTitle = decodeHtmlEntities(h2Match[2]);
        const itemSnippet = pMatch ? decodeHtmlEntities(pMatch[1]) : '';

        if (itemTitle && itemUrl.startsWith('http') && !isNoiseResult(itemTitle, query)) {
          results.push({
            title: itemTitle,
            url: itemUrl,
            snippet: itemSnippet,
            source: extractDomain(itemUrl),
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    console.warn(`[Search:Bing] Notice: ${err.message}`);
    return [];
  }
}

/**
 * 4. Baidu Web Search Adapter
 */
export async function baiduSearch(
  query: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  try {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults + 2}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResultItem[] = [];

    const itemMatches = [...html.matchAll(/<div[^>]*class=[\x27\x22][^\x22\x27]*result\s+c-container[^\x22\x27]*[\x27\x22][\s\S]*?<\/div>\s*<\/div>/gi)];

    for (const match of itemMatches) {
      if (results.length >= maxResults) break;
      const block = match[0];
      const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href=[\x27\x22]([^\x27\x22]+)[\x27\x22][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i);
      const snippetMatch = block.match(/<span class=[\x27\x22]content-right_[\s\S]*?>([\s\S]*?)<\/span>/i) || block.match(/<div class=[\x27\x22]c-abstract[\x27\x22]>([\s\S]*?)<\/div>/i);

      if (titleMatch) {
        const itemUrl = titleMatch[1];
        const itemTitle = decodeHtmlEntities(titleMatch[2]);
        const itemSnippet = snippetMatch ? decodeHtmlEntities(snippetMatch[1]) : '';

        if (itemTitle && itemUrl.startsWith('http') && !isNoiseResult(itemTitle, query)) {
          results.push({
            title: itemTitle,
            url: itemUrl,
            snippet: itemSnippet,
            source: 'baidu.com',
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    console.warn(`[Search:Baidu] Notice: ${err.message}`);
    return [];
  }
}

/**
 * 5. Tavily AI Search Adapter
 */
export async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        search_depth: 'basic',
        max_results: maxResults,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (Array.isArray(data.results)) {
      return data.results
        .slice(0, maxResults)
        .map((r: any) => ({
          title: decodeHtmlEntities(r.title || '网页结果'),
          url: r.url || '',
          snippet: decodeHtmlEntities(r.content || r.snippet || ''),
          content: r.raw_content ? r.raw_content.slice(0, 2500) : undefined,
          source: extractDomain(r.url || ''),
        }))
        .filter((r: any) => r.url.startsWith('http'));
    }
    return [];
  } catch (err: any) {
    console.warn(`[Search:Tavily] Error: ${err.message}`);
    return [];
  }
}

/**
 * 6. SearXNG Meta Search Adapter
 */
export async function searxngSearch(
  query: string,
  endpoint: string,
  apiKey?: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  if (!endpoint) return [];
  try {
    const url = new URL(endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'zh-CN');

    const res = await fetch(url.toString(), {
      headers: apiKey ? { Authorization: `Bearer ${apiKey.trim()}` } : {},
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (Array.isArray(data.results)) {
      return data.results
        .slice(0, maxResults)
        .map((r: any) => ({
          title: decodeHtmlEntities(r.title || '网页结果'),
          url: r.url || '',
          snippet: decodeHtmlEntities(r.content || r.snippet || ''),
          source: extractDomain(r.url || ''),
        }))
        .filter((r: any) => r.url.startsWith('http') && !isNoiseResult(r.title, query));
    }
    return [];
  } catch (err: any) {
    console.warn(`[Search:SearXNG] Error: ${err.message}`);
    return [];
  }
}

/**
 * 7. Bocha (博查) AI Search API Adapter
 * Standard AI Search API in China (https://bochaai.com)
 */
export async function bochaSearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        query,
        freshness: 'noLimit',
        summary: true,
        count: maxResults,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const webPages = data.data?.webPages?.value || data.webPages?.value || [];

    if (Array.isArray(webPages)) {
      return webPages
        .slice(0, maxResults)
        .map((item: any) => ({
          title: decodeHtmlEntities(item.name || item.title || '网页结果'),
          url: item.url || '',
          snippet: decodeHtmlEntities(item.summary || item.snippet || item.description || ''),
          source: extractDomain(item.url || ''),
        }))
        .filter((r: any) => r.url.startsWith('http'));
    }
    return [];
  } catch (err: any) {
    console.warn(`[Search:Bocha] Error: ${err.message}`);
    return [];
  }
}

/**
 * 8. SerpAPI (Google Search) Adapter
 */
export async function serpApiSearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  if (!apiKey) return [];
  try {
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey.trim())}&hl=zh-cn&gl=cn&num=${maxResults}`;
    const res = await fetch(serpUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (Array.isArray(data.organic_results)) {
      return data.organic_results
        .slice(0, maxResults)
        .map((r: any) => ({
          title: decodeHtmlEntities(r.title || '网页结果'),
          url: r.link || '',
          snippet: decodeHtmlEntities(r.snippet || ''),
          source: extractDomain(r.link || ''),
        }))
        .filter((r: any) => r.url.startsWith('http'));
    }
    return [];
  } catch (err: any) {
    console.warn(`[Search:SerpAPI] Error: ${err.message}`);
    return [];
  }
}

/**
 * 9. Built-in Free Search Matrix Orchestrator
 * Concurrently queries Baidu, Bing, and DuckDuckGo, filters dictionary collisions,
 * scores by keyword overlap, deduplicates URLs, and returns top results.
 */
export async function builtinFreeSearch(
  query: string,
  maxResults = 5
): Promise<SearchResultItem[]> {
  const [baiduResults, bingResults, ddgResults] = await Promise.allSettled([
    baiduSearch(query, maxResults + 2),
    bingSearch(query, maxResults + 2),
    duckduckgoSearch(query, maxResults),
  ]);

  const allItems: SearchResultItem[] = [];
  if (baiduResults.status === 'fulfilled') allItems.push(...baiduResults.value);
  if (bingResults.status === 'fulfilled') allItems.push(...bingResults.value);
  if (ddgResults.status === 'fulfilled') allItems.push(...ddgResults.value);

  const seenUrls = new Set<string>();
  const scoredItems: SearchResultItem[] = [];

  for (const item of allItems) {
    const normalizedUrl = item.url.replace(/\/+$/, '').toLowerCase();
    if (item.title && item.url && !seenUrls.has(normalizedUrl) && !isNoiseResult(item.title, query)) {
      seenUrls.add(normalizedUrl);
      const score = calculateRelevanceScore(item, query);
      scoredItems.push({
        ...item,
        score,
      });
    }
  }

  // Sort by relevance score descending
  scoredItems.sort((a, b) => (b.score || 0) - (a.score || 0));

  return scoredItems.slice(0, maxResults);
}
