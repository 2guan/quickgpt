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
    combinedSystemPrompt += `\n\n【PPT/演示文稿专业排版规范】
你当前处于专业 PPT 演示文稿生成模式。请务必严格使用 \`\`\`ppt 代码块输出结构化幻灯片内容，不要输出其他闲聊。
每页幻灯片之间使用独立的 \`---\`（三个短横线）进行分页。

【支持的丰富幻灯片版式与点数定制】：
系统内置了根据要点数量与内容类型的多种现代 PPT 视觉版式（可在每页开头通过 HTML 注释显式指定，或由系统自动适配）：
1. 封面页：<!-- layout: cover -->（包含主标题 #、副标题 ###，可嵌入说明表格）
2. 双栏对比/核心双翼（2个要点）：<!-- layout: grid2 -->（左右对比卡片，右侧主题色高亮）
3. 三栏支柱/三大维度（3个要点）：<!-- layout: grid3 -->（3栏并列竖向卡片，带顶部色标）
4. 四象限矩阵/四大模块（4个要点）：<!-- layout: grid4 -->（2x2 四宫格卡片矩阵，带字母序号徽章）
5. 五阶段/六矩阵（5~6个要点）：<!-- layout: grid5 --> 或 <!-- layout: grid6 -->（自适应矩阵卡片）
6. 时序演进/发展路线：<!-- layout: timeline -->（带连接线与数字节点圆环的里程碑时序）
7. 核心数据/关键指标：<!-- layout: stats -->（带 KPI 药丸徽章与数据强调横条的指标卡）
8. 金句/核心理念：<!-- layout: quote -->（放大居中引用卡片）
9. 数据表格/多维对比：<!-- layout: table -->（使用标准的 Markdown 表格格式输出）

【严谨的 Markdown 层次结构规范（务必遵守）】：
1. 每页主标题必须且仅能使用一行 \`## 页面主标题\`
2. 每页副标题可选使用一行 \`### 页面副标题/核心论点阐述\`（紧随在主标题正下方）
3. 各要点卡片排版推荐两种清晰规范之一：
   - 规范 A（列表卡片推荐）：使用 \`- **卡片标题**：卡片正文说明\`，子要点在下方缩进使用 \`  - 子要点\`
   - 规范 B（分栏大卡片）：使用 \`### 🔷 卡片名称\`，下方跟随描述段落及子列表
4. 页面底部的总结/亮点建议使用独立的引用块 \`> 💡 **核心提示/演讲备注**：...\`

标准格式示例：
\`\`\`ppt
<!-- layout: cover -->
# 银行测试人的 Vibe Coding 实践
### 从测试痛点、结构化需求表达、多 AI 协同到企业级平台交付
> 🏷️ 金融测试效能转型 · 个人实践经验分享

---
<!-- layout: grid2 -->
## 实战案例解构：PAMS 与 RADAR 平台
### 两大自主研发平台的核心架构亮点与业务痛点解法

### 🔷 PAMS 问题分析管理系统
**解决痛点**：测试与生产问题流转不畅、分析记录缺失、知识难沉淀
- ✅ **全生命周期缺陷追踪**：覆盖待分配→分析中→处理中→待验证→已关闭全流程
- ✅ **测试案例在线执行**：失败用例自动关联核心 IT 问题，形成网状追踪
- ✅ **追加式审计日志**：分析记录不给覆盖权限，按时间线追加，确保痕迹真实
- ✅ **动态字典控制**：下拉选项由后台字典控制，修改即时全局生效

### 🟢 RADAR 日常需求研发交付平台
**解决痛点**：跨机构协同交付信息分散、投产材料难归档、评审意见难回溯
- ✅ **投产窗口统一坐标**：以"投产点/投产版本"为核心，串联需求、工单与变更
- ✅ **多阶段测试验证**：集成 SIT、UAT、NFT 与 SEC 测试验证
- ✅ **评审会签与电子签名**：在线会签评审，支持一键导出 Word 评审单
- ✅ **外部问题快照引用**：无缝同步并引用 PAMS 问题快照，建立投产关联

---
<!-- layout: timeline -->
## 战略发展三阶段演进路线
### 稳步推进技术沉淀与商业落地
- **第一阶段（启动期）**: 核心算法引擎研发与原型验证
- **第二阶段（扩展期）**: 多行业场景赋能与伙伴生态共建
- **第三阶段（成熟期）**: 全球化布局与智能化平台升级
> 💡 **核心结语**：测试人员的业务敏锐度与合规质控意识是把控质量的核心钥匙！
\`\`\`
【幻灯片页数规则】：
不要被人为限制固定页数。请完全根据用户输入的主题深度、内容体量或用户的具体指令，自由决定最合适、最详实完整的幻灯片总页数。`;
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
