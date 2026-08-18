import React, { useState, useEffect } from 'react';
import { Message, MessageAttachment } from '../../types/index.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { FollowUpChips } from './FollowUpChips.js';
import {
  Bot,
  User,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Sparkles,
  Globe,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface MessageGroupProps {
  userMessage?: Message;
  assistantMessages: Message[];
  onFollowUpSelect: (text: string) => void;
}

export const MessageItem: React.FC<MessageGroupProps> = ({
  userMessage,
  assistantMessages,
  onFollowUpSelect,
}) => {
  return (
    <div className="py-4 space-y-4 max-w-5xl mx-auto w-full">
      {/* 1. User Message */}
      {userMessage && <UserMessageBubble message={userMessage} />}

      {/* 2. Assistant Responses (Grid for 1~4 models) */}
      {assistantMessages.length > 0 && (
        <div
          className={`grid gap-4 ${
            assistantMessages.length === 1
              ? 'grid-cols-1'
              : assistantMessages.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : assistantMessages.length === 3
              ? 'grid-cols-1 md:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2'
          }`}
        >
          {assistantMessages.map((astMsg) => (
            <AssistantCard
              key={astMsg.id}
              message={astMsg}
              onFollowUpSelect={onFollowUpSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const UserMessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  let attachments: MessageAttachment[] = [];
  try {
    attachments = JSON.parse(message.attachments_json || '[]');
  } catch {
    // ignore
  }

  return (
    <div className="flex justify-end gap-3 px-2 sm:px-4">
      <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%] space-y-2">
        {/* Attached files preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {attachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200 shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium truncate max-w-[150px]">{att.name}</span>
                {att.size && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {(att.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text bubble */}
        <div className="bg-[#f4f4f5] dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-2xs text-[14.5px] leading-relaxed break-words whitespace-pre-wrap">
          {message.content}
        </div>
      </div>

      <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-emerald-700 text-white flex items-center justify-center text-xs font-semibold shrink-0 shadow-xs">
        <User className="w-4 h-4" />
      </div>
    </div>
  );
};

const AssistantCard: React.FC<{
  message: Message;
  onFollowUpSelect: (text: string) => void;
}> = ({ message, onFollowUpSelect }) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  // Expand reasoning during live generation/streaming, auto collapse once completed
  const [showReasoning, setShowReasoning] = useState<boolean>(() => !!message.isStreaming && !message.content);
  const [showSearch, setShowSearch] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Auto collapse reasoning when streaming completes and main content arrives
  const prevStreamingRef = React.useRef(message.isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !message.isStreaming) {
      // Completed streaming -> collapse reasoning
      setShowReasoning(false);
    }
    prevStreamingRef.current = message.isStreaming;
  }, [message.isStreaming]);

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanTextForLocalSpeech = (rawText: string) => {
    return rawText
      .replace(/<(think|thought|thinking|reasoning|reflection)[\s\S]*?<\/\1>/gi, '')
      .replace(/^<(think|thought|thinking|reasoning|reflection)[\s\S]*?(?:<\/\1>|$)/gi, '')
      .replace(/【(?:思考过程|思考|深度思考)】[\s\S]*?【(?:回答|最终回答|正式回答)】/gi, '')
      .replace(/(?:^|\n)(?:思考过程|Thinking Process|Thought Process)[：:]\s*[\s\S]*?(?:\n\n|\n(?=[^\s>]))/gi, '')
      .replace(/\[\d+(?:[,\s\-]\d+)*\]/g, '')
      .replace(/```[\s\S]*?```/g, ' 代码块已省略 ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
      .replace(/^[#>\-\*\+]\s+/gm, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\$\$[\s\S]*?\$\$/g, ' 公式 ')
      .replace(/\$([^\$]+)\$/g, '$1')
      .replace(/\\\[[\s\S]*?\\\]/g, ' 公式 ')
      .replace(/\\\(([^\)]+)\\\)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  };

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const isCancelledRef = React.useRef<boolean>(false);

  const handleTTS = async () => {
    if (!message.content) return;

    // 1. If currently playing or loading, cancel and reset immediately
    if (isSpeaking || isLoadingTTS) {
      isCancelledRef.current = true;
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {}
        audioCtxRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setIsLoadingTTS(false);
      return;
    }

    isCancelledRef.current = false;
    setIsLoadingTTS(true);

    try {
      // 2. Request backend streaming Xiaomi MiMo / OpenAI TTS
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/chat/tts', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          text: message.content,
          modelId: message.model_id,
        }),
      });

      if (res.ok && res.body && res.headers.get('content-type')?.includes('audio')) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass({ sampleRate: 24000 });
          audioCtxRef.current = audioCtx;

          const reader = res.body.getReader();
          let nextPlayTime = audioCtx.currentTime;
          let hasStartedPlaying = false;
          let receivedHeader = false;
          let pendingBytes = new Uint8Array(0);

          while (true) {
            const { done, value } = await reader.read();
            if (isCancelledRef.current) {
              try {
                reader.cancel();
              } catch {}
              break;
            }

            if (done) break;

            if (value && value.length > 0) {
              // Combine with pending bytes
              const combined = new Uint8Array(pendingBytes.length + value.length);
              combined.set(pendingBytes, 0);
              combined.set(value, pendingBytes.length);

              let offset = 0;
              // Skip 44-byte WAV header on initial stream chunk
              if (!receivedHeader) {
                if (combined.length < 44) {
                  pendingBytes = combined;
                  continue;
                }
                offset = 44;
                receivedHeader = true;
              }

              // Process 16-bit PCM samples (2 bytes per sample)
              const pcmBytesLength = combined.length - offset;
              const usableBytes = pcmBytesLength - (pcmBytesLength % 2);

              if (usableBytes > 0) {
                const sampleCount = usableBytes / 2;
                const float32Data = new Float32Array(sampleCount);
                const dataView = new DataView(combined.buffer, combined.byteOffset + offset, usableBytes);

                for (let i = 0; i < sampleCount; i++) {
                  // Convert Int16 to Float32 [-1.0, 1.0]
                  const int16 = dataView.getInt16(i * 2, true);
                  float32Data[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
                }

                const audioBuffer = audioCtx.createBuffer(1, sampleCount, 24000);
                audioBuffer.copyToChannel(float32Data, 0);

                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);

                const startTime = Math.max(audioCtx.currentTime, nextPlayTime);
                source.start(startTime);
                nextPlayTime = startTime + audioBuffer.duration;

                if (!hasStartedPlaying) {
                  hasStartedPlaying = true;
                  setIsLoadingTTS(false);
                  setIsSpeaking(true);
                }

                // Preserve trailing unaligned byte
                const remainingStart = offset + usableBytes;
                if (remainingStart < combined.length) {
                  pendingBytes = combined.slice(remainingStart);
                } else {
                  pendingBytes = new Uint8Array(0);
                }
              } else {
                pendingBytes = combined.slice(offset);
              }
            }
          }

          if (hasStartedPlaying) {
            // Monitor when playback finishes
            const remainingDuration = (nextPlayTime - audioCtx.currentTime) * 1000;
            setTimeout(() => {
              if (audioCtxRef.current === audioCtx) {
                setIsSpeaking(false);
                setIsLoadingTTS(false);
              }
            }, Math.max(0, remainingDuration + 150));
            return;
          }
        }
      }
    } catch (err: any) {
      console.warn('[TTS] Streaming TTS error, falling back to Web Speech:', err.message);
    }

    if (isCancelledRef.current) return;

    // 3. Fallback to browser Web Speech API
    setIsLoadingTTS(false);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const cleanText = cleanTextForLocalSpeech(message.content);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      utterance.onerror = (e) => {
        console.warn('[TTS] SpeechSynthesis error:', e);
        setIsSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  let searchResults: any[] = [];
  try {
    searchResults = JSON.parse(message.search_results_json || '[]');
  } catch {
    // ignore
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between transition-all hover:shadow-md">
      <div>
        {/* Model header bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {message.model_id || 'AI 助手'}
              </span>
              {message.isStreaming && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> 生成中...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              disabled={!message.content}
              title="复制回答"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleTTS}
              disabled={!message.content}
              title={isSpeaking ? '停止朗读' : isLoadingTTS ? '正在合成语音...' : '语音朗读'}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                isSpeaking
                  ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40'
                  : isLoadingTTS
                  ? 'text-emerald-600 dark:text-emerald-400 animate-pulse'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isLoadingTTS ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
              ) : isSpeaking ? (
                <VolumeX className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Web Search Citations drawer if any */}
        {searchResults.length > 0 && (
          <div className="mb-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 p-2.5 text-xs">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="w-full flex items-center justify-between text-slate-600 dark:text-slate-300 font-medium"
            >
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Globe className="w-3.5 h-3.5" />
                <span>已参考 {searchResults.length} 篇最新检索网页</span>
              </div>
              {showSearch ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {showSearch && (
              <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700">
                {searchResults.map((sr, sIdx) => (
                  <a
                    key={sIdx}
                    href={sr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-1.5 rounded bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 truncate"
                  >
                    [{sIdx + 1}] {sr.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reasoning / Thinking accordion with full Markdown & KaTeX rendering */}
        {message.reasoning_content && (
          <div className="mb-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 p-3 text-xs">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full flex items-center justify-between text-amber-800 dark:text-amber-300 font-medium"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>
                  {message.isStreaming && !message.content ? '深度思考中...' : '思考过程 (已折叠)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-700/80 dark:text-amber-400/80">
                <span className="text-[11px] font-normal">
                  {showReasoning ? '收起' : '展开'}
                </span>
                {showReasoning ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
            </button>
            {showReasoning && (
              <div className="mt-2.5 pt-2.5 border-t border-amber-200/50 dark:border-amber-900/40 text-slate-700 dark:text-slate-300 text-[13px] leading-relaxed">
                <MarkdownRenderer content={message.reasoning_content} />
              </div>
            )}
          </div>
        )}

        {/* Main Answer Markdown Content */}
        {message.content ? (
          <div className="text-slate-800 dark:text-slate-100">
            <MarkdownRenderer content={message.content} />
          </div>
        ) : message.isStreaming ? (
          <div className="flex items-center gap-2 py-4 text-slate-400 dark:text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
            <span>思考并组织语言中...</span>
          </div>
        ) : (
          <div className="p-3 bg-red-50/80 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>未获取到有效回答（可能模型未响应或返回异常）</span>
          </div>
        )}
      </div>

      {/* Follow-up suggestions */}
      <FollowUpChips
        suggestionsJson={message.followup_suggestions_json}
        onSelect={onFollowUpSelect}
      />
    </div>
  );
};
