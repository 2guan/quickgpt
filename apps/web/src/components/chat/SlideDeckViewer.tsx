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

export interface SlideItem {
  tag?: string;
  title?: string;
  description?: string;
  value?: string;
}

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets?: string[];
  items?: SlideItem[];
  notes?: string;
  layout?: 'cover' | 'grid2' | 'grid3' | 'grid4' | 'timeline' | 'stats' | 'content';
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
 * Strips raw markdown syntax (**bold**, *italic*, `code`) for plain text PPTX export
 */
export function cleanMarkdownText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

/**
 * Renders inline markdown styling for React elements (supporting **bold**, *italic*, etc.)
 */
export function renderFormattedText(text: string): React.ReactNode {
  if (!text) return '';
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[90%]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * Parses markdown slide content:
 * Splits by `---` or page markers and extracts structured items, layouts, titles, notes.
 */
export function parseMarkdownSlides(raw: string): SlideData[] {
  if (!raw || !raw.trim()) return [];

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
    const rawBullets: string[] = [];
    const items: SlideItem[] = [];
    let notes = '';
    let explicitLayout: SlideData['layout'] | null = null;

    for (const line of lines) {
      // Check layout hint comment e.g. <!-- layout: timeline --> or <!-- layout: grid2 -->
      const layoutMatch = line.match(/<!--\s*layout:\s*(cover|grid2|grid3|grid4|timeline|stats|content)\s*-->/i);
      if (layoutMatch) {
        explicitLayout = layoutMatch[1].toLowerCase() as SlideData['layout'];
        continue;
      }

      if (line.startsWith('# ')) {
        title = line.replace(/^#\s+/, '').trim();
      } else if (line.startsWith('## ') && !title) {
        title = line.replace(/^##\s+/, '').trim();
      } else if (line.startsWith('### ') && !subtitle) {
        subtitle = line.replace(/^###\s+/, '').trim();
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+[\.、]\s*/.test(line)) {
        const cleaned = line.replace(/^[-*]\s+|\d+[\.、]\s*/, '').trim();
        rawBullets.push(cleaned);

        // Parse structured items: "标题: 描述" or "阶段/年份: 内容" or "【标签】描述" or "**标题**: 描述"
        const boldMatch = cleaned.match(/^\*\*([^*]+)\*\*[：:\s]*(.+)$/);
        const bracketMatch = cleaned.match(/^【([^】]+)】[：:\s]*(.+)$/);
        const colonMatch = cleaned.match(/^([^：:\s]{1,16})[：:](.+)$/);

        if (boldMatch) {
          items.push({ title: boldMatch[1].trim(), description: boldMatch[2].trim() });
        } else if (bracketMatch) {
          items.push({ tag: bracketMatch[1].trim(), title: bracketMatch[1].trim(), description: bracketMatch[2].trim() });
        } else if (colonMatch) {
          items.push({ title: colonMatch[1].trim(), description: colonMatch[2].trim() });
        } else {
          items.push({ description: cleaned });
        }
      } else if (line.startsWith('> 演讲备注：') || line.startsWith('> 备注：') || line.startsWith('> Notes:')) {
        notes = line.replace(/^>\s*(?:演讲备注：|备注：|Notes:)\s*/i, '').trim();
      } else if (!title) {
        title = line;
      } else if (!subtitle && rawBullets.length === 0) {
        subtitle = line;
      } else {
        rawBullets.push(line);
        items.push({ description: line });
      }
    }

    if (title || rawBullets.length > 0) {
      const isCover = i === 0 && rawBullets.length === 0;
      let computedLayout: SlideData['layout'] = explicitLayout || (isCover ? 'cover' : 'content');

      // Auto-detect layout based on item structure and keywords if not explicitly specified
      if (!explicitLayout && !isCover) {
        const titleLower = title.toLowerCase();
        const hasTimeKeywords = titleLower.includes('时序') || titleLower.includes('里程碑') || titleLower.includes('规划') || titleLower.includes('路线图') || titleLower.includes('发展历程') || titleLower.includes('阶段') || titleLower.includes('演进');
        const hasStatsKeywords = titleLower.includes('数据') || titleLower.includes('成效') || titleLower.includes('指标') || titleLower.includes('概览');

        const structuredCount = items.filter((it) => it.title).length;

        if (hasTimeKeywords && items.length >= 2) {
          computedLayout = 'timeline';
        } else if (hasStatsKeywords && items.length >= 2 && items.length <= 4) {
          computedLayout = 'stats';
        } else if (structuredCount >= 2 && items.length === 2) {
          computedLayout = 'grid2';
        } else if (structuredCount >= 3 && items.length === 3) {
          computedLayout = 'grid3';
        } else if (structuredCount >= 3 && items.length === 4) {
          computedLayout = 'grid4';
        } else if (items.length === 2) {
          computedLayout = 'grid2';
        } else if (items.length === 3) {
          computedLayout = 'grid3';
        } else if (items.length === 4) {
          computedLayout = 'grid4';
        } else {
          computedLayout = 'content';
        }
      }

      slides.push({
        title: title || `幻灯片 ${i + 1}`,
        subtitle,
        bullets: rawBullets,
        items,
        notes,
        layout: computedLayout,
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

  // Export to Native PowerPoint .pptx file using pptxgenjs with rich layout rendering
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

        // 1. Cover Slide Layout
        if (s.layout === 'cover' || (idx === 0 && !s.bullets?.length && !s.items?.length)) {
          slide.background = { color: hexDark };

          // Decorative Top Accent Pill
          slide.addShape(pres.ShapeType.roundRect, {
            x: 4.5,
            y: 1.8,
            w: 4.3,
            h: 0.4,
            rectRadius: 0.2,
            fill: { color: 'FFFFFF', transparency: 85 },
            line: { color: hexAccent, width: 1 },
          });
          slide.addText('PRESENTATION DECK', {
            x: 4.5,
            y: 1.8,
            w: 4.3,
            h: 0.4,
            fontSize: 10,
            bold: true,
            color: hexAccent,
            align: 'center',
            fontFace: 'Microsoft YaHei',
          });

          // Main Title
          slide.addText(cleanMarkdownText(s.title || '演示文稿'), {
            x: 1.0,
            y: 2.5,
            w: 11.3,
            h: 1.8,
            fontSize: 34,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            fontFace: 'Microsoft YaHei',
          });

          // Subtitle
          if (s.subtitle) {
            slide.addText(cleanMarkdownText(s.subtitle), {
              x: 1.5,
              y: 4.4,
              w: 10.3,
              h: 1.0,
              fontSize: 16,
              color: 'CBD5E1',
              align: 'center',
              fontFace: 'Microsoft YaHei',
            });
          }

          // Footer branding
          slide.addText('Generated by QuickGPT AI Presentation', {
            x: 1.0,
            y: 6.8,
            w: 11.3,
            h: 0.4,
            fontSize: 10,
            color: '64748B',
            align: 'center',
          });
        } else {
          // Standard Slide Background
          slide.background = { color: 'F8FAFC' };

          // Top Header Accent Bar
          slide.addShape(pres.ShapeType.rect, {
            x: 0,
            y: 0,
            w: '100%',
            h: 0.08,
            fill: { color: hexAccent },
          });

          // Decorative accent marker before title
          slide.addShape(pres.ShapeType.roundRect, {
            x: 0.8,
            y: 0.55,
            w: 0.12,
            h: 0.45,
            rectRadius: 0.05,
            fill: { color: hexAccent },
          });

          // Slide Title
          slide.addText(cleanMarkdownText(s.title), {
            x: 1.05,
            y: 0.45,
            w: 11.0,
            h: 0.6,
            fontSize: 22,
            bold: true,
            color: '0F172A',
            fontFace: 'Microsoft YaHei',
          });

          // Subtitle
          if (s.subtitle) {
            slide.addText(cleanMarkdownText(s.subtitle), {
              x: 1.05,
              y: 1.05,
              w: 11.0,
              h: 0.4,
              fontSize: 12,
              color: '64748B',
              fontFace: 'Microsoft YaHei',
            });
          }

          const contentStartY = s.subtitle ? 1.6 : 1.35;
          const items = s.items || [];

          // 2. Timeline / Roadmap Layout in PPTX
          if (s.layout === 'timeline' && items.length > 0) {
            const count = Math.min(items.length, 4);
            const colWidth = (11.7 - (count - 1) * 0.3) / count;

            items.slice(0, 4).forEach((item, iIdx) => {
              const cardX = 0.8 + iIdx * (colWidth + 0.3);

              // Background Card Shape
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: 4.8,
                rectRadius: 0.15,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              // Step Badge Circle
              slide.addShape(pres.ShapeType.ellipse, {
                x: cardX + 0.25,
                y: contentStartY + 0.3,
                w: 0.45,
                h: 0.45,
                fill: { color: hexAccent },
              });
              slide.addText(`${iIdx + 1}`, {
                x: cardX + 0.25,
                y: contentStartY + 0.3,
                w: 0.45,
                h: 0.45,
                fontSize: 11,
                bold: true,
                color: 'FFFFFF',
                align: 'center',
                valign: 'middle',
              });

              // Step Title
              slide.addText(cleanMarkdownText(item.title || `阶段 ${iIdx + 1}`), {
                x: cardX + 0.8,
                y: contentStartY + 0.25,
                w: colWidth - 0.9,
                h: 0.5,
                fontSize: 13,
                bold: true,
                color: '0F172A',
                fontFace: 'Microsoft YaHei',
              });

              // Step Description
              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.25,
                y: contentStartY + 0.9,
                w: colWidth - 0.5,
                h: 3.6,
                fontSize: 11,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
              });
            });
          } else if (s.layout === 'stats' && items.length > 0) {
            // 3. Stats / Metrics Cards Layout in PPTX
            const count = Math.min(items.length, 3);
            const colWidth = (11.7 - (count - 1) * 0.4) / count;

            items.slice(0, 3).forEach((item, iIdx) => {
              const cardX = 0.8 + iIdx * (colWidth + 0.4);

              // Background Card Shape
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: 4.8,
                rectRadius: 0.15,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              // Metric Title
              slide.addText(cleanMarkdownText(item.title || `指标 ${iIdx + 1}`), {
                x: cardX + 0.3,
                y: contentStartY + 0.4,
                w: colWidth - 0.6,
                h: 0.5,
                fontSize: 15,
                bold: true,
                color: hexDark,
                fontFace: 'Microsoft YaHei',
              });

              // Metric Description
              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.3,
                y: contentStartY + 1.1,
                w: colWidth - 0.6,
                h: 3.0,
                fontSize: 12,
                color: '475569',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
              });

              // Bottom Accent Line
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX + 0.3,
                y: contentStartY + 4.3,
                w: 0.8,
                h: 0.08,
                rectRadius: 0.04,
                fill: { color: hexAccent },
              });
            });
          } else if (s.layout === 'grid2' && items.length === 2) {
            // 4. Dual-Column Comparison Layout in PPTX
            const colWidth = 5.65;
            items.forEach((item, iIdx) => {
              const cardX = 0.8 + iIdx * (colWidth + 0.4);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: 4.8,
                rectRadius: 0.15,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              // Card Title Bar
              if (item.title) {
                slide.addShape(pres.ShapeType.ellipse, {
                  x: cardX + 0.3,
                  y: contentStartY + 0.4,
                  w: 0.15,
                  h: 0.15,
                  fill: { color: hexAccent },
                });

                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.55,
                  y: contentStartY + 0.25,
                  w: colWidth - 0.8,
                  h: 0.45,
                  fontSize: 14,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                });
              }

              // Card Description
              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.3,
                y: contentStartY + 0.85,
                w: colWidth - 0.6,
                h: 3.6,
                fontSize: 12,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
              });
            });
          } else if ((s.layout === 'grid3' || s.layout === 'grid4') && items.length > 0) {
            // 5. Multi-Column Grid Cards in PPTX
            const count = s.layout === 'grid4' ? Math.min(items.length, 4) : Math.min(items.length, 3);
            const colWidth = (11.7 - (count - 1) * 0.3) / count;

            items.slice(0, count).forEach((item, iIdx) => {
              const cardX = 0.8 + iIdx * (colWidth + 0.3);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: 4.8,
                rectRadius: 0.15,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              if (item.title) {
                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.25,
                  y: contentStartY + 0.3,
                  w: colWidth - 0.5,
                  h: 0.5,
                  fontSize: 13,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                });
              }

              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.25,
                y: contentStartY + (item.title ? 0.9 : 0.4),
                w: colWidth - 0.5,
                h: 3.6,
                fontSize: 11,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
              });
            });
          } else {
            // 6. Standard Bullet Cards in PPTX
            if (s.bullets && s.bullets.length > 0) {
              const bulletCount = s.bullets.length;
              const cardHeight = (4.8 - (bulletCount - 1) * 0.2) / bulletCount;

              s.bullets.forEach((b, bIdx) => {
                const cardY = contentStartY + bIdx * (cardHeight + 0.2);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.8,
                  y: cardY,
                  w: 11.7,
                  h: cardHeight,
                  rectRadius: 0.1,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 1 },
                });

                slide.addShape(pres.ShapeType.ellipse, {
                  x: 1.05,
                  y: cardY + cardHeight / 2 - 0.06,
                  w: 0.12,
                  h: 0.12,
                  fill: { color: hexAccent },
                });

                slide.addText(cleanMarkdownText(b), {
                  x: 1.3,
                  y: cardY,
                  w: 11.0,
                  h: cardHeight,
                  fontSize: 12,
                  color: '334155',
                  fontFace: 'Microsoft YaHei',
                  valign: 'middle',
                });
              });
            }
          }

          // Slide Number Indicator
          slide.addText(`${idx + 1} / ${slides.length}`, {
            x: 10.5,
            y: 6.8,
            w: 2.0,
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

      {/* 2. Slide Visual Card Canvas (Strict 16:9 Fixed Ratio Box, No Scrollbars) */}
      <div
        className={`p-3 sm:p-5 flex items-center justify-center bg-slate-100/60 dark:bg-slate-950/40 ${
          isFullscreen ? 'flex-1 overflow-hidden' : ''
        }`}
      >
        <div
          className={`w-full aspect-[16/9] min-h-[260px] max-h-[460px] rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-800 p-5 sm:p-7 lg:p-9 flex flex-col justify-between transition-all duration-300 relative overflow-hidden select-none ${
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

          {/* Slide Body Content (Rich layout renderer: cover / grid2 / grid3 / grid4 / timeline / stats / content) */}
          <div className="flex-1 min-h-0 flex flex-col justify-center my-auto overflow-hidden">
            {/* 1. COVER SLIDE */}
            {currentSlide.layout === 'cover' ? (
              <div className="text-center my-auto space-y-2.5 px-4">
                <div className="inline-block px-3 py-0.5 rounded-full bg-white/15 backdrop-blur-xs text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
                  Presentation Deck
                </div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-snug break-words drop-shadow-sm max-w-2xl mx-auto">
                  {renderFormattedText(currentSlide.title)}
                </h1>
                {currentSlide.subtitle && (
                  <p className="text-xs sm:text-sm text-slate-200/90 font-medium max-w-xl mx-auto leading-relaxed break-words">
                    {renderFormattedText(currentSlide.subtitle)}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Regular Header: Title & Subtitle */}
                <div className="shrink-0 mb-2 sm:mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: activeTheme.accent }} />
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-snug break-words flex-1">
                      {renderFormattedText(currentSlide.title)}
                    </h2>
                  </div>
                  {currentSlide.subtitle && (
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium ml-3.5 mt-0.5 break-words">
                      {renderFormattedText(currentSlide.subtitle)}
                    </p>
                  )}
                </div>

                {/* 2. TIMELINE / ROADMAP LAYOUT */}
                {currentSlide.layout === 'timeline' && currentSlide.items && currentSlide.items.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 my-auto overflow-hidden">
                    {currentSlide.items.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="relative flex flex-col p-2 sm:p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs">
                        <div className="flex items-center gap-1.5 mb-1 shrink-0">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white shadow-2xs shrink-0" style={{ backgroundColor: activeTheme.accent }}>
                            {idx + 1}
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 break-words leading-tight flex-1">
                            {renderFormattedText(item.title || `阶段 ${idx + 1}`)}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal flex-1">
                          {renderFormattedText(item.description || '')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : /* 3. STATS / METRICS / COLOR CARDS LAYOUT */
                currentSlide.layout === 'stats' && currentSlide.items && currentSlide.items.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 my-auto overflow-hidden">
                    {currentSlide.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="p-2.5 sm:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-linear-to-br from-slate-50 to-slate-100/70 dark:from-slate-800/80 dark:to-slate-900/80 shadow-2xs flex flex-col justify-between">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 break-words leading-tight">
                          {renderFormattedText(item.title || `指标 ${idx + 1}`)}
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-snug break-words whitespace-normal flex-1">
                          {renderFormattedText(item.description || '')}
                        </p>
                        <div className="w-6 h-0.5 mt-1.5 rounded-full shrink-0" style={{ backgroundColor: activeTheme.accent }} />
                      </div>
                    ))}
                  </div>
                ) : /* 4. TWO-COLUMN / COMPARISON LAYOUT (grid2) */
                currentSlide.layout === 'grid2' && currentSlide.items && currentSlide.items.length === 2 ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 my-auto overflow-hidden">
                    {currentSlide.items.map((item, idx) => (
                      <div key={idx} className="p-2.5 sm:p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs flex flex-col">
                        {item.title && (
                          <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-slate-200/60 dark:border-slate-700/50">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeTheme.accent }} />
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 break-words leading-tight flex-1">
                              {renderFormattedText(item.title)}
                            </span>
                          </div>
                        )}
                        <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words whitespace-normal flex-1">
                          {renderFormattedText(item.description || '')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : /* 5. THREE-COLUMN / FOUR-COLUMN GRID LAYOUT (grid3 / grid4) */
                (currentSlide.layout === 'grid3' || currentSlide.layout === 'grid4') && currentSlide.items && currentSlide.items.length > 0 ? (
                  <div className={`grid gap-2 sm:gap-2.5 my-auto overflow-hidden ${currentSlide.layout === 'grid4' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                    {currentSlide.items.slice(0, currentSlide.layout === 'grid4' ? 4 : 3).map((item, idx) => (
                      <div key={idx} className="p-2 sm:p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs flex flex-col">
                        {item.title && (
                          <div className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 mb-1 break-words leading-tight">
                            {renderFormattedText(item.title)}
                          </div>
                        )}
                        <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal flex-1">
                          {renderFormattedText(item.description || '')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* 6. STANDARD BULLET POINTS LIST */
                  currentSlide.bullets && currentSlide.bullets.length > 0 && (
                    <div className={`grid overflow-hidden ${currentSlide.bullets.length > 3 ? 'gap-1.5 sm:gap-2' : 'gap-2 sm:gap-2.5'}`}>
                      {currentSlide.bullets.map((b, bIdx) => {
                        const isDense = (currentSlide.bullets?.length || 0) >= 4;
                        return (
                          <div
                            key={bIdx}
                            className={`flex items-start gap-2 sm:gap-2.5 rounded-lg bg-slate-50/90 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 font-medium transition-all ${
                              isDense ? 'p-1.5 sm:p-2 text-[11px] sm:text-xs' : 'p-2 sm:p-2.5 text-xs sm:text-[13px]'
                            }`}
                          >
                            <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: activeTheme.accent }} />
                            <span className="text-slate-700 dark:text-slate-200 break-words leading-relaxed whitespace-normal flex-1">
                              {renderFormattedText(b)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            )}
          </div>

          {/* Slide Footer */}
          <div className="flex items-center justify-between pt-2 mt-1.5 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
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
