import { db } from '../db/sqlite.js';
import { FastifyReply } from 'fastify';
import {
  generateSearchQueriesWithLLM,
  executeMultiQueryWebSearch,
  formatSearchResultsForPrompt,
  SearchResultItem,
} from './search.service.js';
import { generateFollowUpSuggestions } from './followup.service.js';
import { recordAuditLog } from './audit.service.js';
import { ENV } from '../config/env.js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

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
  imageParams,
  reply,
  clientIp,
}: {
  user: { id: string; username: string };
  conversationId: string;
  modelId: string;
  messages: Array<{ role: string; content: string; reasoning_content?: string }>;
  attachments?: Array<{ name: string; text?: string; url?: string; type: string }>;
  enableSearch?: boolean;
  enablePPT?: boolean;
  imageParams?: { size?: string; quality?: string; style?: string; aspect_ratio?: string };
  reply: FastifyReply;
  clientIp: string;
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

          const imgJson = (await response.json()) as any;
          const rawUrl = imgJson.data?.[0]?.url;
          const b64Json = imgJson.data?.[0]?.b64_json;
          const revisedPrompt = imgJson.data?.[0]?.revised_prompt || prompt;

          let finalImageUrl = '';

          if (b64Json) {
            const buffer = Buffer.from(b64Json, 'base64');
            const filename = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
            const filePath = path.join(ENV.UPLOADS_DIR, filename);
            fs.writeFileSync(filePath, buffer);
            finalImageUrl = `/uploads/${filename}`;

            // Record in uploads
            const uploadId = `up_${crypto.randomBytes(6).toString('hex')}`;
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO uploads (id, user_id, file_name, file_path, file_size, mime_type, is_generated_image, extracted_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            `).run(uploadId, user.id, filename, filename, buffer.length, 'image/png', revisedPrompt, now);
          } else if (rawUrl) {
            let fullRemoteUrl = rawUrl;
            if (rawUrl.startsWith('/')) {
              try {
                const origin = new URL(candidate.channel_base_url).origin;
                fullRemoteUrl = `${origin}${rawUrl}`;
              } catch {
                fullRemoteUrl = rawUrl;
              }
            }

            try {
              const dlRes = await fetch(fullRemoteUrl, {
                headers: { Authorization: `Bearer ${candidate.channel_api_key}` },
                signal: AbortSignal.timeout(10000),
              });
              if (dlRes.ok) {
                const ab = await dlRes.arrayBuffer();
                const buffer = Buffer.from(ab);
                const ext = path.extname(rawUrl) || '.png';
                const filename = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                const filePath = path.join(ENV.UPLOADS_DIR, filename);
                fs.writeFileSync(filePath, buffer);
                finalImageUrl = `/uploads/${filename}`;

                const uploadId = `up_${crypto.randomBytes(6).toString('hex')}`;
                const now = new Date().toISOString();
                db.prepare(`
                  INSERT INTO uploads (id, user_id, file_name, file_path, file_size, mime_type, is_generated_image, extracted_text, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                `).run(uploadId, user.id, filename, filename, buffer.length, 'image/png', revisedPrompt, now);
              } else {
                finalImageUrl = fullRemoteUrl;
              }
            } catch {
              finalImageUrl = fullRemoteUrl;
            }
          }

          const markdownOutput = `![${revisedPrompt}](${finalImageUrl})\n\n*生成提示词*: ${revisedPrompt}`;

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
  let searchResults: SearchResultItem[] = [];
  let searchContextText = '';

  // Only trigger web search when user explicitly turns on the search button in the chat input
  if (enableSearch) {
    reply.raw.write(`data: ${JSON.stringify({ status: '正在生成搜索关键词并检索...', modelId })}\n\n`);
    const searchQueries = await generateSearchQueriesWithLLM(userLastMsg, modelId);
    searchResults = await executeMultiQueryWebSearch(searchQueries, 3);
    if (searchResults.length > 0) {
      searchContextText = formatSearchResultsForPrompt(searchResults);
      reply.raw.write(`data: ${JSON.stringify({ searchResults, modelId })}\n\n`);
    }
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

  // Add presentation slide output instruction if PPT mode is enabled or user explicitly asks for PPT
  const isPPTRequested = enablePPT || /(?:ppt|pptx|演示文稿|幻灯片|slides?)/i.test(userLastMsg);
  if (isPPTRequested) {
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
2. 封面必须为 \`# 主标题\`，正文页必须为 \`## 主标题\`；每页只能有一个主标题。
3. 可选副标题只能紧随主标题，且只能写一行 \`### 副标题\`。
4. 正文页的卡片只能二选一，绝对不要混用：
   - 列表卡片：\`- **卡片标题**：一句概述\`，其子要点只能缩进两空格写 \`  - 子要点\`。
   - 分栏卡片：\`### 卡片标题\`，接一行概述和最多 4 条 \`- 子要点\`。
5. 引用只用于封面标签、quote 金句或明确的演讲备注；演讲备注必须写为 \`> 备注：...\`。不要把普通正文写成引用。

【版式选择：声明必须和实际卡片数一致】
- 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 张卡片分别用 \`grid2\` / \`grid3\` / \`grid4\` / \`grid5\` / \`grid6\` / \`grid7\` / \`grid8\` / \`grid9\`。
- 为避免整份 PPT 排版单调，请在 grid 页面紧随 layout 声明主动选择一个 \`<!-- layout-variant: ... -->\`（同一份中交替使用，不能只用一种）。可选值及适用范围：\`horizontal\`（2~5 张等宽横排，适合短句对比）、\`balanced\`（均衡矩阵：4 张 2×2、5~6 张 3×2、7~8 张 4×2、9 张 3×3）、\`two-column\`（2~9 张两栏纵向，适合描述较长）、\`vertical\`（仅 2~3 张纵向递进）、\`masonry\`（仅 5 张主卡+支撑卡的不规则组合）、\`focus\`（仅 5 张左侧主卡+右侧支撑卡）。选择必须匹配内容：短并列要点用 horizontal/balanced，较长说明用 two-column，主次明显时用 masonry/focus。不要对 6 张以上使用 horizontal，也不要对 4 张以上使用 vertical。
- 仅当内容确实是按时间、步骤、阶段顺序推进且不超过 5 项时使用 \`timeline\`。
- 当需要“上方概览/类比带 + 下方主内容卡片”的分层展示时使用 \`spotlight\`：前 1~3 张卡片会进入顶部总览带，其余 1~3 张卡片以等高主卡呈现在下方。适用于技术架构拆解、概念科普和要点归纳。
- 仅当内容是可量化的指标、数值或成果时使用 \`stats\`。
- 金句或单一核心结论使用 \`quote\`；Markdown 表格使用 \`table\`；封面使用 \`cover\`。
- 不确定时不要声明 layout，系统会按实际卡片数自动排版。

【图文混排与图表：仅在有真实数据时使用】
- 当一页既需要数据图表又需要文字结论时，使用 \`chart-left\`（图在左、结论在右）或 \`chart-right\`（结论在左、图在右）。图表与 1~2 张结论卡片会同页排版。
- 紧随 layout 声明依次写 \`<!-- chart: bar | column | line | area | mountain | pie -->\`，可选 \`<!-- chart-title: 图表标题 -->\`，然后写一张 Markdown 表格。第一列必须为分类/时间，后续列必须为纯数值系列；饼图只使用第一条数值系列。
- \`bar\` 是横向条形图，\`column\` 是竖向柱状图，\`line\` 是折线图，\`area\` 是面积图，\`mountain\` 是山形趋势图，\`pie\` 是饼图。数据不足 2 行、没有真实数值、或主题不以数据比较为中心时，禁止使用图表。
- 图表页示例：
\`\`\`ppt
<!-- layout: chart-right -->
<!-- chart: line -->
<!-- chart-title: 月度活跃用户趋势 -->
## 用户增长与运营动作
### 数据验证策略成效
- **增长来源**：新手引导优化带来持续提升
- **下一步重点**：聚焦高价值用户留存
| 月份 | 新增用户 | 活跃用户 |
| --- | ---: | ---: |
| 1 月 | 42 | 30 |
| 2 月 | 58 | 43 |
| 3 月 | 76 | 61 |
\`\`\`

【叙事与视觉层次】
- 时间、步骤、因果链必须按先后顺序写成 timeline；并列的分类、模块、策略才使用 grid。
- 对比内容必须恰好两张卡，分别写清两侧名称与差异；不要伪装成时间线。
- 体系、框架、挑战、方案等主次结构，先写最重要的卡片，再写支撑卡片，系统会自动使用主次分明的组合版式。
- 每页如有一句必须被记住的结论，使用独立 \`> 核心结论\`；不要把结论塞进某个卡片的最后一条。普通卡片需要对称、平铺时，避免使用时间顺序词。
- 3 项内容可采用纵向递进或三栏支柱；5 项内容可采用主卡 + 支撑卡的不规则组合；6~8 项内容优先两栏纵向阅读；9 项内容根据文字密度采用九宫格或两栏长清单。不要为了“卡片数量”强行横向排列。

【容量与完整性：内容绝不能丢】
- 一张页只承载一个中心主题。若卡片超过 9 张、时间节点超过 5 个、表格超过 6 个数据行，或任一卡片超过 4 条子要点，必须新建续页，标题加“（续）”。
- 不要为了少页数把段落塞进同一页；宁可增加页面。每个子要点应为一条完整、简洁的陈述，不要用省略号截断。
- 表格每页最多 6 行数据；列数建议 3~6 列。跨页表格必须重复表头。
- 禁止：声明 \`grid2\` 却写 3 个以上卡片；在正文页重复 \`#\` / \`##\`；把分页符写进表格或代码块；输出 HTML、Mermaid、图片链接或未闭合的 Markdown 标记。

【最小正确示例】
\`\`\`ppt
<!-- layout: grid3 -->
## 三大实施支柱
### 从策略、能力到执行形成闭环
### 策略对齐
- 明确目标与边界
- 统一关键指标
### 能力建设
- 补齐产品与数据能力
- 建立复盘机制
### 执行落地
- 分阶段推进
- 定期评估优化

---
<!-- layout: table -->
## 阶段任务对照
| 阶段 | 重点任务 | 交付物 |
| --- | --- | --- |
| 筹备 | 明确方案 | 项目计划 |
| 推进 | 执行验证 | 阶段复盘 |
\`\`\`
【页数规则】根据主题深度自由决定页数；完整、清晰、可演示优先于页数少。`;
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
      if (searchContextText) {
        finalUserContent += searchContextText;
      }
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
