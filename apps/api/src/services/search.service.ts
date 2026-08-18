import { db } from '../db/sqlite.js';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Intelligent keyword extraction from conversational user prompts:
 * 1. Strips polite greetings, conversational openers, and imperative phrases
 * 2. Dedicated weather entity normalizer (e.g. "巴厘岛今天有没有雨" / "今天巴厘岛下雨了吗" -> "巴厘岛天气")
 * 3. Strips temporal prefixes (今天/今日...), conversational question suffixes (怎么样/是多少/是什么/吗/呢/？),
 *    grammatical particles ("的" between nouns), and redundant spaces within Chinese phrases.
 */
export function extractSearchKeywords(rawQuery: string): string {
  if (!rawQuery) return '';

  let query = rawQuery.trim();

  // 1. Remove markdown and code blocks
  query = query.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  // 2. Remove polite greetings, conversational prefixes, and imperative phrases
  const prefixRegex = /^(?:你好|您好|哈喽|hello|hi|hey|早上好|中午好|下午好|晚上好|早安|晚安|请问|请帮我|帮我|麻烦帮我|请告诉我|我想知道|我想了解|查一下|搜一下|检索一下|了解一下|给我查|能不能告诉我|可以告诉我|帮我查查|查查)[\s,，:：!！\?？\n]*/i;
  while (prefixRegex.test(query)) {
    query = query.replace(prefixRegex, '').trim();
  }

  // 3. Dedicated weather entity extractor:
  // e.g. "巴厘岛今天有没有雨" / "今天巴厘岛下雨了吗" / "东京冷不冷" -> "{place}天气"
  if (/(?:天气|下雨|降雨|有雨|有无雨|有没有雨|暴雨|下雪|降雪|冷不?冷|热不?热|气温|温度|晴天|阴天)/.test(query)) {
    let place = query
      .replace(/(?:今天|今日|明天|后天|现在|目前|实时|最近|这几天|当地)/g, '')
      .replace(/(?:有没有|会不?会|有无|是不是|会不会有|会有|是否有|下了|下过|有没有下)/g, '')
      .replace(/(?:天气|预报|下雨|降雨|有雨|暴雨|大雨|小雨|阵雨|雷阵雨|雨|下雪|降雪|雪|降温|刮风|冷不?冷|热不?热|气温|温度|晴天|阴天|怎么样|如何|是多少|是什么|吗|呢|吧|呀|啊|了|？|\?|！|!|的)/g, '')
      .trim();

    if (place.length >= 2) {
      return `${place}天气`;
    }
  }

  // 4. Remove conversational question endings and modal particles
  const suffixRegex = /[\s,，]*(?:怎么样|如何|是多少|有哪些|是什么|有哪些最新消息|最新进展是什么|最新动态是什么|动态是什么|最新消息|最新动态|最新进展|吗|呢|吧|呀|啊|？|\?|！|!)+$/i;
  query = query.replace(suffixRegex, '').trim();

  // 5. Remove temporal prefixes if substantive phrase follows
  query = query.replace(/^(?:今天|今日|现在|目前|当下|实时|最新的|最新)[\s,，]*(?=[\u4e00-\u9fa5a-zA-Z0-9]{2,})/i, '').trim();

  // 6. Remove redundant grammatical particle "的" between Chinese nouns
  query = query.replace(/([\u4e00-\u9fa5]{2,})的([\u4e00-\u9fa5]{2,})/g, '$1$2');

  // 7. Strip spaces within Chinese characters to prevent search engines from splitting compound words
  query = query.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

  // 8. Fallback to original cleaned string if stripping emptied the query
  if (!query || query.length < 2) {
    query = rawQuery.trim().replace(/^[\s,，:：!！\?？]+|[\s,，:：!！\?？]+$/g, '');
  }

  return query;
}

export async function performWebSearch(query: string, maxResults = 5): Promise<SearchResultItem[]> {
  const cleanQuery = extractSearchKeywords(query);
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

    // 2. High-precision Standard Bing Web Search Engine
    try {
      const bingWebUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}`;
      const response = await fetch(bingWebUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const html = await response.text();
        const results: SearchResultItem[] = [];
        const liMatches = [...html.matchAll(/<li[^>]*class=[\x27\x22]b_algo[\x27\x22][^>]*>([\s\S]*?)<\/li>/g)];

        for (const match of liMatches) {
          if (results.length >= maxResults) break;
          const block = match[1];
          const h2Match = block.match(/<h2[^>]*><a\s+[^>]*href=[\x27\x22](https?:\/\/[^\x27\x22]+)[\x27\x22][^>]*>([\s\S]*?)<\/a><\/h2>/i);
          const pMatch = block.match(/<div class=[\x27\x22]b_caption[\x27\x22]>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

          if (h2Match) {
            const itemUrl = h2Match[1];
            const itemTitle = h2Match[2].replace(/<[^>]+>/g, '').trim();
            const itemSnippet = pMatch
              ? pMatch[1].replace(/<[^>]+>/g, '').replace(/&ensp;|&nbsp;|&#0183;|&#176;/g, ' ').replace(/\s+/g, ' ').trim()
              : '';
            if (itemTitle && itemUrl.startsWith('http')) {
              results.push({
                title: itemTitle,
                url: itemUrl,
                snippet: itemSnippet,
              });
            }
          }
        }

        if (results.length > 0) {
          return results;
        }
      }
    } catch (err: any) {
      console.warn(`[Search] Bing Web fallback notice: ${err.message}`);
    }

    // 3. Fallback: Official Bing Real-Time RSS Stream
    try {
      const bingRssUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}&format=rss`;
      const response = await fetch(bingRssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(4000),
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
    } catch {
      // ignore
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
