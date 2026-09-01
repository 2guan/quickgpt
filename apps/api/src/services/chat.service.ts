import { db } from '../db/sqlite.js';
import { FastifyReply } from 'fastify';
import {
  formatSearchResultsForPrompt,
  performUnifiedWebSearch,
  SearchResultItem,
} from './search.service.js';
import { generateFollowUpSuggestions } from './followup.service.js';
import { recordAuditLog } from './audit.service.js';
import { ENV } from '../config/env.js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { getGeneratedImageResults } from './image-generation.js';

export interface ConversationEntity {
  id: string;
  user_id: string;
  title: string;
  model_ids_json: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
}

export interface MessageEntity {
  id: string;
  conversation_id: string;
  user_id: string;
  parent_id: string | null;
  role: string;
  model_id: string;
  content: string;
  reasoning_content: string;
  search_results_json: string;
  followup_suggestions_json: string;
  image_params_json: string;
  attachments_json: string;
  token_count: number;
  created_at: string;
}

export function getUserConversations(userId: string): ConversationEntity[] {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    WHERE user_id = ? 
    ORDER BY is_pinned DESC, updated_at DESC
  `);
  return stmt.all(userId) as unknown as ConversationEntity[];
}

export function getConversationMessages(conversationId: string, userId: string): MessageEntity[] {
  const convStmt = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?');
  const conv = convStmt.get(conversationId, userId);
  if (!conv) return [];

  const stmt = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC
  `);
  return stmt.all(conversationId) as unknown as MessageEntity[];
}

export function getAdminUserMessages(conversationId: string): MessageEntity[] {
  const stmt = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC
  `);
  return stmt.all(conversationId) as unknown as MessageEntity[];
}

export function createConversation(
  userId: string,
  title = '新建对话',
  modelIds: string[] = ['gpt-4o']
): ConversationEntity {
  const id = `conv_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO conversations (id, user_id, title, model_ids_json, is_pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `);

  stmt.run(id, userId, title, JSON.stringify(modelIds), now, now);

  const getStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  return getStmt.get(id) as unknown as ConversationEntity;
}

export function updateConversation(id: string, userId: string, updates: { title?: string; is_pinned?: number }): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE conversations 
    SET title = COALESCE(?, title),
        is_pinned = COALESCE(?, is_pinned),
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `);
  stmt.run(updates.title ?? null, updates.is_pinned ?? null, now, id, userId);
}

export function deleteConversation(id: string, userId: string): boolean {
  const stmt = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?');
  const res = stmt.run(id, userId);
  return res.changes > 0;
}

export function saveMessage(msg: Partial<MessageEntity>): MessageEntity {
  const id = msg.id || `msg_${crypto.randomBytes(8).toString('hex')}`;
  const now = msg.created_at || new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, user_id, parent_id, role, model_id, content, 
      reasoning_content, search_results_json, followup_suggestions_json, 
      image_params_json, attachments_json, token_count, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    msg.conversation_id!,
    msg.user_id!,
    msg.parent_id || null,
    msg.role || 'user',
    msg.model_id || '',
    msg.content || '',
    msg.reasoning_content || '',
    msg.search_results_json || '[]',
    msg.followup_suggestions_json || '[]',
    msg.image_params_json || '{}',
    msg.attachments_json || '[]',
    msg.token_count || 0,
    now
  );

  // Update conversation updated_at
  const updateConv = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
  updateConv.run(now, msg.conversation_id!);

  const getStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  return getStmt.get(id) as unknown as MessageEntity;
}

export interface ModelWithChannelCandidate {
  id: string;
  model_id: string;
  real_model_id: string;
  display_name: string;
  channel_id: string;
  capabilities_json: string;
  is_visible_in_chat: number;
  enable_search_fallback: number;
  enable_followup: number;
  followup_model_id: string;
  channel_name: string;
  channel_base_url: string;
  channel_api_key: string;
  channel_priority: number;
}

/**
 * Returns all active channels that provide the requested model_id,
 * strictly sorted by channel priority DESC (highest priority first).
 */
export function getModelCandidates(modelId: string): ModelWithChannelCandidate[] {
  const stmt = db.prepare(`
    SELECT m.*, c.id as channel_id, c.name as channel_name, c.base_url as channel_base_url, 
           c.api_key as channel_api_key, c.priority as channel_priority
    FROM models m
    JOIN channels c ON m.channel_id = c.id
    WHERE (m.model_id = ? OR m.id = ?) AND m.is_active = 1 AND c.status = 1
    ORDER BY c.priority DESC, m.order_index ASC, m.created_at ASC
  `);
  return stmt.all(modelId, modelId) as unknown as ModelWithChannelCandidate[];
}

export function getChatUrlCandidates(baseUrl: string): string[] {
  let clean = baseUrl.replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return [clean];
  if (clean.endsWith('/v1')) return [`${clean}/chat/completions`];
  return [`${clean}/v1/chat/completions`, `${clean}/chat/completions`];
}

function getImageGenUrlCandidates(baseUrl: string): string[] {
  let clean = baseUrl.replace(/\/+$/, '');
  if (clean.endsWith('/images/generations')) return [clean];
  if (clean.endsWith('/v1')) return [`${clean}/images/generations`];
  return [`${clean}/v1/images/generations`, `${clean}/images/generations`];
}

