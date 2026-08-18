import { db } from '../db/sqlite.js';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Fast keyword cleaning fallback ONLY when LLM call fails
 */
export function extractSearchKeywordsFallback(rawQuery: string): string {
  if (!rawQuery) return '';

  let query = rawQuery.trim();
  query = query.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  const prefixRegex = /^(?:你好|您好|哈喽|hello|hi|hey|早上好|中午好|下午好|晚上好|早安|晚安|请问|请帮我|帮我|麻烦帮我|请告诉我|我想知道|我想了解|查一下|搜一下|检索一下|了解一下|给我查|能不能告诉我|可以告诉我|帮我查查|查查)[\s,，:：!！\?？\n]*/i;
  while (prefixRegex.test(query)) {
    query = query.replace(prefixRegex, '').trim();
  }

  const suffixRegex = /[\s,，]*(?:怎么样|如何|是多少|有哪些|是什么|有哪些最新消息|最新进展是什么|最新动态是什么|动态是什么|最新消息|最新动态|最新进展|吗|呢|吧|呀|啊|？|\?|！|!)+$/i;
  query = query.replace(suffixRegex, '').trim();

  if (!query || query.length < 2) {
    query = rawQuery.trim().replace(/^[\s,，:：!！\?？]+|[\s,，:：!！\?？]+$/g, '');
  }

  return query;
}

/**
 * Uses a fast LLM call (e.g. MiMo 2.5 without thinking) to generate 1~N targeted search queries
 * respecting configured query count and maximum query length.
 * The model output is strictly parsed and used directly as search engine queries.
 */
export async function generateSearchQueriesWithLLM(
  userPrompt: string,
  preferredModelId?: string
): Promise<string[]> {
  try {
    const { getModelCandidates, getChatUrlCandidates } = await import('./chat.service.js');
    
    // Read system settings
    const queryModelRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_query_model_id'").get() as { value: string } | undefined;
    const queryCountRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_query_count'").get() as { value: string } | undefined;
    const maxLenRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_query_max_length'").get() as { value: string } | undefined;

    const customQueryModelStr = queryModelRow?.value?.trim() || '';
    const queryCount = Math.max(1, Math.min(5, parseInt(queryCountRow?.value || '3', 10) || 3));
    const queryMaxLen = Math.max(10, Math.min(100, parseInt(maxLenRow?.value || '30', 10) || 30));

    // Support comma-separated priority models
    const configuredModelIds = customQueryModelStr && customQueryModelStr !== 'auto'
      ? customQueryModelStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    let candidateList: any[] = [];
    for (const mid of configuredModelIds) {
      const cands = getModelCandidates(mid);
      if (cands.length > 0) {
        candidateList = cands;
        break;
      }
    }

    if (candidateList.length === 0 && preferredModelId) {
      candidateList = getModelCandidates(preferredModelId);
    }
    if (candidateList.length === 0) {
      candidateList = getModelCandidates('mimo-v2.5');
    }
    if (candidateList.length === 0) {
      const anyModel = db.prepare("SELECT model_id FROM models WHERE is_active = 1 AND model_id NOT LIKE '%tts%' AND model_id NOT LIKE '%image%' ORDER BY order_index ASC LIMIT 1").get() as { model_id: string } | undefined;
      if (anyModel) {
        candidateList = getModelCandidates(anyModel.model_id);
      }
    }

    if (candidateList.length > 0) {
      const cand = candidateList[0];
      const chatUrls = getChatUrlCandidates(cand.channel_base_url);
      const url = chatUrls[0];

      const systemPrompt = `你是一个专业的搜索引擎关键词提炼专家。请将用户的问题转换为最适合在搜索引擎精准检索的高价值核心短语（提炼 1 到 ${queryCount} 个，每个长度不超过 ${queryMaxLen} 字）。
【要求与原则】：
1. 提炼出真正具有高信息量的主题词与实体名词。严禁包含口语化疑问词、助词、或者导致搜索引擎分词失真的细碎词（如"玩儿什么"、"有哪些"、"怎么样"）。
2. 请提炼为标准实体名词与核心主题词（可以用空格分隔核心概念以增强搜索引擎召回率，例如："巴厘岛 旅游 攻略"、"巴厘岛 最佳旅游时间"、"巴厘岛 旅游"）。
3. 只返回纯 JSON 字符串数组，例如：["短语1", "短语2", "短语3"]。绝对不要输出任何思考过程或解释。`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cand.channel_api_key}`,
          'api-key': cand.channel_api_key,
        },
        body: JSON.stringify({
          model: cand.model_id,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 180,
          thinking: { type: 'disabled' },
          stream: false,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        let content = (json.choices?.[0]?.message?.content || '').replace(/<think[\s\S]*?<\/think>/gi, '').trim();
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const finalQueries = parsed
              .slice(0, queryCount)
              .map((q: any) => String(q).trim().slice(0, queryMaxLen))
              .filter(Boolean);
            if (finalQueries.length > 0) {
              return finalQueries;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Search] LLM query generation notice: ${err.message}`);
  }

  const fallback = extractSearchKeywordsFallback(userPrompt);
  return fallback ? [fallback] : [userPrompt.slice(0, 30)];
}

