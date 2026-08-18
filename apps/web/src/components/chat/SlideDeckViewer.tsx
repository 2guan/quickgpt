import React, { useState, useEffect } from 'react';
import pptxgen from 'pptxgenjs';
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
  layout?: 'cover' | 'content' | 'split' | 'summary';
}

interface SlideDeckProps {
  rawCode: string;
}

// Preset modern color themes
const COLOR_THEMES = [
  { id: 'emerald', name: '清新极光绿', bg: '#064e3b', accent: '#10b981', cardBg: '#ecfdf5', textColor: '#065f46', darkText: '#ffffff' },
  { id: 'business', name: '商务深海蓝', bg: '#1e3a8a', accent: '#3b82f6', cardBg: '#eff6ff', textColor: '#1e40af', darkText: '#ffffff' },
  { id: 'tech', name: '科技星空黑', bg: '#0f172a', accent: '#6366f1', cardBg: '#f8fafc', textColor: '#334155', darkText: '#ffffff' },
  { id: 'purple', name: '梦幻灵感紫', bg: '#4c1d95', accent: '#a855f7', cardBg: '#faf5ff', textColor: '#6b21a8', darkText: '#ffffff' },
];

/**
 * Parses markdown slide content:
 * Splits by `---` or `## ` headers and extracts title, subtitle, bullets, notes.
 */
