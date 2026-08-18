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
}

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets: string[];
  items: SlideItem[];
  notes?: string;
  layout: 'cover' | 'grid2' | 'grid3' | 'grid4' | 'timeline' | 'stats' | 'content';
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
 * Strips raw markdown syntax (**bold**, *italic*, `code`, #) for clean plain text PPTX export
 */
export function cleanMarkdownText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

/**
 * Renders inline markdown styling for React elements (supporting **bold**, *italic*, `code`)
 */
export function renderFormattedText(text: string): React.ReactNode {
  if (!text) return '';
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-bold opacity-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[90%]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * Robust markdown slide parser:
 * Handles titles, subtitles, structured items (**Key**: Value), lists, and explicit/inferred layouts.
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
      const layoutMatch = line.match(/<!--\s*layout:\s*(cover|grid2|grid3|grid4|timeline|stats|content)\s*-->/i);
      if (layoutMatch) {
        explicitLayout = layoutMatch[1].toLowerCase() as SlideData['layout'];
        continue;
      }

      if (line.startsWith('> 演讲备注：') || line.startsWith('> 备注：') || line.startsWith('> Notes:')) {
        notes = line.replace(/^>\s*(?:演讲备注：|备注：|Notes:)\s*/i, '').trim();
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

        const boldMatch = cleaned.match(/^\*\*([^*]+)\*\*[：:\s]*(.+)$/);
        const bracketMatch = cleaned.match(/^【([^】]+)】[：:\s]*(.+)$/);
        const colonMatch = cleaned.match(/^([^：:\s]{2,16})[：:](.+)$/);

        if (boldMatch) {
          items.push({ title: boldMatch[1].trim(), description: boldMatch[2].trim() });
        } else if (bracketMatch) {
          items.push({ tag: bracketMatch[1].trim(), title: bracketMatch[1].trim(), description: bracketMatch[2].trim() });
        } else if (colonMatch) {
          items.push({ title: colonMatch[1].trim(), description: colonMatch[2].trim() });
        } else {
          items.push({ description: cleaned });
        }
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

      if (!explicitLayout && !isCover) {
        const titleLower = title.toLowerCase();
        const hasTimeKeywords = titleLower.includes('时序') || titleLower.includes('里程碑') || titleLower.includes('规划') || titleLower.includes('路线图') || titleLower.includes('发展历程') || titleLower.includes('阶段') || titleLower.includes('演进');
        const hasStatsKeywords = titleLower.includes('数据') || titleLower.includes('成效') || titleLower.includes('指标') || titleLower.includes('概览') || titleLower.includes('成果');

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

  const safeIdx = Math.min(currentIdx, Math.max(0, totalSlides - 1));
  const currentSlide = slides[safeIdx] || slides[0] || { title: '暂无内容', bullets: [], items: [], layout: 'content' };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => Math.max(0, prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => Math.min(totalSlides - 1, prev + 1));
  };

  // Keyboard navigation
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

  const handleExportPPTX = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (slides.length === 0) return;
    setIsExporting(true);

    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9'; // 10.0 x 5.625 inches standard

      const hexAccent = activeTheme.accent.replace('#', '');
      const hexDark = activeTheme.bg.replace('#', '');

      slides.forEach((s, idx) => {
        const slide = pres.addSlide();

        // 1. COVER SLIDE
        if (s.layout === 'cover' || (idx === 0 && !s.bullets?.length && !s.items?.length)) {
          slide.background = { color: hexDark };

          // Top Pill Badge
          slide.addShape(pres.ShapeType.roundRect, {
            x: 3.6,
            y: 1.1,
            w: 2.8,
            h: 0.32,
            rectRadius: 0.16,
            fill: { color: 'FFFFFF', transparency: 85 },
            line: { color: hexAccent, width: 1 },
          });
          slide.addText('PRESENTATION DECK', {
            x: 3.6,
            y: 1.1,
            w: 2.8,
            h: 0.32,
            fontSize: 9,
            bold: true,
            color: hexAccent,
            align: 'center',
            fontFace: 'Microsoft YaHei',
          });

          // Main Title
          const titleText = cleanMarkdownText(s.title || '演示文稿');
          const titleFontSize = titleText.length > 25 ? 20 : titleText.length > 15 ? 24 : 28;

          slide.addText(titleText, {
            x: 0.8,
            y: 1.6,
            w: 8.4,
            h: 2.0,
            fontSize: titleFontSize,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            valign: 'middle',
            fontFace: 'Microsoft YaHei',
            breakLine: true,
          });

          // Subtitle
          if (s.subtitle) {
            slide.addText(cleanMarkdownText(s.subtitle), {
              x: 1.0,
              y: 3.8,
              w: 8.0,
              h: 0.8,
              fontSize: 13,
              color: 'CBD5E1',
              align: 'center',
              fontFace: 'Microsoft YaHei',
              breakLine: true,
            });
          }

          // Footer
          slide.addText('Generated by QuickGPT AI Presentation', {
            x: 1.0,
            y: 5.1,
            w: 8.0,
            h: 0.3,
            fontSize: 9,
            color: '64748B',
            align: 'center',
          });
        } else {
          // CONTENT SLIDES
          slide.background = { color: 'F8FAFC' };

          // Top Header Accent Bar
          slide.addShape(pres.ShapeType.rect, {
            x: 0,
            y: 0,
            w: 10.0,
            h: 0.06,
            fill: { color: hexAccent },
          });

          // Accent Marker
          slide.addShape(pres.ShapeType.roundRect, {
            x: 0.6,
            y: 0.4,
            w: 0.08,
            h: 0.35,
            rectRadius: 0.04,
            fill: { color: hexAccent },
          });

          // Slide Title
          slide.addText(cleanMarkdownText(s.title), {
            x: 0.78,
            y: 0.32,
            w: 8.6,
            h: 0.45,
            fontSize: 16,
            bold: true,
            color: '0F172A',
            fontFace: 'Microsoft YaHei',
            breakLine: true,
          });

          // Subtitle
          if (s.subtitle) {
            slide.addText(cleanMarkdownText(s.subtitle), {
              x: 0.78,
              y: 0.78,
              w: 8.6,
              h: 0.28,
              fontSize: 10,
              color: '64748B',
              fontFace: 'Microsoft YaHei',
              breakLine: true,
            });
          }

          const contentStartY = s.subtitle ? 1.2 : 1.0;
          const cardTotalHeight = 5.0 - contentStartY;
          const items: SlideItem[] = s.items && s.items.length > 0 ? s.items : s.bullets.map((b) => ({ description: b }));

          // 2. TIMELINE LAYOUT
          if (s.layout === 'timeline') {
            const count = Math.min(items.length, 4);
            const totalWidth = 8.8;
            const colGap = 0.2;
            const colWidth = (totalWidth - (count - 1) * colGap) / count;

            items.slice(0, 4).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: cardTotalHeight,
                rectRadius: 0.1,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              slide.addShape(pres.ShapeType.ellipse, {
                x: cardX + 0.15,
                y: contentStartY + 0.18,
                w: 0.3,
                h: 0.3,
                fill: { color: hexAccent },
              });
              slide.addText(`${iIdx + 1}`, {
                x: cardX + 0.15,
                y: contentStartY + 0.18,
                w: 0.3,
                h: 0.3,
                fontSize: 9,
                bold: true,
                color: 'FFFFFF',
                align: 'center',
                valign: 'middle',
              });

              slide.addText(cleanMarkdownText(item.title || `阶段 ${iIdx + 1}`), {
                x: cardX + 0.52,
                y: contentStartY + 0.14,
                w: colWidth - 0.6,
                h: 0.38,
                fontSize: 11,
                bold: true,
                color: '0F172A',
                fontFace: 'Microsoft YaHei',
                breakLine: true,
              });

              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.15,
                y: contentStartY + 0.6,
                w: colWidth - 0.3,
                h: cardTotalHeight - 0.75,
                fontSize: 9.5,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });
          } else if (s.layout === 'stats') {
            // 3. STATS LAYOUT
            const count = Math.min(items.length, 3);
            const totalWidth = 8.8;
            const colGap = 0.25;
            const colWidth = (totalWidth - (count - 1) * colGap) / count;

            items.slice(0, 3).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: cardTotalHeight,
                rectRadius: 0.1,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              slide.addText(cleanMarkdownText(item.title || `指标 ${iIdx + 1}`), {
                x: cardX + 0.2,
                y: contentStartY + 0.2,
                w: colWidth - 0.4,
                h: 0.4,
                fontSize: 12,
                bold: true,
                color: hexDark,
                fontFace: 'Microsoft YaHei',
                breakLine: true,
              });

              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.2,
                y: contentStartY + 0.7,
                w: colWidth - 0.4,
                h: cardTotalHeight - 1.1,
                fontSize: 10,
                color: '475569',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX + 0.2,
                y: contentStartY + cardTotalHeight - 0.25,
                w: 0.6,
                h: 0.05,
                rectRadius: 0.025,
                fill: { color: hexAccent },
              });
            });
          } else if (s.layout === 'grid2' && items.length === 2) {
            // 4. DUAL-COLUMN GRID LAYOUT
            const totalWidth = 8.8;
            const colGap = 0.3;
            const colWidth = (totalWidth - colGap) / 2;

            items.forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: cardTotalHeight,
                rectRadius: 0.1,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              if (item.title) {
                slide.addShape(pres.ShapeType.ellipse, {
                  x: cardX + 0.2,
                  y: contentStartY + 0.28,
                  w: 0.12,
                  h: 0.12,
                  fill: { color: hexAccent },
                });

                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.38,
                  y: contentStartY + 0.15,
                  w: colWidth - 0.55,
                  h: 0.38,
                  fontSize: 12,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              }

              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.2,
                y: contentStartY + 0.6,
                w: colWidth - 0.4,
                h: cardTotalHeight - 0.75,
                fontSize: 10,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });
          } else if ((s.layout === 'grid3' || s.layout === 'grid4') && items.length > 0) {
            // 5. 3/4-COLUMN GRID CARDS
            const count = s.layout === 'grid4' ? Math.min(items.length, 4) : Math.min(items.length, 3);
            const totalWidth = 8.8;
            const colGap = 0.2;
            const colWidth = (totalWidth - (count - 1) * colGap) / count;

            items.slice(0, count).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: contentStartY,
                w: colWidth,
                h: cardTotalHeight,
                rectRadius: 0.1,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              if (item.title) {
                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.15,
                  y: contentStartY + 0.15,
                  w: colWidth - 0.3,
                  h: 0.35,
                  fontSize: 11,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              }

              slide.addText(cleanMarkdownText(item.description || ''), {
                x: cardX + 0.15,
                y: contentStartY + (item.title ? 0.55 : 0.2),
                w: colWidth - 0.3,
                h: cardTotalHeight - (item.title ? 0.7 : 0.35),
                fontSize: 9.5,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });
          } else {
            // 6. STANDARD BULLET CARDS
            const bulletList = s.bullets.length > 0 ? s.bullets : items.map((it) => `${it.title ? it.title + ': ' : ''}${it.description || ''}`);
            const bulletCount = bulletList.length;
            const rowGap = 0.12;
            const cardH = (cardTotalHeight - (bulletCount - 1) * rowGap) / Math.max(1, bulletCount);

            bulletList.forEach((b, bIdx) => {
              const cardY = contentStartY + bIdx * (cardH + rowGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: 0.6,
                y: cardY,
                w: 8.8,
                h: cardH,
                rectRadius: 0.08,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 1 },
              });

              slide.addShape(pres.ShapeType.ellipse, {
                x: 0.8,
                y: cardY + cardH / 2 - 0.04,
                w: 0.08,
                h: 0.08,
                fill: { color: hexAccent },
              });

              slide.addText(cleanMarkdownText(b), {
                x: 1.0,
                y: cardY,
                w: 8.2,
                h: cardH,
                fontSize: 10,
                color: '334155',
                fontFace: 'Microsoft YaHei',
                valign: 'middle',
                breakLine: true,
              });
            });
          }

          // Slide Number Indicator
          slide.addText(`${idx + 1} / ${slides.length}`, {
            x: 8.0,
            y: 5.2,
            w: 1.5,
            h: 0.3,
            fontSize: 9,
            color: '94A3B8',
            align: 'right',
          });
        }

        if (s.notes) {
          slide.addNotes(s.notes);
        }
      });

      const firstTitle = cleanMarkdownText(slides[0]?.title || '演示文稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
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
          <div className="flex-1 min-h-0 flex flex-col justify-center my-auto w-full py-1">
            {/* 1. COVER SLIDE */}
            {currentSlide.layout === 'cover' ? (
              <div className="text-center my-auto space-y-2.5 sm:space-y-3.5 px-3 sm:px-8 w-full flex flex-col items-center justify-center">
                <div className="inline-flex items-center px-3 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-[10px] sm:text-xs font-bold tracking-wider text-emerald-200 uppercase shrink-0">
                  PRESENTATION DECK
                </div>
                <h1
                  className={`font-black tracking-tight text-white leading-snug break-words w-full text-center drop-shadow-sm ${
                    currentSlide.title.length > 25
                      ? 'text-base sm:text-lg md:text-xl lg:text-2xl'
                      : currentSlide.title.length > 15
                      ? 'text-lg sm:text-xl md:text-2xl lg:text-3xl'
                      : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'
                  }`}
                >
                  {renderFormattedText(currentSlide.title)}
                </h1>
                {currentSlide.subtitle && (
                  <p className="text-xs sm:text-sm md:text-base text-slate-200/90 font-medium w-full text-center leading-relaxed break-words px-2">
                    {renderFormattedText(currentSlide.subtitle)}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Regular Header: Title & Subtitle */}
                <div className="shrink-0 mb-2 sm:mb-2.5 w-full">
                  <div className="flex items-start gap-2 w-full">
                    <div className="w-1.5 h-4 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: activeTheme.accent }} />
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 dark:text-white leading-snug break-words flex-1">
                      {renderFormattedText(currentSlide.title)}
                    </h2>
                  </div>
                  {currentSlide.subtitle && (
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium ml-3.5 mt-0.5 break-words">
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
