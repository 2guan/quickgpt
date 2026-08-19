import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
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
  Presentation,
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
    enablePPT,
    setEnablePPT,
  } = useChatStore();

  const { settings } = useSettingsStore();

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

  const hasContent = input.trim().length > 0 || attachments.length > 0;

  return (
    <div className="w-full max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 pb-4 sm:pb-6">
      {/* 1. Floating Image Aspect Ratio Bar (when image model active) */}
      {isImageModelActive && (
        <div className="mb-2.5 flex items-center gap-2 px-3.5 py-1.5 bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/60 rounded-xl text-xs text-purple-900 dark:text-purple-200 w-fit shadow-2xs animate-in fade-in slide-in-from-bottom-1">
          <ImageIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="font-medium">画面比例:</span>
          {(['1:1', '16:9', '9:16'] as const).map((ratio) => (
            <button
              key={ratio}
              onClick={() => setImageParams({ aspect_ratio: ratio })}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all ${
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
        <div className="mb-2.5 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1e1e24] border border-slate-200/80 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 shadow-2xs group"
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

      {/* 3. Refined Modern Input Box Container */}
      <div className="relative mt-9 flex items-end gap-1 sm:mt-0 sm:gap-1.5 bg-[#f4f4f6] dark:bg-[#1e1e22] hover:bg-[#ededf0] dark:hover:bg-[#232328] focus-within:bg-white dark:focus-within:bg-[#1c1c20] focus-within:border-emerald-500/40 dark:focus-within:border-emerald-500/40 focus-within:shadow-[0_2px_14px_rgba(16,185,129,0.06)] border border-slate-200/70 dark:border-slate-800/80 rounded-[26px] p-2 sm:p-2.5 transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,image/*"
        />

        <div className="absolute -top-8 left-2 flex items-center gap-1 sm:static">
        {/* Paperclip Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="group relative border border-transparent p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-full transition-all shrink-0 mb-0.5 active:scale-95 disabled:opacity-50"
          aria-label="上传附件"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900">上传附件</span>
        </button>

        {/* Web Search Icon Button beside attachment button */}
        <button
          onClick={() => setEnableSearch(!enableSearch)}
          className={`group relative border border-transparent p-1.5 rounded-full transition-all shrink-0 mb-0.5 active:scale-95 ${
            enableSearch
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/80'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
          }`}
          aria-label="联网搜索"
        >
          <Globe className={`w-4 h-4 ${enableSearch ? 'animate-pulse' : ''}`} />
          <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900">联网搜索</span>
        </button>

        {/* PPT Generation Background Toggle Button */}
        <button
          onClick={() => setEnablePPT(!enablePPT)}
          className={`group relative border border-transparent p-1.5 rounded-full transition-all shrink-0 mb-0.5 active:scale-95 ${
            enablePPT
              ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/80'
              : 'text-slate-400 dark:text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
          }`}
          aria-label="制作PPT"
        >
          <Presentation className={`w-4 h-4 ${enablePPT ? 'animate-pulse text-orange-600 dark:text-orange-400' : ''}`} />
          <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900">制作PPT</span>
        </button>
        </div>

        {/* Auto-resizing Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="今天聊点什么？"
          style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
          className="min-w-0 flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none resize-none max-h-48 py-1.5 pl-1.5 pr-0 text-[14px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400/80 dark:placeholder:text-slate-500/80 leading-relaxed sm:px-0"
        />

        {/* Right side buttons: Mic & Send / Stop */}
        <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
          {/* Voice Input Button */}
          <button
            onClick={toggleVoiceInput}
            className={`p-2 rounded-full transition-all active:scale-95 ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-2xs'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
            }`}
            title={isListening ? '正在收音，点击停止' : '语音输入'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send or Stop Button */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-full transition-all active:scale-95 shadow-xs"
              title="停止生成"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!hasContent}
              className={`p-2 rounded-full transition-all duration-150 active:scale-95 ${
                hasContent
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer scale-100'
                  : 'text-slate-300 dark:text-slate-600 bg-slate-200/50 dark:bg-slate-800/40 cursor-not-allowed'
              }`}
              title="发送消息 (Enter)"
            >
              <ArrowUp className={`w-4 h-4 ${hasContent ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-2.5 text-[11px] text-slate-400 dark:text-slate-500 select-none">
        {settings.site_title || 'QuickGPT'} 可能会产生错误，请核对重要信息。
      </div>
    </div>
  );
};