export function parseMarkdownSlides(raw: string): SlideData[] {
  if (!raw || !raw.trim()) return [];

  // Split by horizontal rule `---` or page markers
  const rawSections = raw
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const slides: SlideData[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const sec = rawSections[i];
    const lines = sec.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let title = '';
    let subtitle = '';
    const bullets: string[] = [];
    let notes = '';

    for (const line of lines) {
      if (line.startsWith('# ')) {
        title = line.replace(/^#\s+/, '').trim();
      } else if (line.startsWith('## ') && !title) {
        title = line.replace(/^##\s+/, '').trim();
      } else if (line.startsWith('### ') && !subtitle) {
        subtitle = line.replace(/^###\s+/, '').trim();
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s+/.test(line)) {
        bullets.push(line.replace(/^[-*]\s+|\d+\.\s+/, '').trim());
      } else if (line.startsWith('> 演讲备注：') || line.startsWith('> 备注：') || line.startsWith('> Notes:')) {
        notes = line.replace(/^>\s*(?:演讲备注：|备注：|Notes:)\s*/i, '').trim();
      } else if (!title) {
        title = line;
      } else if (!subtitle && bullets.length === 0) {
        subtitle = line;
      } else {
        bullets.push(line);
      }
    }

    if (title || bullets.length > 0) {
      const isCover = i === 0 && bullets.length === 0;
      slides.push({
        title: title || `幻灯片 ${i + 1}`,
        subtitle,
        bullets,
        notes,
        layout: isCover ? 'cover' : 'content',
      });
    }
  }

  // Fallback if no delimiter was found
  if (slides.length === 0 && raw.trim()) {
    slides.push({
      title: '演示幻灯片',
      subtitle: '',
      bullets: raw.split('\n').filter((l) => l.trim().length > 0),
      layout: 'content',
    });
  }

  return slides;
}

export const SlideDeckViewer: React.FC<SlideDeckProps> = ({ rawCode }) => {
  const slides = React.useMemo(() => parseMarkdownSlides(rawCode), [rawCode]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [themeIdx, setThemeIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const activeTheme = COLOR_THEMES[themeIdx];
  const totalSlides = slides.length;

  // Ensure currentIdx doesn't exceed totalSlides
  const safeIdx = Math.min(currentIdx, Math.max(0, totalSlides - 1));
  const currentSlide = slides[safeIdx] || slides[0] || { title: '暂无内容', bullets: [] };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => Math.max(0, prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => Math.min(totalSlides - 1, prev + 1));
  };

  // Keyboard navigation (active in fullscreen or when focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentIdx((prev) => Math.min(totalSlides - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, totalSlides]);

  // Export to Native PowerPoint .pptx file using pptxgenjs
  const handleExportPPTX = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (slides.length === 0) return;
    setIsExporting(true);

    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      const hexAccent = activeTheme.accent.replace('#', '');
      const hexDark = activeTheme.bg.replace('#', '');

      slides.forEach((s, idx) => {
        const slide = pres.addSlide();

        // 1. Cover Slide
        if (s.layout === 'cover' || (idx === 0 && !s.bullets?.length)) {
          slide.background = { color: hexDark };

          slide.addText(s.title || '演示文稿', {
            x: '10%',
            y: '35%',
            w: '80%',
            h: 1.5,
            fontSize: 36,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            fontFace: 'Microsoft YaHei',
          });

          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: '15%',
              y: '55%',
              w: '70%',
              h: 1.0,
              fontSize: 20,
              color: 'E2E8F0',
              align: 'center',
              fontFace: 'Microsoft YaHei',
            });
          }

          // Footer branding
          slide.addText('Generated by QuickGPT AI Presentation', {
            x: '10%',
            y: '90%',
            w: '80%',
            h: 0.4,
            fontSize: 10,
            color: '94A3B8',
            align: 'center',
          });
        } else {
          // 2. Content Slide
          slide.background = { color: 'F8FAFC' };

          // Top Header Accent Line
          slide.addShape(pres.ShapeType.rect, {
            x: 0,
            y: 0,
            w: '100%',
            h: 0.1,
            fill: { color: hexAccent },
          });

          // Title
          slide.addText(s.title, {
            x: 0.8,
            y: 0.6,
            w: '85%',
            h: 0.8,
            fontSize: 26,
            bold: true,
            color: hexDark,
            fontFace: 'Microsoft YaHei',
          });

          // Subtitle
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8,
              y: 1.3,
              w: '85%',
              h: 0.5,
              fontSize: 14,
              color: '64748B',
              fontFace: 'Microsoft YaHei',
            });
          }

          // Bullets
          if (s.bullets && s.bullets.length > 0) {
            const startY = s.subtitle ? 2.0 : 1.6;
            const bulletItems = s.bullets.map((b) => ({
              text: b,
              options: {
                bullet: true,
                fontSize: 16,
                color: '334155',
                indentLevel: 0,
                spaceAfter: 12,
                fontFace: 'Microsoft YaHei',
              },
            }));

            slide.addText(bulletItems, {
              x: 0.8,
              y: startY,
              w: '85%',
              h: 4.5,
              valign: 'top',
            });
          }

          // Slide Number Indicator
          slide.addText(`${idx + 1} / ${slides.length}`, {
            x: '85%',
            y: '90%',
            w: '10%',
            h: 0.4,
            fontSize: 10,
            color: '94A3B8',
            align: 'right',
          });
        }

        // Speaker Notes
        if (s.notes) {
          slide.addNotes(s.notes);
        }
      });

      const firstTitle = (slides[0]?.title || '演示文稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
      await pres.writeFile({ fileName: `${firstTitle}_QuickGPT.pptx` });
    } catch (err: any) {
      alert(`导出 PPTX 失败: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (slides.length === 0) return null;

  return (
    <div
      className={`my-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md overflow-hidden transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-white'
          : 'w-full max-w-3xl mx-auto'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/70 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-orange-100 dark:bg-orange-950/70 text-orange-600 dark:text-orange-400">
            <Presentation className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            AI 幻灯片演示 ({safeIdx + 1} / {totalSlides} 页)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Theme Palette Switcher */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
            {COLOR_THEMES.map((theme, i) => (
              <button
                key={theme.id}
                onClick={() => setThemeIdx(i)}
                className={`w-3.5 h-3.5 rounded-full transition-transform ${
                  themeIdx === i ? 'scale-125 ring-2 ring-emerald-500' : 'hover:opacity-80'
                }`}
                style={{ backgroundColor: theme.accent }}
                title={theme.name}
              />
            ))}
          </div>

          {/* Export PPTX Button */}
          <button
            onClick={handleExportPPTX}
            disabled={isExporting}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-2xs active:scale-95 disabled:opacity-50"
            title="导出为 Office / WPS 原生 .pptx 文件"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isExporting ? '生成中...' : '下载 PPTX'}</span>
          </button>

          {/* Fullscreen Mode */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={isFullscreen ? '退出全屏 (ESC)' : '全屏放映演示'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Slide Visual Card Canvas (Strict 16:9 Fixed Ratio Box) */}
      <div
        className={`p-3 sm:p-5 flex items-center justify-center bg-slate-100/60 dark:bg-slate-950/40 ${
          isFullscreen ? 'flex-1 overflow-hidden' : ''
        }`}
      >
        <div
          className={`w-full aspect-[16/9] max-h-[440px] rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-800 p-5 sm:p-8 flex flex-col justify-between transition-all duration-300 relative overflow-y-auto select-none ${
            currentSlide.layout === 'cover'
              ? 'text-white'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100'
          }`}
          style={{
            backgroundColor: currentSlide.layout === 'cover' ? activeTheme.bg : undefined,
          }}
        >
          {/* Top Decorative Line */}
          {currentSlide.layout !== 'cover' && (
            <div
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ backgroundColor: activeTheme.accent }}
            />
          )}

          {/* Slide Body Content */}
          <div className="space-y-3.5 my-auto">
            {/* Title & Subtitle */}
            <div className={currentSlide.layout === 'cover' ? 'text-center' : ''}>
              <h2
                className={`font-bold tracking-tight ${
                  currentSlide.layout === 'cover'
                    ? 'text-2xl sm:text-3xl lg:text-4xl text-white drop-shadow-xs'
                    : 'text-lg sm:text-2xl font-bold text-slate-900 dark:text-white'
                }`}
              >
                {currentSlide.title}
              </h2>
              {currentSlide.subtitle && (
                <p
                  className={`mt-1.5 text-xs sm:text-sm ${
                    currentSlide.layout === 'cover'
                      ? 'text-slate-200'
                      : 'text-slate-500 dark:text-slate-400 font-medium'
                  }`}
                >
                  {currentSlide.subtitle}
                </p>
              )}
            </div>

            {/* Bullets List */}
            {currentSlide.bullets && currentSlide.bullets.length > 0 && (
              <div className="grid gap-2 sm:gap-2.5 mt-3 sm:mt-4">
                {currentSlide.bullets.map((b, bIdx) => (
                  <div
                    key={bIdx}
                    className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs sm:text-sm font-medium leading-relaxed"
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: activeTheme.accent }}
                    />
                    <span className="text-slate-700 dark:text-slate-200">{b}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Slide Footer */}
          <div className="flex items-center justify-between pt-3 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/60 mt-auto">
            <span>QuickGPT AI Slide Deck</span>
            <span className="font-mono font-medium">
              {safeIdx + 1} / {totalSlides}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200/70 dark:border-slate-800 text-xs">
        <button
          onClick={handlePrev}
          disabled={safeIdx === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>上一页</span>
        </button>

        {/* Thumbnail Dots */}
        <div className="flex items-center gap-1.5 max-w-[200px] overflow-x-auto py-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                safeIdx === i
                  ? 'w-5 bg-emerald-600 dark:bg-emerald-400'
                  : 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400'
              }`}
              title={`跳转到第 ${i + 1} 页`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={safeIdx === totalSlides - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <span>下一页</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
