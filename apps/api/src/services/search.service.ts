import { db } from '../db/sqlite.js';
import {
  SearchResultItem,
  braveSearch,
  duckduckgoSearch,
  bingSearch,
  baiduSearch,
  tavilySearch,
  searxngSearch,
  bochaSearch,
  serpApiSearch,
  builtinFreeSearch,
} from './search/engines.js';
import { fetchPageMarkdown } from './search/deep-reader.js';

export { SearchResultItem };

/**
 * Checks if the prompt is a simple greeting or trivial conversational phrase that doesn't need search.
 */
export function isTrivialGreeting(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return true;
  if (clean.length <= 8) {
    const greetingPattern = /^(?:早上好|早安|晚上好|晚安|中午好|你好|您好|hi|hello|hey|嗨|哈喽|在吗|在么|谢谢|感谢|多谢|再见|拜拜|ok|好的|收到|测试|test)$/i;
    if (greetingPattern.test(clean)) return true;
  }
  return false;
}

// Backward compatibility alias
export const isSimpleGreetingOrShortQuery = isTrivialGreeting;

/**
 * Executes a single web search using configured engine provider.
 * All queries are 100% raw user prompt without any stripping or keyword alteration.
 */
export async function performWebSearch(query: string, maxResults = 4): Promise<SearchResultItem[]> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  try {
    const providerStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_provider'");
    const endpointStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_endpoint'");
    const keyStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'search_api_key'");

    const provider = (providerStmt.get() as { value: string } | undefined)?.value || 'builtin';
    const endpoint = (endpointStmt.get() as { value: string } | undefined)?.value || '';
    const apiKey = (keyStmt.get() as { value: string } | undefined)?.value || '';

    // 1. Brave Search API
    if (provider === 'brave' && apiKey) {
      const results = await braveSearch(cleanQuery, apiKey, maxResults);
      if (results.length > 0) return results;
    }

    // 2. Tavily AI Search
    if (provider === 'tavily' && apiKey) {
      const results = await tavilySearch(cleanQuery, apiKey, maxResults);
      if (results.length > 0) return results;
    }

    // 3. Bocha (博查) AI Search
    if (provider === 'bocha' && apiKey) {
      const results = await bochaSearch(cleanQuery, apiKey, maxResults);
      if (results.length > 0) return results;
    }

    // 4. SearXNG
    if (provider === 'searxng' && endpoint) {
      const results = await searxngSearch(cleanQuery, endpoint, apiKey, maxResults);
      if (results.length > 0) return results;
    }

    // 5. SerpAPI
    if (provider === 'serpapi' && apiKey) {
      const results = await serpApiSearch(cleanQuery, apiKey, maxResults);
      if (results.length > 0) return results;
    }

    // 6. Builtin Free Search (Baidu + Bing + DuckDuckGo with relevance scoring)
    return await builtinFreeSearch(cleanQuery, maxResults);
  } catch (err: any) {
    console.error(`[Search] Error performing web search for "${query}":`, err.message);
    return [];
  }
}

/**
 * Formats search results with deep Markdown article content into structured context for LLMs.
 */
export function formatSearchResultsForPrompt(results: SearchResultItem[]): string {
  if (!results || results.length === 0) return '';

  let formatted = '\n\n【最新实时联网参考资料（真实网页深度正文）】\n';
  results.forEach((item, index) => {
    formatted += `[${index + 1}] 标题: ${item.title}\n    网址: ${item.url}\n`;
    if (item.source) {
      formatted += `    来源: ${item.source}\n`;
    }
    if (item.content) {
      formatted += `    正文摘录:\n${item.content.split('\n').map(l => `    > ${l}`).join('\n')}\n\n`;
    } else if (item.snippet) {
      formatted += `    摘要: ${item.snippet}\n\n`;
    } else {
      formatted += '\n';
    }
  });

  formatted += '【回答要求】：请严格结合上述最新参考资料中的事实与数据回答用户的问题。在正文中引用具体信息时，请在对应句子后使用 [1]、[2] 等序号标注来源。\n';
  return formatted;
}

/**
 * Performs a complete unified web search for a user prompt:
 * 1. Checks if the query is a trivial greeting (0ms fast bypass)
 * 2. 100% natural query direct pass to modern multi-engine search matrix (no regex stripping, no cleaning)
 * 3. Concurrently fetches deep Markdown content (Jina Reader + local DOM extractor) for top pages
 * 4. Assembles rich, high-density structured Markdown prompt context
 */
export async function performUnifiedWebSearch(
  userPrompt: string
): Promise<{ results: SearchResultItem[]; formattedContext: string; queries: string[] }> {
  const targetQuery = (userPrompt || '').trim();
  if (!targetQuery) {
    return { results: [], formattedContext: '', queries: [] };
  }

  // Trivial greeting: 0ms fast bypass without network overhead
  if (isTrivialGreeting(targetQuery)) {
    return { results: [], formattedContext: '', queries: [targetQuery] };
  }

  // Read system settings for search parameters
  const maxResultsRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_max_results'").get() as { value: string } | undefined;
  const enableDeepReadRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_enable_deep_read'").get() as { value: string } | undefined;
  const deepReadLenRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_deep_read_length'").get() as { value: string } | undefined;

  const maxResults = Math.max(2, Math.min(10, parseInt(maxResultsRow?.value || '4', 10) || 4));
  const enableDeepRead = enableDeepReadRow?.value !== '0'; // default true (1)
  const maxContentLength = Math.max(500, Math.min(4000, parseInt(deepReadLenRow?.value || '2000', 10) || 2000));

  // 1. Execute Web Search via Provider Matrix (100% raw user prompt)
  const rawResults = await performWebSearch(targetQuery, maxResults);
  if (!rawResults || rawResults.length === 0) {
    return { results: [], formattedContext: '', queries: [targetQuery] };
  }

  // 2. Deep Web Content Reading for top 2~3 results
  if (enableDeepRead) {
    const topCandidates = rawResults.slice(0, 3);
    const deepReadPromises = topCandidates.map(async (item) => {
      // If engine already provided rich content (e.g. Tavily), use it
      if (item.content && item.content.length > 200) {
        return;
      }
      try {
        const { content, success } = await fetchPageMarkdown(item.url, maxContentLength);
        if (success && content) {
          item.content = content;
        }
      } catch {
        // deep read failed, fall back to snippet
      }
    });

    await Promise.allSettled(deepReadPromises);
  }

  const formattedContext = formatSearchResultsForPrompt(rawResults);
  return { results: rawResults, formattedContext, queries: [targetQuery] };
}
