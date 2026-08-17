import { getModelByIdOrModelId, getPublicModels } from './model.service.js';

export async function generateFollowUpSuggestions(
  contextQuestion: string,
  contextAnswer: string,
  modelId?: string
): Promise<string[]> {
  try {
    let targetModel = modelId ? getModelByIdOrModelId(modelId) : undefined;
    if (!targetModel) {
      const publicModels = getPublicModels();
      const textModel = publicModels.find(m => m.capabilities_json.includes('text'));
      if (textModel) {
        targetModel = getModelByIdOrModelId(textModel.model_id);
      }
    }

    if (!targetModel || !targetModel.channel_base_url || !targetModel.channel_api_key) {
      return [];
    }

    const cleanBaseUrl = targetModel.channel_base_url.replace(/\/+$/, '');
    const url = cleanBaseUrl.endsWith('/chat/completions') ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`;

    const prompt = `根据用户的上一条提问和助手的回答，生成 3 个用户最可能接着提问的简短追问选项。
要求：
1. 每个追问在一行，不带序号、不要多余前缀，不要任何解释。
2. 简短精炼，不超过 20 个字。
3. 严格输出 3 行。

【用户提问】：${contextQuestion.slice(0, 300)}
【助手回答】：${contextAnswer.slice(0, 500)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${targetModel.channel_api_key}`,
      },
      body: JSON.stringify({
        model: targetModel.real_model_id || targetModel.model_id,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as any;
    const rawContent: string = json.choices?.[0]?.message?.content || '';
    const lines = rawContent
      .split('\n')
      .map(l => l.replace(/^[0-9]+[\.、\s\-\*]+/, '').trim())
      .filter(l => l.length > 2 && l.length <= 40);

    return lines.slice(0, 3);
  } catch (err: any) {
    console.warn(`[FollowUp] Suggestion generation failed: ${err.message}`);
    return [];
  }
}
