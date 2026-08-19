export interface GeneratedImageResult {
  url?: string;
  b64Json?: string;
  revisedPrompt: string;
}

export function getGeneratedImageResults(payload: any, prompt: string): GeneratedImageResult[] {
  if (!Array.isArray(payload?.data)) return [];

  return payload.data.flatMap((item: any) => {
    const url = typeof item?.url === 'string' ? item.url : undefined;
    const b64Json = typeof item?.b64_json === 'string' ? item.b64_json : undefined;
    return url || b64Json ? [{ url, b64Json, revisedPrompt: item?.revised_prompt || prompt }] : [];
  });
}
