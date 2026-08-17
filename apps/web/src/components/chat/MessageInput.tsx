import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { chatApi } from '../../api/client.js';
import {
  Paperclip,
  Globe,
  ArrowUp,
  Square,
  Mic,
  MicOff,
  X,
  FileText,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';

interface MessageInputProps {
  onSend: (text: string) => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSend }) => {
  const {
    isStreaming,
    stopStreaming,
    attachments,
    addAttachment,
    removeAttachment,
    selectedModelIds,
    models,
    imageParams,
    setImageParams,
    enableSearch,
    setEnableSearch,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current selected model has image generation capability
  const isImageModelActive = selectedModelIds.some((mId) => {
    const m = models.find((item) => item.model_id === mId);
    return m?.capabilities_json.includes('image');
  });

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    onSend(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Upload attachment
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      alert('文件大小不能超过 20MB');
      return;
    }

    setIsUploading(true);
    try {
      const res = await chatApi.uploadFile(file);
      addAttachment({
        id: res.id,
        name: res.fileName,
        url: res.url,
        text: res.extractedText,
        size: res.fileSize,
        type: res.mimeType,
        isImage: res.isImage,
      });
    } catch (err: any) {
      alert(`上传失败: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Web Speech Recognition
  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的浏览器暂不支持语音识别输入，建议使用 Chrome/Edge 浏览器');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div className="w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 pb-4 sm:pb-6">
      {/* 1. Floating Image Aspect Ratio Bar (when image model active) */}
      {isImageModelActive && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800 rounded-xl text-xs text-purple-900 dark:text-purple-200 w-fit shadow-2xs">
          <ImageIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span className="font-medium">画面比例:</span>
          {(['1:1', '16:9', '9:16'] as const).map((ratio) => (
            <button
              key={ratio}
              onClick={() => setImageParams({ aspect_ratio: ratio })}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                imageParams.aspect_ratio === ratio
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-purple-800 dark:text-purple-300'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      )}

      {/* 2. Floating Uploaded Attachment Pills above input bar */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 shadow-xs group"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate max-w-[180px]">{att.name}</span>
                {att.size && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {(att.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                )}
              </div>
              <button
                onClick={() => removeAttachment(idx)}
                className="p-0.5 text-slate-400 hover:text-red-500 rounded-full transition-colors ml-1"
                title="移除附件"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 3. Single Unified Rounded Input Bar */}
      <div className="relative flex items-end gap-1.5 sm:gap-2 bg-[#f4f4f5] dark:bg-slate-800/90 hover:bg-[#efeff1] dark:hover:bg-slate-800 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:ring-2 focus-within:ring-slate-300 dark:focus-within:ring-slate-600 border border-slate-200 dark:border-slate-700 rounded-3xl p-1.5 sm:p-2 transition-all shadow-sm">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,image/*"
        />

        {/* Paperclip Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-full transition-all shrink-0 mb-0.5 active:scale-95"
          title="上传文件或图片 (限20MB内)"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>

        {/* Web Search Icon Button beside attachment button (No text, icon only) */}
        <button
          onClick={() => setEnableSearch(!enableSearch)}
          className={`p-2 rounded-full transition-all shrink-0 mb-0.5 active:scale-95 ${
            enableSearch
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-300 dark:ring-emerald-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700'
          }`}
          title={enableSearch ? '联网搜索已开启（点击关闭）' : '点击开启联网搜索'}
        >
          <Globe className={`w-4 h-4 ${enableSearch ? 'text-emerald-600 dark:text-emerald-400 animate-pulse' : ''}`} />
        </button>

        {/* Auto-resizing Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，Shift + Enter 换行..."
          className="w-full bg-transparent border-0 focus:ring-0 resize-none max-h-48 py-2 text-[14px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden leading-relaxed"
        />

        {/* Right side buttons: Mic & Send / Stop */}
        <div className="flex items-center gap-1 shrink-0 mb-0.5">
          {/* Voice Input Button */}
          <button
            onClick={toggleVoiceInput}
            className={`p-2 rounded-full transition-all active:scale-95 ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
            title={isListening ? '正在收音，点击停止' : '语音输入'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send or Stop Button */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-full transition-all active:scale-95 shadow-xs"
              title="停止生成"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() && attachments.length === 0}
              className={`p-2 rounded-full transition-all active:scale-95 shadow-xs ${
                input.trim() || attachments.length > 0
                  ? 'bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 cursor-pointer'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
              }`}
              title="发送消息 (Enter)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-2 text-[11px] text-slate-400 dark:text-slate-500 select-none">
        QuickGPT 可能会产生错误，请核对重要信息。
      </div>
    </div>
  );
};