/**
 * Executes a single web search using the EXACT query string returned by the LLM.
 * No regex tampering is performed on the query.
 */
export async function performWebSearch(query: string, maxResults = 3): Promise<SearchResultItem[]> {
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
      } catch (err: any) {
        console.warn(`[Search] Tavily search error: ${err.message}`);
      }
    }

    // SerpAPI Google Search Provider
    if (provider === 'serpapi' && apiKey) {
      try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(cleanQuery)}&api_key=${encodeURIComponent(apiKey)}&hl=zh-cn&gl=cn&num=${maxResults}`;
        const res = await fetch(serpUrl, { signal: AbortSignal.timeout(5000) });
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
        signal: AbortSignal.timeout(5000),
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

            // Filter out dictionary / single-character entries when querying multi-character topics
            const isSingleCharDict =
              cleanQuery.replace(/\s+/g, '').length >= 2 &&
              (/^(?:[\u4e00-\u9fa5]（|[\u4e00-\u9fa5]的意思|[\u4e00-\u9fa5]的解释|[\u4e00-\u9fa5] bā|巴蜀，巴蜀)/i.test(
                itemTitle
              ) ||
                /汉语文字|汉语国学|汉字|压强的非法定计量单位|压强单位|《漢典》|康熙字典|新华字典/.test(
                  itemTitle
                ));

            if (itemTitle && itemUrl.startsWith('http') && !isSingleCharDict) {
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

    return [];
  } catch (err: any) {
    console.error(`[Search] Error performing web search for "${query}":`, err.message);
    return [];
  }
}

/**
 * Concurrently executes web searches for multiple queries, applies per-query and total limits,
 * and returns deduplicated results.
 */
export async function executeMultiQueryWebSearch(
  queries: string[],
  overrideResultsPerQuery?: number,
  overrideMaxTotalResults?: number
): Promise<SearchResultItem[]> {
  if (!queries || queries.length === 0) return [];

  // Read system settings if not overridden
  const resultsPerQueryRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_results_per_query'").get() as { value: string } | undefined;
  const maxTotalRow = db.prepare("SELECT value FROM system_settings WHERE key = 'search_max_total_results'").get() as { value: string } | undefined;

  const resultsPerQuery = overrideResultsPerQuery || Math.max(1, Math.min(10, parseInt(resultsPerQueryRow?.value || '3', 10) || 3));
  const maxTotalResults = overrideMaxTotalResults || Math.max(3, Math.min(20, parseInt(maxTotalRow?.value || '9', 10) || 9));

  const searchPromises = queries.map((q) => performWebSearch(q, resultsPerQuery));
  const resultsArrays = await Promise.all(searchPromises);

  const seenUrls = new Set<string>();
  const mergedResults: SearchResultItem[] = [];

  for (const arr of resultsArrays) {
    for (const item of arr) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        mergedResults.push(item);
        if (mergedResults.length >= maxTotalResults) {
          break;
        }
      }
    }
    if (mergedResults.length >= maxTotalResults) {
      break;
    }
  }

  return mergedResults;
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
