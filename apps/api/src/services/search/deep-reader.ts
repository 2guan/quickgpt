/**
 * Deep Webpage Content Reader
 * Uses Jina Reader (https://r.jina.ai/) to fetch clean, ad-free Markdown of webpages,
 * with a resilient local DOM text-extractor fallback.
 */

function cleanExtractedText(raw: string, maxLength: number): string {
  if (!raw) return '';
  
  let text = raw
    // Remove multiple blank lines
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Remove base64 image data strings
    .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
    // Remove markdown image embeds to save prompt space
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Remove typical ad/cookie boilerplate lines
    .replace(/^.*?(?:cookie policy|privacy policy|terms of service|all rights reserved|版权所有).*?$/gim, '')
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '\n...(正文内容已截断)...';
  }
  return text;
}

/**
 * Fallback DOM cleaner: strips non-content tags and returns text.
 */
function extractHtmlText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<h[1-6][^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ');

  return cleaned;
}

/**
 * Fetches the deep Markdown content of a webpage.
 * Primary: Jina Reader (https://r.jina.ai/)
 * Fallback: Direct fetch with DOM text extraction.
 */
export async function fetchPageMarkdown(
  url: string,
  maxLength = 2000,
  jinaApiKey?: string
): Promise<{ content: string; success: boolean }> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('http')) {
    return { content: '', success: false };
  }

  // 1. Primary: Try Jina Reader
  try {
    const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
    const headers: Record<string, string> = {
      'Accept': 'text/plain, text/markdown',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
    };
    if (jinaApiKey) {
      headers['Authorization'] = `Bearer ${jinaApiKey}`;
    }

    const jinaRes = await fetch(jinaUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(3500),
    });

    if (jinaRes.ok) {
      const rawMarkdown = await jinaRes.text();
      const cleaned = cleanExtractedText(rawMarkdown, maxLength);
      if (cleaned && cleaned.length >= 60) {
        return { content: cleaned, success: true };
      }
    }
  } catch (err: any) {
    // Jina Reader notice (continue to fallback)
  }

  // 2. Fallback: Direct Fetch + DOM text extraction
  try {
    const directRes = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(3500),
    });

    if (directRes.ok) {
      const html = await directRes.text();
      const extracted = extractHtmlText(html);
      const cleaned = cleanExtractedText(extracted, maxLength);
      if (cleaned && cleaned.length >= 40) {
        return { content: cleaned, success: true };
      }
    }
  } catch (err: any) {
    // Direct fetch failed
  }

  return { content: '', success: false };
}
