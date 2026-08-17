import { create } from 'zustand';
import { Model, Conversation, Message, MessageAttachment } from '../types/index.js';
import { chatApi } from '../api/client.js';

interface ImageParams {
  size: string;
  quality: string;
  style: string;
  aspect_ratio: '1:1' | '16:9' | '9:16';
}

interface ChatState {
  models: Model[];
  selectedModelIds: string[];
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isLoadingModels: boolean;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  
  // Attachments and Search
  attachments: MessageAttachment[];
  enableSearch: boolean;
  imageParams: ImageParams;

  // Actions
  fetchModels: () => Promise<void>;
  toggleModelSelection: (modelId: string) => void;
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createNewConversation: () => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  togglePinConversation: (id: string) => Promise<void>;
  
  addAttachment: (attachment: MessageAttachment) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  setEnableSearch: (enabled: boolean) => void;
  setImageParams: (params: Partial<ImageParams>) => void;
  
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
}

let activeAbortController: AbortController | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  models: [],
  selectedModelIds: [],
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoadingModels: false,
  isLoadingConversations: false,
  isLoadingMessages: false,
  isStreaming: false,

  attachments: [],
  enableSearch: false,
  imageParams: {
    size: '1024x1024',
    quality: 'standard',
    style: 'vivid',
    aspect_ratio: '1:1',
  },

  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      const res = await chatApi.getPublicModels();
      const models = res.models || [];
      set({ models, isLoadingModels: false });

      // Default select the first visible active model if none selected
      if (get().selectedModelIds.length === 0 && models.length > 0) {
        set({ selectedModelIds: [models[0].model_id] });
      }
    } catch {
      set({ isLoadingModels: false });
    }
  },

  toggleModelSelection: (modelId: string) => {
    const allModels = get().models;
    const targetModel = allModels.find((m) => m.model_id === modelId);
    const isTargetImage = targetModel?.capabilities_json.includes('image');

    const currentSelectedIds = get().selectedModelIds;
    const currentSelectedModels = allModels.filter((m) => currentSelectedIds.includes(m.model_id));
    const currentHasImage = currentSelectedModels.some((m) => m.capabilities_json.includes('image'));
    const currentHasText = currentSelectedModels.some((m) => !m.capabilities_json.includes('image'));

    // 1. If clicking an already selected model -> Deselect if more than 1
    if (currentSelectedIds.includes(modelId)) {
      if (currentSelectedIds.length > 1) {
        set({ selectedModelIds: currentSelectedIds.filter((id) => id !== modelId) });
      }
      return;
    }

    // 2. If selecting across categories (Text vs Image):
    // Switch completely to the new category
    if (isTargetImage && currentHasText) {
      set({ selectedModelIds: [modelId] });
      return;
    }
    if (!isTargetImage && currentHasImage) {
      set({ selectedModelIds: [modelId] });
      return;
    }

    // 3. Same category multi-selection (up to 4)
    if (currentSelectedIds.length < 4) {
      set({ selectedModelIds: [...currentSelectedIds, modelId] });
    } else {
      alert(
        isTargetImage
          ? '最多支持同时选择 4 个生图模型进行并发对比生图'
          : '最多支持同时选择 4 个文本模型进行并发对比回答'
      );
    }
  },

  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const res = await chatApi.getConversations();
      set({ conversations: res.conversations || [], isLoadingConversations: false });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (id: string) => {
    set({ currentConversationId: id, isLoadingMessages: true });
    try {
      const res = await chatApi.getMessages(id);
      set({ messages: res.messages || [], isLoadingMessages: false });
    } catch {
      set({ messages: [], isLoadingMessages: false });
    }
  },

  createNewConversation: async () => {
    const models = get().selectedModelIds;
    const res = await chatApi.createConversation({ title: '新对话', modelIds: models });
    const conv = res.conversation;
    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConversationId: conv.id,
      messages: [],
      attachments: [],
    }));
    return conv;
  },

  deleteConversation: async (id: string) => {
    await chatApi.deleteConversation(id);
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== id);
      const nextId = state.currentConversationId === id ? (remaining[0]?.id || null) : state.currentConversationId;
      return {
        conversations: remaining,
        currentConversationId: nextId,
        messages: nextId ? state.messages : [],
      };
    });
    if (get().currentConversationId) {
      get().selectConversation(get().currentConversationId!);
    }
  },

  updateConversationTitle: async (id: string, title: string) => {
    await chatApi.updateConversation(id, { title });
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  togglePinConversation: async (id: string) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const nextPin = conv.is_pinned ? 0 : 1;
    await chatApi.updateConversation(id, { is_pinned: nextPin });
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, is_pinned: nextPin } : c)),
    }));
  },

  addAttachment: (att: MessageAttachment) => {
    set((state) => ({ attachments: [...state.attachments, att] }));
  },

  removeAttachment: (index: number) => {
    set((state) => ({
      attachments: state.attachments.filter((_, i) => i !== index),
    }));
  },

  setEnableSearch: (enabled: boolean) => set({ enableSearch: enabled }),

  setImageParams: (params: Partial<ImageParams>) =>
    set((state) => ({ imageParams: { ...state.imageParams, ...params } })),

  clearAttachments: () => set({ attachments: [] }),

  stopStreaming: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set({ isStreaming: false });
  },

  sendMessage: async (content: string) => {
    if (!content.trim() && get().attachments.length === 0) return;

    let convId = get().currentConversationId;
    if (!convId) {
      try {
        const newConv = await get().createNewConversation();
        convId = newConv.id;
      } catch {
        convId = `conv_${Date.now()}`;
      }
    }

    const currentAttachments = [...get().attachments];
    const selectedModels = get().selectedModelIds;
    const enableSearch = get().enableSearch;
    const imageParams = get().imageParams;

    // 1. Optimistic User Message
    const userMsg: Message = {
      id: `temp_user_${Date.now()}`,
      conversation_id: convId,
      role: 'user',
      content: content.trim(),
      attachments_json: JSON.stringify(currentAttachments),
      created_at: new Date().toISOString(),
    };

    // 2. Optimistic Assistant Placeholder Messages for each model
    const placeholderAssistantMsgs: Message[] = selectedModels.map((mId, idx) => ({
      id: `temp_ast_${Date.now()}_${idx}`,
      conversation_id: convId!,
      role: 'assistant',
      model_id: mId,
      content: '',
      reasoning_content: '',
      search_results_json: '[]',
      followup_suggestions_json: '[]',
      created_at: new Date().toISOString(),
      isStreaming: true,
    }));

    const existingMsgs = get().messages;
    const historyPayload = [...existingMsgs, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
      reasoning_content: m.reasoning_content,
    }));

    set({
      messages: [...existingMsgs, userMsg, ...placeholderAssistantMsgs],
      isStreaming: true,
      attachments: [],
    });

    // 3. Initiate SSE Streaming Request
    activeAbortController = new AbortController();
    const token = localStorage.getItem('token');
    let streamSucceeded = false;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversationId: convId,
          modelIds: selectedModels,
          content: content.trim(),
          messages: historyPayload,
          attachments: currentAttachments,
          enableSearch,
          imageParams,
        }),
        signal: activeAbortController.signal,
      });

      if (!response.ok) {
        let errText = `请求失败 (HTTP ${response.status})`;
        try {
          const json = await response.json();
          errText = json.error || json.message || errText;
        } catch {
          // ignore
        }
        throw new Error(errText);
      }

      if (!response.body) throw new Error('流式传输通道未就绪');

      const reader = response.body.getReader();
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

          try {
            const data = JSON.parse(trimmed.replace(/^data:\s*/, ''));

            if (data.conversationId && data.conversationId !== convId) {
              convId = data.conversationId;
              set({ currentConversationId: data.conversationId });
            }

            if (data.allDone) {
              streamSucceeded = true;
              set({ isStreaming: false });
              break;
            }

            if (data.error && !data.modelId) {
              // Global error
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.isStreaming
                    ? { ...m, content: m.content ? `${m.content}\n\n> ⚠️ **错误**: ${data.error}` : `> ⚠️ **错误**: ${data.error}`, isStreaming: false }
                    : m
                ),
              }));
            }

            if (data.modelId) {
              streamSucceeded = true;
              set((state) => {
                const updatedMsgs = state.messages.map((m) => {
                  if (m.role === 'assistant' && m.model_id === data.modelId) {
                    let nextContent = m.content;
                    let nextReasoning = m.reasoning_content || '';
                    let nextSearch = m.search_results_json || '[]';
                    let nextFollowup = m.followup_suggestions_json || '[]';

                    if (data.delta) nextContent += data.delta;
                    if (data.reasoning) nextReasoning += data.reasoning;
                    if (data.searchResults) nextSearch = JSON.stringify(data.searchResults);
                    if (data.followup) nextFollowup = JSON.stringify(data.followup);
                    if (data.error) nextContent = nextContent ? `${nextContent}\n\n> ⚠️ **错误**: ${data.error}` : `> ⚠️ **错误**: ${data.error}`;

                    return {
                      ...m,
                      content: nextContent,
                      reasoning_content: nextReasoning,
                      search_results_json: nextSearch,
                      followup_suggestions_json: nextFollowup,
                      isStreaming: !data.done,
                    };
                  }
                  return m;
                });
                return { messages: updatedMsgs };
              });
            }
          } catch {
            // ignore JSON parse
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.isStreaming
              ? { ...m, content: m.content ? `${m.content}\n\n> ❌ **流式异常**: ${err.message}` : `> ❌ **调用异常**: ${err.message}`, isStreaming: false }
              : m
          ),
        }));
      }
    } finally {
      set({ isStreaming: false });
      activeAbortController = null;
      if (streamSucceeded) {
        get().fetchConversations();
      }
    }
  },
}));