export async function handleStreamChat({
  user,
  conversationId,
  modelId,
  messages,
  attachments,
  enableSearch,
  enablePPT,
  enableHtmlPPT,
  imageParams,
  reply,
  clientIp,
  precomputedSearchResults,
  precomputedSearchContextText,
}: {
  user: { id: string; username: string };
  conversationId: string;
  modelId: string;
  messages: Array<{ role: string; content: string; reasoning_content?: string }>;
  attachments?: Array<{ name: string; text?: string; url?: string; type: string }>;
  enableSearch?: boolean;
  enablePPT?: boolean;
  enableHtmlPPT?: boolean;
  imageParams?: { size?: string; quality?: string; style?: string; aspect_ratio?: string };
  reply: FastifyReply;
  clientIp: string;
  precomputedSearchResults?: SearchResultItem[];
  precomputedSearchContextText?: string;
}) {
  const startTime = Date.now();
  const candidates = getModelCandidates(modelId);

  if (candidates.length === 0) {
    const errorMsg = `模型【${modelId}】未找到或所有关联渠道均已被停用，请在管理员后台【渠道管理】与【模型管理】中检查配置。`;
    reply.raw.write(`data: ${JSON.stringify({ error: errorMsg, modelId })}\n\n`);
    reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);
    return;
  }

  // Filter out candidates with empty or placeholder keys
  const validCandidates = candidates.filter(
    (c) => c.channel_api_key && !c.channel_api_key.includes('placeholder')
  );

  if (validCandidates.length === 0) {
    const primary = candidates[0];
    const errorMsg = `模型【${modelId}】所属渠道【${primary.channel_name}】未配置有效的 API Key，请登录管理员后台在【渠道管理】中配置。`;
    reply.raw.write(`data: ${JSON.stringify({ error: errorMsg, modelId })}\n\n`);
    reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);
    return;
  }

  const primaryCandidate = validCandidates[0];
  const isImageModel = primaryCandidate.capabilities_json.includes('image');
  const userLastMsg = messages[messages.length - 1]?.content || '';

  // 1. Check if Image Generation Model
  if (isImageModel) {
    let lastErrorMsg = '';

    for (let cIdx = 0; cIdx < validCandidates.length; cIdx++) {
      const candidate = validCandidates[cIdx];
      const imgUrls = getImageGenUrlCandidates(candidate.channel_base_url);
      let prompt = userLastMsg;
      let size = imageParams?.size || '1024x1024';
      if (imageParams?.aspect_ratio === '16:9') size = '1792x1024';
      if (imageParams?.aspect_ratio === '9:16') size = '1024x1792';

      for (const imgUrl of imgUrls) {
        try {
          const response = await fetch(imgUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${candidate.channel_api_key}`,
            },
            body: JSON.stringify({
              model: candidate.real_model_id || candidate.model_id,
              prompt,
              size,
              quality: imageParams?.quality || 'standard',
              style: imageParams?.style || 'vivid',
              n: 1,
            }),
          });

          const latencyMs = Date.now() - startTime;
          if (!response.ok) {
            const errText = await response.text();
            lastErrorMsg = `渠道【${candidate.channel_name}】生图失败 (HTTP ${response.status}): ${errText}`;
            recordAuditLog({
              user_id: user.id,
              username: user.username,
              model_id: modelId,
              channel_id: candidate.channel_id,
              duration_ms: latencyMs,
              status_code: response.status,
              error_message: lastErrorMsg.slice(0, 200),
              ip: clientIp,
            });
            // Try next candidate channel if available
            break;
          }

          const generatedImages = getGeneratedImageResults(await response.json(), prompt);
          if (generatedImages.length === 0) throw new Error('渠道未返回有效图片');

          const finalImageUrls: string[] = [];
          for (const { url: rawUrl, b64Json, revisedPrompt } of generatedImages) {
            let finalImageUrl = '';

            if (b64Json) {
              const buffer = Buffer.from(b64Json, 'base64');
              const filename = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
              fs.writeFileSync(path.join(ENV.UPLOADS_DIR, filename), buffer);
              finalImageUrl = `/uploads/${filename}`;

              db.prepare(`
                INSERT INTO uploads (id, user_id, file_name, file_path, file_size, mime_type, is_generated_image, extracted_text, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
              `).run(`up_${crypto.randomBytes(6).toString('hex')}`, user.id, filename, filename, buffer.length, 'image/png', revisedPrompt, new Date().toISOString());
            } else if (rawUrl) {
              let fullRemoteUrl = rawUrl;
              if (rawUrl.startsWith('/')) {
                try {
                  fullRemoteUrl = `${new URL(candidate.channel_base_url).origin}${rawUrl}`;
                } catch {
                  // Use the original URL if the channel URL is invalid.
                }
              }

              try {
                const dlRes = await fetch(fullRemoteUrl, {
                  headers: { Authorization: `Bearer ${candidate.channel_api_key}` },
                  signal: AbortSignal.timeout(10000),
                });
                if (dlRes.ok) {
                  const buffer = Buffer.from(await dlRes.arrayBuffer());
                  const filename = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${path.extname(rawUrl) || '.png'}`;
                  fs.writeFileSync(path.join(ENV.UPLOADS_DIR, filename), buffer);
                  finalImageUrl = `/uploads/${filename}`;

                  db.prepare(`
                    INSERT INTO uploads (id, user_id, file_name, file_path, file_size, mime_type, is_generated_image, extracted_text, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                  `).run(`up_${crypto.randomBytes(6).toString('hex')}`, user.id, filename, filename, buffer.length, 'image/png', revisedPrompt, new Date().toISOString());
                } else {
                  finalImageUrl = fullRemoteUrl;
                }
              } catch {
                finalImageUrl = fullRemoteUrl;
              }
            }

            if (finalImageUrl) finalImageUrls.push(finalImageUrl);
          }

          if (finalImageUrls.length === 0) throw new Error('渠道未返回可用图片');
          const revisedPrompt = generatedImages[0].revisedPrompt;
          const markdownOutput = `${finalImageUrls.map((url, index) => `![生成图片 ${index + 1}](${url})`).join('\n')}\n\n*生成提示词*: ${revisedPrompt}`;

          reply.raw.write(`data: ${JSON.stringify({ delta: markdownOutput, modelId })}\n\n`);
          reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);

          saveMessage({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            model_id: modelId,
            content: markdownOutput,
            image_params_json: JSON.stringify(imageParams || {}),
          });

          recordAuditLog({
            user_id: user.id,
            username: user.username,
            model_id: modelId,
            channel_id: candidate.channel_id,
            duration_ms: latencyMs,
            status_code: 200,
            ip: clientIp,
          });
          return;
        } catch (err: any) {
          lastErrorMsg = `渠道【${candidate.channel_name}】生图网络异常: ${err.message}`;
          break;
        }
      }
    }

    // If all channels failed
    reply.raw.write(`data: ${JSON.stringify({ error: lastErrorMsg || '所有可用渠道生图均失败', modelId })}\n\n`);
    reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);
    return;
  }

  // 2. Text / Multi-modal Chat Model
  let searchResults: SearchResultItem[] = precomputedSearchResults || [];
  let searchContextText = precomputedSearchContextText || '';

  // Only trigger web search when user explicitly turns on the search button in the chat input (if not precomputed)
  if (enableSearch && (!precomputedSearchResults || precomputedSearchResults.length === 0)) {
    if (!precomputedSearchContextText) {
      reply.raw.write(`data: ${JSON.stringify({ status: '正在进行全网检索与深度正文提取...', modelId })}\n\n`);
      const unified = await performUnifiedWebSearch(userLastMsg);
      searchResults = unified.results;
      searchContextText = unified.formattedContext;
    }
  }

  if (searchResults.length > 0) {
    reply.raw.write(`data: ${JSON.stringify({ searchResults, modelId })}\n\n`);
  }

  // Assemble Attachment extracted texts into context
  let attachmentContextText = '';
  const base64Images: string[] = [];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.text) {
        attachmentContextText += `\n\n【用户上传附件内容: ${att.name}】\n${att.text}\n`;
      }

      // Check if image for Vision Model support
      const isImg = att.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.name || att.url || '');
      if (isImg && att.url) {
        let filename = path.basename(att.url);
        let localPath = path.join(ENV.UPLOADS_DIR, filename);
        if (!fs.existsSync(localPath)) {
          const row = db
            .prepare('SELECT file_path FROM uploads WHERE file_name = ? OR file_path = ? ORDER BY created_at DESC LIMIT 1')
            .get(filename, filename) as { file_path: string } | undefined;
          if (row?.file_path) {
            localPath = path.join(ENV.UPLOADS_DIR, row.file_path);
          }
        }

        if (fs.existsSync(localPath)) {
          const buffer = fs.readFileSync(localPath);
          const ext = path.extname(localPath).toLowerCase();
          const mime =
            ext === '.png' ? 'image/png' :
            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
            ext === '.webp' ? 'image/webp' :
            ext === '.gif' ? 'image/gif' :
            ext === '.svg' ? 'image/svg+xml' :
            att.type || 'image/png';
          base64Images.push(`data:${mime};base64,${buffer.toString('base64')}`);
        }
      }
    }
  }

  // Build OpenAI format messages
  const payloadMessages: any[] = [];
  
  // System prompt
  const systemPromptStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'global_system_prompt'");
  const globalSystemPrompt = (systemPromptStmt.get() as { value: string } | undefined)?.value || 'You are a helpful, knowledgeable AI assistant.';

  let combinedSystemPrompt = globalSystemPrompt;

  // PPT is an explicit mode, never inferred from words in the user's prompt.
  if (enablePPT) {
    combinedSystemPrompt += `\n\n【PPT 输出协议：必须严格遵守】
你正在生成可直接渲染和导出的演示文稿。只输出一个 \`\`\`ppt 代码块，不要输出解释、前言或代码块外文本。页面之间只能用单独一行 \`---\` 分隔。

【整份演示文稿的视觉主题：必须写在代码块最开头，仅写一次】
在第一张幻灯片的 \`<!-- layout: ... -->\` 之前，依次输出：
\`<!-- theme: 主题ID -->\`
\`<!-- color-mode: colorful | monochrome -->\`
- 主题 ID 只能从 \`ruby\`（珊瑚红）、\`amber\`（琥珀橙）、\`emerald\`（极光绿）、\`teal\`（深海青绿）、\`cyan\`（青蓝）、\`business\`（商务蓝）、\`tech\`（靛蓝）、\`purple\`（紫罗兰）、\`rose\`（玫瑰）、\`slate\`（石墨）中选择一个。
- \`colorful\` 使用该主题完整的多色协调方案；\`monochrome\` 只使用该主题的单色层级。除非用户明确要求克制、正式或单色，否则优先 \`colorful\`。
- 根据题材主动选择最合适的主题；未有明显偏好时使用 \`business\` 与 \`colorful\`。主题声明不是一页内容，不能重复写到后续页面。

【每页的固定语法】
1. 首行可选版式声明：\`<!-- layout: ... -->\`。
2. 如使用 grid 版式，第二行必须写 \`<!-- layout-variant: ... -->\`；一页只能有一个 layout 和一个 variant。
3. 封面必须为 \`# 主标题\`（请凝练为不超过15个字的核心精炼标题），正文页必须为 \`## 主标题\`；每页只能有一个主标题。
4. 可选副标题只能紧随主标题，且只能写一行 \`### 副标题\`。
5. 正文页的卡片只能二选一，绝对不要混用：
   - 列表卡片：\`- **卡片标题**：一句概述\`，其子要点只能缩进两空格写 \`  - 子要点\`。
   - 分栏卡片：\`### 卡片标题\`，接一行概述和最多 4 条 \`- 子要点\`。
6. 需要在一张大卡内再做分类时，允许使用第四级标题：\`### 父卡标题\` 后写 2~4 个 \`#### 子卡标题\`，每张子卡接一行说明和最多 2 条子要点。第四级标题只能嵌套在一个 \`###\` 卡片内，不能单独作为页副标题。
7. 引用只用于封面标签、quote 金句或明确的演讲备注；演讲备注必须写为 \`> 备注：...\`。不要把普通正文写成引用。
8. \`---\` 只能作为“整页结束 → 下一页开始”的分页符：它前面必须是本页最后一行内容，后面的第一个非空行必须是 \`<!-- layout: ... -->\`、\`# 标题\` 或 \`## 标题\`。绝对禁止在副标题后、卡片之间、表格前后或同一页内部写 \`---\`；不需要任何 Markdown 横线作为视觉分隔。

【版式选择：声明必须和实际卡片数一致】
- 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 张卡片分别用 \`grid2\` / \`grid3\` / \`grid4\` / \`grid5\` / \`grid6\` / \`grid7\` / \`grid8\` / \`grid9\`。
- 为避免整份 PPT 排版单调，请在 grid 页面紧随 layout 声明主动选择一个 \`<!-- layout-variant: ... -->\`；相邻两页不要重复同一版式组合。可选值及适用范围：\`horizontal\`（2~5 张等宽横排，适合极短并列项）、\`balanced\`（均衡矩阵：4 张 2×2、5~6 张 3×2、7~8 张 4×2、9 张 3×3）、\`two-column\`（2~9 张两栏纵向，适合说明较长或需要阅读顺序）、\`vertical\`（仅 2~3 张纵向递进）、\`masonry\`（仅 5 张，主卡+支撑卡的不规则组合）、\`focus\`（仅 5 张，左侧主卡+右侧支撑卡）。3~9 项并列内容一律允许且优先作为平等卡片呈现，选择 balanced/two-column/horizontal；只有原始内容明确有“核心—支撑”层级时，才使用 masonry/focus。不要对 6 张以上使用 horizontal，也不要对 4 张以上使用 vertical。
- 推荐的整份节奏：封面 → 2/3 卡片对比或支柱 → 4/5 卡片矩阵/主次结构 → 数据图表或表格 → 时间线 → 金句收束。按内容取舍，禁止为了套版强行增加页面。
- 仅当内容确实是按时间、步骤、阶段顺序推进且不超过 5 项时使用 \`timeline\`。
- 当需要“上方概览/类比带 + 下方主内容卡片”的分层展示时使用 \`spotlight\`：前 1~3 张卡片会进入顶部总览带，其余 1~3 张卡片以等高主卡呈现在下方。适用于技术架构拆解、概念科普和要点归纳。
- \`hub\` 用于“一个中心方法/原则 + 4~6 个并列维度”的辐射结构。副标题会成为中心节点；使用 4~6 张列表卡片写在中心节点周围。不可用于没有明确中心概念的普通分类。
- \`challenge-solution\` 用于 2~4 组“难点—解法”成对论证。每一组必须写为 \`### 主题标签\`，其下严格包含 \`#### 难点\` 与 \`#### 解决方案\` 两张子卡；每张子卡 1 句说明和最多 3 条要点。它适合复盘、问题治理、方案对照，不能用于普通卡片。
- \`dashboard\` 用于“关键指标 + 2 组趋势/结构数据”的经营总览。先写 2~4 张短指标卡，再写 \`<!-- chart: ... -->\` 和一个包含 2 条数值系列的 Markdown 表格；页面下方自动并排展示两张图表。仅在数据真实且两个系列均有业务意义时使用。
- \`chart-grid\` 用于“2~4 个指标按相同时间/分类维度进行并列比较”。先写 \`<!-- chart: column | line | area | bar -->\` 与一个表格：第一列为统一分类，后面恰好 2~4 列数值系列；每一列会成为一张小图。可在表格前写 1~4 条短结论卡，禁止用于只有一条数值系列的数据。
- 仅当内容是可量化的指标、数值或成果时使用 \`stats\`。
- 金句或单一核心结论使用 \`quote\`；Markdown 表格使用 \`table\`；封面使用 \`cover\`。
- 不确定时不要声明 layout，系统会按实际卡片数自动排版。

【图文混排与图表：仅在有真实数据时使用】
- 当一页既需要数据图表又需要文字结论时，使用 \`chart-left\`（图在左、结论在右）或 \`chart-right\`（结论在左、图在右）。图表与 1~2 张结论卡片会同页排版。
- 紧随 layout 声明依次写 \`<!-- chart: bar | column | line | area | mountain | pie -->\`，可选 \`<!-- chart-title: 图表标题 -->\`，然后写一张 Markdown 表格。第一列必须为分类/时间，后续列必须为纯数值系列；饼图只使用第一条数值系列。
- \`bar\` 是横向条形图，\`column\` 是竖向柱状图，\`line\` 是折线图，\`area\` 是面积图，\`mountain\` 是山形趋势图，\`pie\` 是饼图。数据不足 2 行、没有真实数值、或主题不以数据比较为中心时，禁止使用图表。

【容量与完整性：内容绝不能丢】
- 一张页只承载一个中心主题。若卡片超过 9 张、时间节点超过 5 个、表格超过 6 个数据行，或任一卡片超过 4 条子要点，必须新建续页，标题加“（续）”。
- 演示文稿可以信息密度高，但必须选择相称的版式：2~3 张卡片可含 1~2 句概述与最多 5 条子要点；4~6 张卡片可含 1 句概述与最多 4 条子要点；7~9 张卡片只保留短概述与最多 2 条子要点。单卡超过约 300 个中文字符、或一个要点本身超过两行时，才新建续页。每个子要点应为完整、简洁的陈述，不要用省略号截断。
- 表格每页最多 6 行数据；列数建议 3~6 列。跨页表格必须重复表头。
- 输出前自检：每个事实、列表项、表格行都必须出现一次；卡片数与 grid 数匹配；图表表格每一个数值都为纯数字；所有 \`**\`、反引号与 HTML 注释均已闭合。
- 禁止：声明 \`grid2\` 却写 3 个以上卡片；在正文页重复 \`#\` / \`##\`；把分页符写进表格或代码块；输出 HTML、Mermaid、图片链接或未闭合的 Markdown 标记。
【页数规则】根据主题深度自由决定页数；完整、清晰、可演示优先于页数少。`;
  }

  if (enableHtmlPPT) {
    combinedSystemPrompt += `\n\n【NEWPPT 顶级商业级原生 HTML 演示文稿生成协议：必须严格遵守】
你正在生成支持自由现代排版、兼具极致视觉美感与高信息密度的高品质 HTML 演示文稿（PPT）。
只输出一个 \`\`\`html-ppt 代码块，绝不要输出任何解释、前言、总结或代码块外的文本。

【一、 核心容器与封面标题基准】
1. 演示文稿由多页幻灯片组成。每一页必须使用独立的 <section class="slide ...">...</section> 标签包裹！
2. 封面标题规范：第一页（封面）正中央必须包含整份演示文稿的核心大标题（请凝练为不超过15个字的核心精炼标题，置于 <h1 class="...">...</h1> 中），副标题或演讲人置于紧随的 <p> 中。
3. 基础容器尺寸与比例：每张幻灯片标准尺寸为 16:9（宽 960px，高 540px），请为每个 <section> 赋予标准类：
   class="slide relative w-[960px] h-[540px] p-8 overflow-hidden flex flex-col justify-between select-none box-border ..."
4. 纯静态 HTML5 与 Tailwind CSS：所有排版、色彩、网格、毛玻璃、渐变、字体层次均使用现代 Tailwind CSS 实用类（无需任何外部 JS）。

【二、 丰富、高级、舒适的配色哲学（覆盖明亮、暗黑、商务、学术、科技）】
根据内容主题与行业属性，主动选用最具高级感与视觉舒适度的配色方案（拒绝生硬刺眼、拒绝通篇纯黑单调）：
1. 👑 经典卓越商务风 (Executive & Morgan Stanley Blue) [适用于商业计划、金融、经营汇报、战略咨询]
   - 暗黑商务：bg-gradient-to-br from-[#0B1528] via-[#0F1E36] to-[#080E1A] text-slate-100，卡片 bg-[#132238]/80 border border-[#1E3A5F]/60，点缀金/琥珀 text-amber-400, bg-amber-500/20
   - 明亮商务 (Swiss Clean)：bg-[#F8FAFC] text-slate-800，卡片 bg-white border border-slate-200 shadow-xs，点缀藏青 text-blue-900 与天蓝 text-blue-600, bg-blue-50
2. 🌿 现代极简素雅明亮风 (Modern Clean & Editorial Linen) [适用于消费品、人文教育、生活方式、产品发布]
   - 暖灰雅致：bg-[#FDFBF7] text-stone-800，卡片 bg-white/90 border border-stone-200/80 shadow-xs，点缀鼠尾绿 text-emerald-700 或赤陶色 text-orange-700
   - 极简白境：bg-white text-neutral-900，卡片 bg-neutral-50 border border-neutral-200，粗黑标题 + 细线分割 + 精致间距
3. ⚡ 深度科技与数据智能风 (Deep Cyber & Obsidian Tech) [适用于AI、云计算、前沿技术、架构演进]
   - 曜石极光：bg-gradient-to-br from-[#021A15] via-[#052E24] to-[#011410] text-slate-100，卡片 bg-[#083329]/70 border border-emerald-500/30，点缀荧光绿 text-emerald-400
   - 赛博深靛：bg-gradient-to-br from-[#090A1A] via-[#121332] to-[#070815] text-slate-100，卡片 bg-[#16183B]/70 border border-indigo-500/30，点缀青蓝 text-cyan-300
4. 🍵 东方美学与文化底蕴 (Heritage Ochre & Dark Amber) [适用于文旅、传统文化、中医药、茗茶、农业]
   - 赤岩金砂：bg-gradient-to-br from-[#120C08] via-[#21160E] to-[#0E0906] text-stone-100，卡片 bg-[#261A12]/70 border border-amber-500/20，点缀琥珀金 text-amber-400

【三、 突破千篇一律：多样化容器与高级视觉图元】
坚决摒弃“清一色圆角矩形无脑堆砌”！请根据信息结构灵活组合业界顶尖的视觉组件：
1. 📐 容器形态多样性：
   - 异形有机切角 (Asymmetric Organic)：rounded-tl-2xl rounded-br-2xl rounded-tr-sm rounded-bl-sm（极具现代设计感）
   - 极简硬朗直角线框 (Architectural Sharp)：rounded-none border-l-2 border-t border-slate-700/80 bg-slate-900/60
   - 胶囊药丸群 (Pills & Badges)：rounded-full px-3 py-1 text-xs border
   - 双层嵌套带顶栏卡片：上部为实色标题条（如 bg-indigo-950/80 px-4 py-1.5），下部为半透明详情主体
2. 📊 咨询与学术级结构图元（按需选用）：
   - 【漏斗转化模型 (Funnel)】：4 层宽度递减的阶梯梯形横条（100% -> 75% -> 50% -> 25%），右侧标明转化率与关键动作
   - 【2×2 战略决策象限 (2x2 Strategy Quadrant)】：两两垂直交叉轴线，明确 X 轴与 Y 轴维度，四个象限分别包含独立策略方块
   - 【闭环循环流转 (Closed Loop Cycle)】：3~5 个节点以环形/箭头衔接，包含正向流动与逆向数据反哺
   - 【金字塔分层模型 (Pyramid Layers)】：顶层战略愿景 -> 中层能力引擎 -> 底层基础设施支撑
   - 【多维水平对冲条 (Comparison Radar Bars)】：左右两组指标在同一标尺上通过彩色条对比（如：研发投入 vs 交付速度）
   - 【微型进度刻度与仪表 (Micro Progress Bars)】：进度条槽 bg-slate-800/80 h-1.5，内嵌渐变填充条与百分比指示
   - 【标签云与能力矩阵 (Tag Cloud & Feature Matrix)】：flex flex-wrap gap-1.5 平铺数十个技术特性或关键词徽章

【四、 极致提升信息密度（拒绝空洞大口号）】
每页幻灯片必须信息充实、论据扎实、逻辑严密，采用经典的“战略咨询五层信息结构”：
- 层级 1（顶栏）：分类 Badge + 英文副标 + 页面核心大标题（text-2xl font-bold）
- 层级 2（核心论点条/Banner）：一句话核心结论或战略主张（bg-white/5 border-l-4 p-2.5 text-xs text-slate-200）
- 层级 3（主体深度结构）：2~4 组深度论证列/象限/漏斗/矩阵，每组包含【小标题 + 核心量化指标（如 +340%、99.99%、1.84s）+ 详细落地措施（2~3 句深度说明，非单薄短语）+ 支撑标签】
- 层级 4（横向补充/技术图谱）：图表、进度条、对比表格或标签平铺矩阵
- 层级 5（底栏注脚）：💡 方法论出处 / 数据统计口径 / 适用范围 + 页码（第 N / M 页）

【五、 丰富版式参考示例】
\`\`\`html-ppt
<!-- ==================== 封面页：现代商务与战略愿景 ==================== -->
<section class="slide relative w-[960px] h-[540px] p-10 overflow-hidden flex flex-col justify-between bg-gradient-to-br from-[#0B1528] via-[#0F1E36] to-[#080E1A] text-slate-100 select-none">
  <div class="flex items-center justify-between border-b border-blue-900/40 pb-3">
    <div class="flex items-center gap-2">
      <span class="px-3 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">2026 战略规划</span>
      <span class="text-xs text-slate-400 font-mono tracking-widest">ENTERPRISE ARCHITECTURE</span>
    </div>
    <span class="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">绝密 / 核心管理层</span>
  </div>
  <div class="my-auto py-2">
    <h1 class="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-blue-200">企业级多智能体协同架构与落地实践</h1>
    <p class="mt-3 text-sm text-slate-300 max-w-2xl leading-relaxed">从认知大模型走向全自动任务编排：生产级 Agent 的技术攻坚、安全防护与商业化价值变现</p>
    <div class="flex items-center gap-4 mt-6">
      <div class="flex items-center gap-2 px-3 py-1 rounded bg-[#132238] border border-blue-500/20 text-xs">
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>已进入生产集群全面验证</span>
      </div>
      <div class="flex items-center gap-2 px-3 py-1 rounded bg-[#132238] border border-blue-500/20 text-xs text-slate-300">
        <span>全域吞吐提升 <strong>3.4x</strong></span>
      </div>
    </div>
  </div>
  <div class="flex items-center justify-between text-xs text-slate-400 border-t border-blue-900/40 pt-3">
    <span>战略研究与 AI 架构团队</span>
    <span>2026.Q3 · 全球技术峰会</span>
  </div>
</section>

<!-- ==================== 正文页：高密度 2×2 战略矩阵 + 数据对比 ==================== -->
<section class="slide relative w-[960px] h-[540px] p-7 overflow-hidden flex flex-col justify-between bg-gradient-to-br from-[#0B1528] via-[#0E1A2F] to-[#080E1A] text-slate-100 select-none">
  <!-- 顶栏导航 -->
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
    <div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-bold text-amber-400 tracking-wider uppercase">02 / 战略矩阵</span>
        <span class="text-[10px] text-slate-400 font-mono">FRAMEWORK & STRATEGY</span>
      </div>
      <h2 class="text-xl font-bold text-white mt-0.5">业务演进四象限与技术重塑路径</h2>
    </div>
    <span class="text-xs px-2.5 py-1 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800/50">战略决策模型</span>
  </div>

  <!-- 核心论点横幅 -->
  <div class="px-3 py-1.5 rounded-lg bg-blue-950/40 border-l-4 border-blue-500 text-xs text-slate-200 flex items-center justify-between">
    <span>📌 <strong>核心主张</strong>：将确定性规则下沉为自动化脚本，把模糊非结构化推理交由 Agent 协作网关，实现效率与容错的最优平衡。</span>
    <span class="text-[10px] text-emerald-400 font-semibold">综合 ROI +280%</span>
  </div>

  <!-- 2x2 四象限多维网格 -->
  <div class="grid grid-cols-2 gap-3 my-1">
    <!-- 象限 1: 异形圆角切角卡片 -->
    <div class="p-3.5 rounded-tl-xl rounded-br-xl rounded-tr-xs rounded-bl-xs bg-[#132238]/90 border border-blue-500/20 flex flex-col justify-between">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-bold text-blue-300">象限 I · 核心基座重构 (Foundations)</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">P0 优先级</span>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed mb-2">统一多模型网关与动态调度路由，建立毫秒级容灾重试与 Token 预算熔断机制。</p>
      <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-700/50">
        <span class="text-slate-400">平均耗时: <strong class="text-white">180ms</strong></span>
        <span class="text-emerald-400 font-medium">可用性 99.99%</span>
      </div>
    </div>

    <!-- 象限 2 -->
    <div class="p-3.5 rounded-tr-xl rounded-bl-xl rounded-tl-xs rounded-br-xs bg-[#132238]/90 border border-amber-500/20 flex flex-col justify-between">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-bold text-amber-300">象限 II · 流程自主决策 (Automation)</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">高收益</span>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed mb-2">基于 ReAct 与反思机制的复杂工具调用链，自动化完成跨系统数据整合与工单处理。</p>
      <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-700/50">
        <span class="text-slate-400">单日处理: <strong class="text-white">50万+ 件</strong></span>
        <span class="text-amber-400 font-medium">人力节省 65%</span>
      </div>
    </div>

    <!-- 象限 3 -->
    <div class="p-3.5 rounded-bl-xl rounded-tr-xl rounded-tl-xs rounded-br-xs bg-[#132238]/90 border border-emerald-500/20 flex flex-col justify-between">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-bold text-emerald-300">象限 III · 知识持续反哺 (Knowledge Loop)</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">飞轮效应</span>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed mb-2">构建向量与图混合检索（Hybrid Graph RAG），从每一次交互中沉淀领域黄金知识库。</p>
      <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-700/50">
        <span class="text-slate-400">检索准度: <strong class="text-white">96.4%</strong></span>
        <span class="text-emerald-400 font-medium">幻觉率 < 1.2%</span>
      </div>
    </div>

    <!-- 象限 4 -->
    <div class="p-3.5 rounded-br-xl rounded-tl-xl rounded-tr-xs rounded-bl-xs bg-[#132238]/90 border border-purple-500/20 flex flex-col justify-between">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-bold text-purple-300">象限 IV · 安全合规围栏 (Guardrails)</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">合规底线</span>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed mb-2">全链路敏感数据脱敏、Prompt 注入防御与可解释审计追踪，确保金融级安全。</p>
      <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-700/50">
        <span class="text-slate-400">拦截准确率: <strong class="text-white">99.8%</strong></span>
        <span class="text-purple-400 font-medium">符合 ISO27001</span>
      </div>
    </div>
  </div>

  <!-- 底部注脚与进度刻度 -->
  <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
    <span>💡 评估基准：基于 2026 麦肯锡企业级数字化转型评估模型及 12 家头部企业落地复盘</span>
    <span>第 2 / 6 页</span>
  </div>
</section>
\`\`\`
【页数规则】根据主题深度自由决定页数（通常 4~8 页）；每页内容必须丰富充实、论据扎实、严禁空泛套话。`;
  }

  if (searchContextText) {
    combinedSystemPrompt += searchContextText;
  }
  if (attachmentContextText) {
    combinedSystemPrompt += attachmentContextText;
  }

  payloadMessages.push({ role: 'system', content: combinedSystemPrompt });

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const isLastUserMessage = m.role === 'user' && i === messages.length - 1;

    if (isLastUserMessage) {
      let finalUserContent = m.content || '';
      if (attachmentContextText) {
        finalUserContent += attachmentContextText;
      }

      if (base64Images.length > 0) {
        const contentParts: any[] = [];
        if (finalUserContent) {
          contentParts.push({ type: 'text', text: finalUserContent });
        } else {
          contentParts.push({ type: 'text', text: '请查看并分析上传的图片。' });
        }
        for (const imgUrl of base64Images) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imgUrl,
            },
          });
        }
        payloadMessages.push({
          role: 'user',
          content: contentParts,
        });
      } else {
        payloadMessages.push({
          role: 'user',
          content: finalUserContent,
        });
      }
    } else {
      payloadMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  let finalContentProduced = false;
  let overallLastError = '';

  // Iterate over candidate channels in priority order (Failover loop)
  for (let candidateIdx = 0; candidateIdx < validCandidates.length; candidateIdx++) {
    const candidate = validCandidates[candidateIdx];
    const candidateStartTime = Date.now();
    const chatUrls = getChatUrlCandidates(candidate.channel_base_url);
    let upstreamRes: Response | null = null;
    let channelErrorText = '';

    for (const chatUrl of chatUrls) {
      try {
        upstreamRes = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${candidate.channel_api_key}`,
          },
          body: JSON.stringify({
            model: candidate.real_model_id || candidate.model_id,
            messages: payloadMessages,
            stream: true,
            temperature: 0.7,
          }),
        });

        if (upstreamRes.status === 404 && chatUrls.indexOf(chatUrl) < chatUrls.length - 1) {
          continue;
        }
        break;
      } catch (err: any) {
        channelErrorText = err.message;
        if (chatUrls.indexOf(chatUrl) < chatUrls.length - 1) {
          continue;
        }
      }
    }

    if (!upstreamRes || !upstreamRes.ok || !upstreamRes.body) {
      const rawErr = upstreamRes ? await upstreamRes.text().catch(() => '') : channelErrorText;
      let parsedErr = upstreamRes ? `上游返回 HTTP ${upstreamRes.status}` : `连接失败: ${channelErrorText}`;
      try {
        const errJson = JSON.parse(rawErr);
        parsedErr = errJson.error?.message || errJson.error || errJson.message || parsedErr;
      } catch {
        if (rawErr) parsedErr = `${parsedErr}: ${rawErr.slice(0, 150)}`;
      }

      overallLastError = `渠道【${candidate.channel_name} (优先级 ${candidate.channel_priority})】: ${parsedErr}`;

      recordAuditLog({
        user_id: user.id,
        username: user.username,
        model_id: modelId,
        channel_id: candidate.channel_id,
        duration_ms: Date.now() - candidateStartTime,
        status_code: upstreamRes ? upstreamRes.status : 502,
        error_message: overallLastError.slice(0, 200),
        ip: clientIp,
      });

      // If more candidate channels exist, failover to next channel!
      if (candidateIdx < validCandidates.length - 1) {
        const next = validCandidates[candidateIdx + 1];
        reply.raw.write(
          `data: ${JSON.stringify({
            status: `渠道【${candidate.channel_name}】响应异常，已自动无缝故障转移至下一个优先级渠道【${next.channel_name} (优先级 ${next.channel_priority})】...`,
            modelId,
          })}\n\n`
        );
        continue;
      } else {
        break;
      }
    }

    // Stream reader
    let fullAssistantContent = '';
    let fullReasoningContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let streamInBandError = '';

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        if (trimmed === 'data: [DONE]') continue;

        try {
          const json = JSON.parse(trimmed.replace(/^data:\s*/, ''));

          // Capture in-band error chunk (e.g. token expired, quota exceeded)
          if (json.error) {
            const errMsg = typeof json.error === 'string' ? json.error : json.error?.message || JSON.stringify(json.error);
            streamInBandError = errMsg;
            continue;
          }

          if (json.message && !json.choices) {
            streamInBandError = json.message;
            continue;
          }

          // Capture choices delta
          const delta = json.choices?.[0]?.delta;
          if (delta) {
            if (delta.reasoning_content || delta.reasoning) {
              const rChunk = delta.reasoning_content || delta.reasoning;
              fullReasoningContent += rChunk;
              reply.raw.write(`data: ${JSON.stringify({ reasoning: rChunk, modelId })}\n\n`);
            }
            if (delta.content) {
              fullAssistantContent += delta.content;
              reply.raw.write(`data: ${JSON.stringify({ delta: delta.content, modelId })}\n\n`);
            }
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens || 0;
            completionTokens = json.usage.completion_tokens || 0;
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    const latencyMs = Date.now() - candidateStartTime;

    // Check if this channel stream produced zero content and encountered an error
    if (!fullAssistantContent && !fullReasoningContent && streamInBandError) {
      overallLastError = `渠道【${candidate.channel_name}】: ${streamInBandError}`;
      recordAuditLog({
        user_id: user.id,
        username: user.username,
        model_id: modelId,
        channel_id: candidate.channel_id,
        duration_ms: latencyMs,
        status_code: 500,
        error_message: overallLastError.slice(0, 200),
        ip: clientIp,
      });

      // If next candidate channel exists, failover!
      if (candidateIdx < validCandidates.length - 1) {
        const next = validCandidates[candidateIdx + 1];
        reply.raw.write(
          `data: ${JSON.stringify({
            status: `渠道【${candidate.channel_name}】凭证/服务异常，正在无缝切换至渠道【${next.channel_name}】重试...`,
            modelId,
          })}\n\n`
        );
        continue;
      }
    }

    // If we produced content or finished successfully
    if (fullAssistantContent || fullReasoningContent) {
      finalContentProduced = true;

      // Follow-up suggestions generation
      let followUpSuggestions: string[] = [];
      const globalFollowupStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'enable_global_followup'");
      const globalFollowupVal = (globalFollowupStmt.get() as { value: string } | undefined)?.value;
      const isGlobalFollowupEnabled = globalFollowupVal === '1' || globalFollowupVal === undefined;

      const globalFollowupModelStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'global_followup_model_id'");
      const globalFollowupModelVal = (globalFollowupModelStmt.get() as { value: string } | undefined)?.value || '';

      const shouldGenerateFollowup = (candidate.enable_followup === 1 || isGlobalFollowupEnabled) && Boolean(fullAssistantContent);

      if (shouldGenerateFollowup) {
        const dedicatedModelId = candidate.followup_model_id || globalFollowupModelVal || candidate.model_id;
        followUpSuggestions = await generateFollowUpSuggestions(
          userLastMsg,
          fullAssistantContent,
          dedicatedModelId
        );
        if (followUpSuggestions.length > 0) {
          reply.raw.write(`data: ${JSON.stringify({ followup: followUpSuggestions, modelId })}\n\n`);
        }
      }

      reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);

      // Save Assistant Message to DB
      saveMessage({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        model_id: modelId,
        content: fullAssistantContent,
        reasoning_content: fullReasoningContent,
        search_results_json: JSON.stringify(searchResults),
        followup_suggestions_json: JSON.stringify(followUpSuggestions),
        image_params_json: JSON.stringify({ presentation: Boolean(enablePPT || enableHtmlPPT), htmlPresentation: Boolean(enableHtmlPPT) }),
        token_count: promptTokens + completionTokens,
      });

      recordAuditLog({
        user_id: user.id,
        username: user.username,
        model_id: modelId,
        channel_id: candidate.channel_id,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms: latencyMs,
        status_code: 200,
        ip: clientIp,
      });

      return;
    }
  }

  // If all candidate channels exhausted without producing content
  if (!finalContentProduced) {
    const finalErr = overallLastError || '所有配置的渠道均未返回有效回复';
    reply.raw.write(`data: ${JSON.stringify({ error: finalErr, modelId })}\n\n`);
    reply.raw.write(`data: ${JSON.stringify({ done: true, modelId })}\n\n`);

    saveMessage({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'assistant',
      model_id: modelId,
      content: `> ⚠️ **所有渠道调用失败**: ${finalErr}`,
    });
  }
}
