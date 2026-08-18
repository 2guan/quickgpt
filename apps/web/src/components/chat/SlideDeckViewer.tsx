import React, { useState, useEffect, useRef } from 'react';
import pptxgen from 'pptxgenjs';
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Code,
  FileText,
  Copy,
  Check,
} from 'lucide-react';

export interface SlideItem {
  tag?: string;
  title?: string;
  description?: string;
  bullets?: string[];
}

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets: string[];
  items: SlideItem[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  quoteText?: string;
  sectionTitle?: string;
  notes?: string;
  layout: 'cover' | 'grid2' | 'grid3' | 'grid4' | 'grid5' | 'grid6' | 'timeline' | 'stats' | 'quote' | 'table' | 'content';
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
    const rawLines = sec.split('\n');
    let title = '';
    let subtitle = '';
    const rawBullets: string[] = [];
    const items: SlideItem[] = [];
    let notes = '';
    let quoteText = '';
    let sectionTitle = '';
    let explicitLayout: SlideData['layout'] | null = null;
    const tableLines: string[] = [];
    const quoteBlocks: string[][] = [];
    let currentQuoteBlock: string[] = [];
    let lastLineWasQuote = false;

    // Check if this section has multiple H3 headings (which serve as card headers like ### 🔷 PAMS ...)
    const h3Count = rawLines.filter((l) => l.trim().startsWith('### ')).length;
    const hasH3Cards = h3Count >= 2;

    for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
      const rawLine = rawLines[lineIdx];
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (lastLineWasQuote && currentQuoteBlock.length > 0) {
          quoteBlocks.push([...currentQuoteBlock]);
          currentQuoteBlock = [];
          lastLineWasQuote = false;
        }
        continue;
      }

      const layoutMatch = trimmed.match(/<!--\s*layout:\s*(cover|grid2|grid3|grid4|grid5|grid6|timeline|stats|quote|table|content)\s*-->/i);
      if (layoutMatch) {
        explicitLayout = layoutMatch[1].toLowerCase() as SlideData['layout'];
        continue;
      }

      if (trimmed.startsWith('> 演讲备注：') || trimmed.startsWith('> 备注：') || trimmed.startsWith('> Notes:')) {
        notes = trimmed.replace(/^>\s*(?:演讲备注：|备注：|Notes:)\s*/i, '').trim();
        continue;
      }

      if (/^>\s*(?:💡|📌|⭐|✨)?\s*(?:\*\*|__)?(?:演讲备注|备注|核心结语|核心定义|核心提示|演示目标|结语|总结)[：:\s]/.test(trimmed)) {
        notes = trimmed.replace(/^>\s*(?:💡|📌|⭐|✨)?\s*(?:\*\*|__)?(?:演讲备注|备注|核心结语|核心定义|核心提示|演示目标|结语|总结)[：:\s]*(?:\*\*|__)?\s*/i, '').trim();
        continue;
      }

      if (trimmed.startsWith('🙏') || trimmed.includes('感谢聆听') || trimmed.includes('欢迎交流')) {
        notes = trimmed.replace(/^#+\s*/, '').trim();
        continue;
      }

      if (trimmed.startsWith('> ')) {
        const qContent = trimmed.replace(/^>\s*/, '').trim();
        if (qContent) {
          currentQuoteBlock.push(qContent);
          lastLineWasQuote = true;
        }
        continue;
      } else {
        if (lastLineWasQuote && currentQuoteBlock.length > 0) {
          quoteBlocks.push([...currentQuoteBlock]);
          currentQuoteBlock = [];
          lastLineWasQuote = false;
        }
      }

      if (trimmed.startsWith('# ')) {
        title = trimmed.replace(/^#\s+/, '').trim();
      } else if (trimmed.startsWith('## ') && !title) {
        title = trimmed.replace(/^##\s+/, '').trim();
      } else if (trimmed.startsWith('### ')) {
        const h3Content = trimmed.replace(/^###\s+/, '').trim();
        // Determine if this first H3 is a slide subtitle or the first card header
        if (!subtitle && items.length === 0) {
          // Look ahead to see if the next non-empty line is another ###
          let nextNonEmptyLine = '';
          for (let nextIdx = lineIdx + 1; nextIdx < rawLines.length; nextIdx++) {
            const nextTrim = rawLines[nextIdx].trim();
            if (nextTrim) {
              nextNonEmptyLine = nextTrim;
              break;
            }
          }

          if (nextNonEmptyLine.startsWith('### ')) {
            // Consecutive ###: e.g. ## Title \n ### Subtitle \n ### Card1 -> this first one is subtitle
            subtitle = h3Content;
          } else if (h3Content.startsWith('Step') || h3Content.startsWith('🔹 Step') || h3Content.startsWith('Skill') || h3Content.startsWith('阶段')) {
            // First H3 is directly a step/skill card
            items.push({ title: h3Content, description: '', bullets: [] });
          } else if (h3Count >= 3) {
            // E.g. 1 subtitle H3 + 2 card H3s (total 3) -> first one is subtitle
            subtitle = h3Content;
          } else if (h3Count === 1) {
            // Only 1 H3 in entire slide -> slide subtitle
            subtitle = h3Content;
          } else {
            // 2 H3s in total: if has bullets right after without another H3, this is card 1
            items.push({ title: h3Content, description: '', bullets: [] });
          }
        } else {
          // Subsequent ### headers are ALWAYS card items
          items.push({ title: h3Content, description: '', bullets: [] });
        }
      } else if (trimmed.startsWith('#### ') && items.length > 0) {
        const h4Title = trimmed.replace(/^####\s+/, '').trim();
        items.push({ title: h4Title, description: '', bullets: [] });
      } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        tableLines.push(trimmed);
      } else {
        const isIndented = /^(\s{2,}|\t+)[-*]\s+/.test(rawLine);
        const isTopLevelBullet = /^[-*]\s+|\d+[\.、]\s*/.test(trimmed);

        if (isIndented && items.length > 0) {
          // Nested sub-bullet under the current item (with leading spaces or tabs)
          const subBullet = trimmed.replace(/^[-*]\s+|\d+[\.、]\s*/, '').trim();
          const lastItem = items[items.length - 1];
          if (!lastItem.bullets) lastItem.bullets = [];
          lastItem.bullets.push(subBullet);
        } else if (isTopLevelBullet) {
          const cleaned = trimmed.replace(/^[-*]\s+|\d+[\.、]\s*/, '').trim();
          rawBullets.push(cleaned);

          if (hasH3Cards && items.length > 0) {
            // When cards are defined by H3 headers, ALL subsequent bullets belong to the active H3 card
            const lastItem = items[items.length - 1];
            if (!lastItem.bullets) lastItem.bullets = [];
            lastItem.bullets.push(cleaned);
          } else {
            const boldMatch = cleaned.match(/^\*\*([^*]+)\*\*[：:\s]*(.*)$/);
            const bracketMatch = cleaned.match(/^【([^】]+)】[：:\s]*(.*)$/);
            const colonMatch = cleaned.match(/^([^：:\s]{2,16})[：:](.+)$/);

            // If this top-level bullet has bold/bracket/colon title, it is a standalone card
            if (boldMatch) {
              items.push({ title: boldMatch[1].trim(), description: boldMatch[2].trim(), bullets: [] });
            } else if (bracketMatch) {
              items.push({ tag: bracketMatch[1].trim(), title: bracketMatch[1].trim(), description: bracketMatch[2].trim(), bullets: [] });
            } else if (colonMatch && (colonMatch[1].startsWith('阶段') || colonMatch[1].startsWith('Skill') || colonMatch[1].startsWith('Step') || colonMatch[1].length <= 10)) {
              items.push({ title: colonMatch[1].trim(), description: colonMatch[2].trim(), bullets: [] });
            } else {
              items.push({ description: cleaned, bullets: [] });
            }
          }
        } else if (!title) {
          title = trimmed;
        } else if (!subtitle && rawBullets.length === 0 && tableLines.length === 0 && items.length === 0) {
          subtitle = trimmed;
        } else if (items.length > 0) {
          // Non-bullet text under an existing card item (e.g. **解决痛点**：...)
          const lastItem = items[items.length - 1];
          if (!lastItem.description) {
            lastItem.description = trimmed;
          } else {
            if (!lastItem.bullets) lastItem.bullets = [];
            lastItem.bullets.push(trimmed);
          }
        } else {
          rawBullets.push(trimmed);
          items.push({ description: trimmed, bullets: [] });
        }
      }
    }

    if (currentQuoteBlock.length > 0) {
      quoteBlocks.push([...currentQuoteBlock]);
    }

    // Process Quote Blocks
    if (quoteBlocks.length >= 2) {
      // Multiple quote blocks (e.g. 3-step quotes: Step 1, Step 2, Step 3)
      const quoteItems: SlideItem[] = [];
      quoteBlocks.forEach((block) => {
        if (block.length >= 2) {
          const b1 = block[0].replace(/^\*\*|\*\*$/g, '').trim();
          const b2 = block.slice(1).map((l) => l.replace(/^\*\*|\*\*$/g, '').trim()).join('\n');
          quoteItems.push({ title: b1, description: b2, bullets: [] });
        } else if (block.length === 1) {
          const line = block[0];
          const boldMatch = line.match(/^\*\*([^*]+)\*\*[：:\s]*(.*)$/);
          if (boldMatch) {
            quoteItems.push({ title: boldMatch[1].trim(), description: boldMatch[2].trim(), bullets: [] });
          } else {
            quoteItems.push({ description: line, bullets: [] });
          }
        }
      });

      // Check if there was trailing conclusion text parsed into items
      if (items.length > 0) {
        const trailing = items.map((it) => `${it.title ? it.title + ': ' : ''}${it.description || ''}`).join('\n');
        if (trailing) {
          quoteText = trailing;
        }
      }
      items.length = 0;
      items.push(...quoteItems);
    } else if (quoteBlocks.length === 1) {
      quoteText = quoteBlocks[0].join('\n');
    }

    // Parse Markdown Table if present
    let parsedTable: SlideData['table'] | undefined = undefined;
    if (tableLines.length >= 2) {
      const headerLine = tableLines[0];
      const headers = headerLine
        .split('|')
        .map((h) => h.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      const rows: string[][] = [];
      for (let rIdx = 1; rIdx < tableLines.length; rIdx++) {
        const rowStr = tableLines[rIdx];
        if (/^\|?[\s-:]+\|?$/.test(rowStr) || rowStr.includes('---')) {
          continue; // skip separator row |---|---|
        }
        const cells = rowStr
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (headers.length > 0 && rows.length > 0) {
        parsedTable = { headers, rows };
      }
    }

    if (title || rawBullets.length > 0 || parsedTable) {
      const isCover = i === 0 && rawBullets.length === 0 && !parsedTable;
      let computedLayout: SlideData['layout'] = explicitLayout || (parsedTable ? 'table' : (isCover ? 'cover' : 'content'));

      if (!explicitLayout && !isCover && !parsedTable) {
        const titleLower = title.toLowerCase();
        const hasTimeKeywords = titleLower.includes('时序') || titleLower.includes('里程碑') || titleLower.includes('规划') || titleLower.includes('路线图') || titleLower.includes('发展历程') || titleLower.includes('阶段') || titleLower.includes('演进') || titleLower.includes('步骤') || titleLower.includes('流程');
        const hasStatsKeywords = titleLower.includes('数据') || titleLower.includes('成效') || titleLower.includes('指标') || titleLower.includes('概览') || titleLower.includes('成果') || titleLower.includes('核心亮点');
        const hasCompareKeywords = titleLower.includes('对比') || titleLower.includes('vs') || titleLower.includes('比较') || titleLower.includes('优劣') || titleLower.includes('传统') || titleLower.includes('痛点');

        const count = items.length;

        if (hasTimeKeywords && count >= 2 && count <= 5) {
          computedLayout = 'timeline';
        } else if (hasStatsKeywords && count >= 2 && count <= 4) {
          computedLayout = 'stats';
        } else if (hasCompareKeywords && count === 2) {
          computedLayout = 'grid2';
        } else if (count === 2) {
          computedLayout = 'grid2'; // 2 columns
        } else if (count === 3) {
          computedLayout = 'grid3'; // 3 columns
        } else if (count === 4) {
          computedLayout = 'grid4'; // 2x2 grid matrix
        } else if (count === 5) {
          computedLayout = 'grid5'; // 5 cards timeline-grid
        } else if (count === 6) {
          computedLayout = 'grid6'; // 2x3 matrix
        } else {
          computedLayout = 'content'; // Elegant multi-row stacked cards
        }
      }

      slides.push({
        title: title || `幻灯片 ${i + 1}`,
        subtitle,
        bullets: rawBullets,
        items,
        table: parsedTable,
        quoteText,
        sectionTitle,
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
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const [fullscreenScale, setFullscreenScale] = useState(1);

  const activeTheme = COLOR_THEMES[themeIdx];
  const totalSlides = slides.length;

  const handleCopyRaw = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

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

  // Dynamically calculate proportional scale for fullscreen mode (standard 16:9 base: 960x540)
  useEffect(() => {
    if (!isFullscreen) return;

    const updateScale = () => {
      if (!fullscreenContainerRef.current) return;
      const { clientWidth, clientHeight } = fullscreenContainerRef.current;
      const availW = Math.max(200, clientWidth - 48);
      const availH = Math.max(200, clientHeight - 48);
      const s = Math.min(availW / 960, availH / 540);
      setFullscreenScale(s);
    };

    updateScale();
    const raf = requestAnimationFrame(updateScale);
    window.addEventListener('resize', updateScale);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateScale);
    };
  }, [isFullscreen]);

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
          const titleFontSize = titleText.length > 25 ? 18 : titleText.length > 15 ? 22 : 26;

          slide.addText(titleText, {
            x: 0.8,
            y: 1.4,
            w: 8.4,
            h: 1.6,
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
              y: 2.9,
              w: 8.0,
              h: 0.5,
              fontSize: 11.5,
              color: 'CBD5E1',
              align: 'center',
              fontFace: 'Microsoft YaHei',
              breakLine: true,
            });
          }

          // Highlight Quote / Notes Pill on Cover
          const coverPill = s.notes || s.quoteText;
          if (coverPill && !s.table) {
            slide.addShape(pres.ShapeType.roundRect, {
              x: 1.2,
              y: s.subtitle ? 3.6 : 3.2,
              w: 7.6,
              h: 0.46,
              rectRadius: 0.23,
              fill: { color: 'FFFFFF', transparency: 85 },
              line: { color: 'FFFFFF', width: 0.6, transparency: 60 },
            });
            slide.addText(cleanMarkdownText(coverPill), {
              x: 1.3,
              y: s.subtitle ? 3.6 : 3.2,
              w: 7.4,
              h: 0.46,
              fontSize: 9.5,
              bold: true,
              color: 'FFFFFF',
              align: 'center',
              valign: 'middle',
              fontFace: 'Microsoft YaHei',
            });
          }

          // Embedded Table on Cover Slide if present
          if (s.table) {
            const tableRows: any[][] = [
              s.table.headers.map((h) => ({
                text: cleanMarkdownText(h),
                options: { fill: { color: hexAccent }, color: 'FFFFFF', bold: true, fontSize: 9, align: 'center' },
              })),
              ...s.table.rows.map((row) =>
                row.map((cell) => ({
                  text: cleanMarkdownText(cell),
                  options: { fill: { color: 'FFFFFF', transparency: 90 }, color: 'FFFFFF', fontSize: 8.5, align: 'center' },
                }))
              ),
            ];

            slide.addTable(tableRows, {
              x: 1.5,
              y: 3.8,
              w: 7.0,
              h: 1.1,
              border: { type: 'solid', pt: 0.5, color: 'FFFFFF' },
              margin: [0.04, 0.08, 0.04, 0.08],
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

          const contentStartY = s.subtitle ? 1.25 : 1.05;
          const items: SlideItem[] = s.items && s.items.length > 0 ? s.items : s.bullets.map((b) => ({ description: b }));

          // Exact available content zone: from contentStartY to 5.25 (leaving 0.35 padding at bottom)
          const contentAvailH = 5.25 - contentStartY;

          // Helper to dynamically calculate centered start Y position for any block
          const getCenteredY = (totalBlockH: number) => {
            const extra = contentAvailH - totalBlockH;
            return contentStartY + Math.max(0.1, extra / 2);
          };

          // 2. TIMELINE LAYOUT (2~5 stages) - True Dynamic Vertical Centering (1:1 with Web my-auto)
          if (s.layout === 'timeline') {
            const count = Math.min(items.length, 5);
            const totalWidth = 8.8;
            const colGap = 0.2;
            const colWidth = (totalWidth - (count - 1) * colGap) / count;
            const timelineH = 2.15;
            const notesGap = 0.3;
            const notesH = s.notes ? 0.38 : 0;
            const totalBlockH = timelineH + (s.notes ? notesGap + notesH : 0);
            const timelineY = getCenteredY(totalBlockH);

            // Horizontal connecting background line behind number badges
            slide.addShape(pres.ShapeType.rect, {
              x: 0.8,
              y: timelineY + 0.3,
              w: 8.4,
              h: 0.02,
              fill: { color: 'E2E8F0' },
            });

            items.slice(0, 5).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);
              const cardY = timelineY;

              // White Card with subtle border and rounded corners
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: cardY,
                w: colWidth,
                h: timelineH,
                rectRadius: 0.12,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 0.8 },
              });

              // Number Badge with ring effect
              slide.addShape(pres.ShapeType.ellipse, {
                x: cardX + 0.15,
                y: cardY + 0.18,
                w: 0.28,
                h: 0.28,
                fill: { color: hexAccent },
                line: { color: 'FFFFFF', width: 1.5 },
              });
              slide.addText(`${iIdx + 1}`, {
                x: cardX + 0.15,
                y: cardY + 0.18,
                w: 0.28,
                h: 0.28,
                fontSize: 9,
                bold: true,
                color: 'FFFFFF',
                align: 'center',
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
              });

              // Title
              slide.addText(cleanMarkdownText(item.title || `阶段 ${iIdx + 1}`), {
                x: cardX + 0.48,
                y: cardY + 0.12,
                w: colWidth - 0.55,
                h: 0.38,
                fontSize: 10.5,
                bold: true,
                color: '0F172A',
                fontFace: 'Microsoft YaHei',
                breakLine: true,
              });

              // Description
              let desc = cleanMarkdownText(item.description || '');
              if (item.bullets && item.bullets.length > 0) {
                const subText = item.bullets.map((b) => `• ${cleanMarkdownText(b)}`).join('\n');
                desc = desc ? `${desc}\n\n${subText}` : subText;
              }

              slide.addText(desc, {
                x: cardX + 0.15,
                y: cardY + 0.58,
                w: colWidth - 0.3,
                h: timelineH - 0.68,
                fontSize: 9,
                color: '475569',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });

            if (s.notes) {
              slide.addShape(pres.ShapeType.roundRect, {
                x: 0.6,
                y: timelineY + timelineH + notesGap,
                w: 8.8,
                h: notesH,
                rectRadius: 0.08,
                fill: { color: 'F0FDF4' },
                line: { color: hexAccent, width: 0.5 },
              });
              slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                x: 0.75,
                y: timelineY + timelineH + notesGap,
                w: 8.5,
                h: notesH,
                fontSize: 9,
                color: '065F46',
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
              });
            }
          } else if (s.layout === 'stats') {
            // 3. STATS LAYOUT (2~6 KPI Cards) - Centered
            const count = items.length;
            if (count <= 3) {
              // 1 Row (2~3 cards)
              const cardCount = Math.min(count, 3);
              const totalWidth = 8.8;
              const colGap = 0.25;
              const colWidth = (totalWidth - (cardCount - 1) * colGap) / cardCount;
              const statsH = 2.6;
              const notesGap = 0.25;
              const notesH = s.notes ? 0.38 : 0;
              const totalBlockH = statsH + (s.notes ? notesGap + notesH : 0);
              const statsY = getCenteredY(totalBlockH);

              items.slice(0, 3).forEach((item, iIdx) => {
                const cardX = 0.6 + iIdx * (colWidth + colGap);
                const cardY = statsY;

                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX,
                  y: cardY,
                  w: colWidth,
                  h: statsH,
                  rectRadius: 0.12,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 0.8 },
                });

                // Tag Badge
                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX + colWidth - 0.6,
                  y: cardY + 0.15,
                  w: 0.45,
                  h: 0.22,
                  rectRadius: 0.04,
                  fill: { color: hexAccent },
                });
                slide.addText('KPI', {
                  x: cardX + colWidth - 0.6,
                  y: cardY + 0.15,
                  w: 0.45,
                  h: 0.22,
                  fontSize: 7.5,
                  bold: true,
                  color: 'FFFFFF',
                  align: 'center',
                  valign: 'middle',
                });

                slide.addText(cleanMarkdownText(item.title || `指标 ${iIdx + 1}`), {
                  x: cardX + 0.18,
                  y: cardY + 0.15,
                  w: colWidth - 0.85,
                  h: 0.35,
                  fontSize: 11,
                  bold: true,
                  color: hexDark,
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });

                let desc = cleanMarkdownText(item.description || '');
                if (item.bullets && item.bullets.length > 0) {
                  const subText = item.bullets.map((b) => cleanMarkdownText(b)).join('\n');
                  desc = desc ? `${desc}\n${subText}` : subText;
                }

                slide.addText(desc, {
                  x: cardX + 0.18,
                  y: cardY + 0.58,
                  w: colWidth - 0.36,
                  h: statsH - 0.9,
                  fontSize: 8.5,
                  color: '475569',
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });

                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX + 0.18,
                  y: cardY + statsH - 0.22,
                  w: 0.6,
                  h: 0.05,
                  rectRadius: 0.025,
                  fill: { color: hexAccent },
                });
              });

              if (s.notes) {
                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: statsY + statsH + notesGap,
                  w: 8.8,
                  h: notesH,
                  rectRadius: 0.08,
                  fill: { color: 'F0FDF4' },
                  line: { color: hexAccent, width: 0.5 },
                });
                slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                  x: 0.75,
                  y: statsY + statsH + notesGap,
                  w: 8.5,
                  h: notesH,
                  fontSize: 8.5,
                  color: '065F46',
                  valign: 'middle',
                  fontFace: 'Microsoft YaHei',
                });
              }
            } else {
              // 2 Rows Grid for 4~6 KPI cards
              const cols = 3;
              const cardCount = Math.min(count, 6);
              const cellW = (8.8 - 2 * 0.2) / 3;
              const cellH = 1.35;
              const rowGap = 0.15;
              const notesGap = 0.2;
              const notesH = s.notes ? 0.35 : 0;
              const totalBlockH = 2 * cellH + rowGap + (s.notes ? notesGap + notesH : 0);
              const statsY = getCenteredY(totalBlockH);

              items.slice(0, cardCount).forEach((item, iIdx) => {
                const r = Math.floor(iIdx / cols);
                const c = iIdx % cols;
                const cardX = 0.6 + c * (cellW + 0.2);
                const cardY = statsY + r * (cellH + rowGap);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX,
                  y: cardY,
                  w: cellW,
                  h: cellH,
                  rectRadius: 0.08,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 0.75 },
                });

                slide.addText(cleanMarkdownText(item.title || `指标 ${iIdx + 1}`), {
                  x: cardX + 0.15,
                  y: cardY + 0.1,
                  w: cellW - 0.75,
                  h: 0.28,
                  fontSize: 9.5,
                  bold: true,
                  color: hexDark,
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });

                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX + cellW - 0.55,
                  y: cardY + 0.1,
                  w: 0.4,
                  h: 0.2,
                  rectRadius: 0.04,
                  fill: { color: hexAccent },
                });
                slide.addText('KPI', {
                  x: cardX + cellW - 0.55,
                  y: cardY + 0.1,
                  w: 0.4,
                  h: 0.2,
                  fontSize: 7,
                  bold: true,
                  color: 'FFFFFF',
                  align: 'center',
                  valign: 'middle',
                });

                let desc = cleanMarkdownText(item.description || '');
                if (item.bullets && item.bullets.length > 0) {
                  const subText = item.bullets.map((b) => cleanMarkdownText(b)).join('\n');
                  desc = desc ? `${desc}\n${subText}` : subText;
                }

                slide.addText(desc, {
                  x: cardX + 0.15,
                  y: cardY + 0.42,
                  w: cellW - 0.3,
                  h: cellH - 0.5,
                  fontSize: 8,
                  color: '475569',
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });
              });

              if (s.notes) {
                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: statsY + 2 * cellH + rowGap + notesGap,
                  w: 8.8,
                  h: notesH,
                  rectRadius: 0.08,
                  fill: { color: 'F0FDF4' },
                  line: { color: hexAccent, width: 0.5 },
                });
                slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                  x: 0.75,
                  y: statsY + 2 * cellH + rowGap + notesGap,
                  w: 8.5,
                  h: notesH,
                  fontSize: 8.5,
                  color: '065F46',
                  valign: 'middle',
                  fontFace: 'Microsoft YaHei',
                });
              }
            }
          } else if (s.layout === 'grid2' && items.length >= 2) {
            // 4. DUAL-COLUMN HERO PILLARS (grid2) - Centered
            const totalWidth = 8.8;
            const colGap = 0.25;
            const colWidth = (totalWidth - colGap) / 2;
            const maxBullets = Math.max(items[0]?.bullets?.length || 0, items[1]?.bullets?.length || 0);
            const grid2H = maxBullets >= 4 ? 2.85 : 2.4;
            const grid2Y = getCenteredY(grid2H);

            items.slice(0, 2).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);
              const cardY = grid2Y;
              const cardBg = iIdx === 1 ? 'F0FDF4' : 'FFFFFF';
              const cardLine = iIdx === 1 ? hexAccent : 'E2E8F0';

              // Main Container Card
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: cardY,
                w: colWidth,
                h: grid2H,
                rectRadius: 0.12,
                fill: { color: cardBg },
                line: { color: cardLine, width: 0.8 },
              });

              // Card Title & Header separator
              if (item.title) {
                slide.addShape(pres.ShapeType.ellipse, {
                  x: cardX + 0.18,
                  y: cardY + 0.2,
                  w: 0.1,
                  h: 0.1,
                  fill: { color: hexAccent },
                });

                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.35,
                  y: cardY + 0.12,
                  w: colWidth - 0.5,
                  h: 0.28,
                  fontSize: 11,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });

                // Title bottom subtle line
                slide.addShape(pres.ShapeType.rect, {
                  x: cardX + 0.18,
                  y: cardY + 0.42,
                  w: colWidth - 0.36,
                  h: 0.01,
                  fill: { color: 'E2E8F0' },
                });
              }

              // Description (e.g. 解决痛点：...)
              let curY = cardY + (item.title ? 0.48 : 0.18);
              if (item.description) {
                slide.addText(cleanMarkdownText(item.description), {
                  x: cardX + 0.18,
                  y: curY,
                  w: colWidth - 0.36,
                  h: 0.38,
                  fontSize: 8.5,
                  color: '64748B',
                  italic: true,
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });
                curY += 0.4;
              }

              // Sub-bullets
              if (item.bullets && item.bullets.length > 0) {
                const bulletLines = item.bullets.map((b) => `•  ${cleanMarkdownText(b)}`).join('\n');
                slide.addText(bulletLines, {
                  x: cardX + 0.18,
                  y: curY,
                  w: colWidth - 0.36,
                  h: cardY + grid2H - curY - 0.1,
                  fontSize: 8.5,
                  color: '334155',
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });
              }
            });
          } else if (s.layout === 'grid3' && items.length >= 3) {
            // 5. THREE-COLUMN PILLARS (grid3) - True Dynamic Vertical Centering (1:1 with Web View)
            const totalWidth = 8.8;
            const colGap = 0.2;
            const colWidth = (totalWidth - 2 * colGap) / 3;
            const hasLongContent = items.some((it) => (it.bullets && it.bullets.length > 0) || (it.description && it.description.length > 30));
            const grid3H = hasLongContent ? 2.85 : 2.2;
            const notesGap = 0.25;
            const notesH = s.notes ? 0.38 : 0;
            const totalBlockH = grid3H + (s.notes ? notesGap + notesH : 0);
            const grid3Y = getCenteredY(totalBlockH);

            items.slice(0, 3).forEach((item, iIdx) => {
              const cardX = 0.6 + iIdx * (colWidth + colGap);
              const cardY = grid3Y;

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: cardY,
                w: colWidth,
                h: grid3H,
                rectRadius: 0.12,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 0.8 },
              });

              // Vertical accent bar next to title
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX + 0.15,
                y: cardY + 0.16,
                w: 0.05,
                h: 0.22,
                rectRadius: 0.025,
                fill: { color: hexAccent },
              });

              if (item.title) {
                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.25,
                  y: cardY + 0.1,
                  w: colWidth - 0.38,
                  h: 0.32,
                  fontSize: 10,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              }

              let curY = cardY + 0.42;
              if (item.description) {
                slide.addText(cleanMarkdownText(item.description), {
                  x: cardX + 0.15,
                  y: curY,
                  w: colWidth - 0.3,
                  h: 0.38,
                  fontSize: 8.5,
                  color: '64748B',
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });
                curY += 0.4;
              }

              if (item.bullets && item.bullets.length > 0) {
                const bulletLines = item.bullets.map((b) => `•  ${cleanMarkdownText(b)}`).join('\n\n');
                slide.addText(bulletLines, {
                  x: cardX + 0.15,
                  y: curY,
                  w: colWidth - 0.3,
                  h: cardY + grid3H - curY - 0.1,
                  fontSize: 8,
                  color: '334155',
                  fontFace: 'Microsoft YaHei',
                  valign: 'top',
                  breakLine: true,
                });
              }
            });

            if (s.notes) {
              slide.addShape(pres.ShapeType.roundRect, {
                x: 0.6,
                y: grid3Y + grid3H + notesGap,
                w: 8.8,
                h: notesH,
                rectRadius: 0.08,
                fill: { color: 'F0FDF4' },
                line: { color: hexAccent, width: 0.5 },
              });
              slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                x: 0.75,
                y: grid3Y + grid3H + notesGap,
                w: 8.5,
                h: notesH,
                fontSize: 8.5,
                color: '065F46',
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
              });
            }
          } else if (s.layout === 'grid4' && items.length >= 4) {
            // 6. 2x2 MATRIX GRID (grid4) - Centered
            const cellW = 4.25;
            const cellH = 1.6;
            const rowGap = 0.15;
            const notesGap = 0.2;
            const notesH = s.notes ? 0.32 : 0;
            const totalBlockH = 2 * cellH + rowGap + (s.notes ? notesGap + notesH : 0);
            const grid4Y = getCenteredY(totalBlockH);

            items.slice(0, 4).forEach((item, iIdx) => {
              const row = Math.floor(iIdx / 2);
              const col = iIdx % 2;
              const cardX = 0.6 + col * (cellW + 0.3);
              const cardY = grid4Y + row * (cellH + rowGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: cardY,
                w: cellW,
                h: cellH,
                rectRadius: 0.08,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 0.75 },
              });

              // Letter Badge (A, B, C, D)
              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX + 0.12,
                y: cardY + 0.12,
                w: 0.24,
                h: 0.24,
                rectRadius: 0.04,
                fill: { color: hexAccent },
              });
              slide.addText(String.fromCharCode(65 + iIdx), {
                x: cardX + 0.12,
                y: cardY + 0.12,
                w: 0.24,
                h: 0.24,
                fontSize: 8,
                bold: true,
                color: 'FFFFFF',
                align: 'center',
                valign: 'middle',
              });

              if (item.title) {
                slide.addText(cleanMarkdownText(item.title), {
                  x: cardX + 0.42,
                  y: cardY + 0.08,
                  w: cellW - 0.5,
                  h: 0.28,
                  fontSize: 9.5,
                  bold: true,
                  color: '0F172A',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              }

              let desc = cleanMarkdownText(item.description || '');
              if (item.bullets && item.bullets.length > 0) {
                const subText = item.bullets.map((b) => `• ${cleanMarkdownText(b)}`).join('\n');
                desc = desc ? `${desc}\n${subText}` : subText;
              }

              slide.addText(desc, {
                x: cardX + 0.42,
                y: cardY + 0.38,
                w: cellW - 0.5,
                h: cellH - 0.45,
                fontSize: 8,
                color: '475569',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });

            if (s.notes) {
              slide.addShape(pres.ShapeType.roundRect, {
                x: 0.6,
                y: grid4Y + 2 * cellH + rowGap + notesGap,
                w: 8.8,
                h: notesH,
                rectRadius: 0.06,
                fill: { color: 'F0FDF4' },
                line: { color: hexAccent, width: 0.5 },
              });
              slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                x: 0.75,
                y: grid4Y + 2 * cellH + rowGap + notesGap,
                w: 8.5,
                h: notesH,
                fontSize: 8,
                color: '065F46',
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
              });
            }
          } else if (s.layout === 'grid5' || s.layout === 'grid6') {
            // 7. 6-CARD / 5-CARD MATRICES - Centered with nested sub-bullet support
            const count = Math.min(items.length, s.layout === 'grid6' ? 6 : 5);
            const cols = 3;
            const rows = 2;
            const cellW = (8.8 - (cols - 1) * 0.2) / cols;
            const cellH = 1.45;
            const rowGap = 0.15;
            const grid6Y = getCenteredY(2 * cellH + rowGap);

            items.slice(0, count).forEach((item, iIdx) => {
              const r = Math.floor(iIdx / cols);
              const c = iIdx % cols;
              const cardX = 0.6 + c * (cellW + 0.2);
              const cardY = grid6Y + r * (cellH + rowGap);

              slide.addShape(pres.ShapeType.roundRect, {
                x: cardX,
                y: cardY,
                w: cellW,
                h: cellH,
                rectRadius: 0.06,
                fill: { color: 'FFFFFF' },
                line: { color: 'E2E8F0', width: 0.75 },
              });

              slide.addShape(pres.ShapeType.ellipse, {
                x: cardX + 0.12,
                y: cardY + 0.12,
                w: 0.08,
                h: 0.08,
                fill: { color: hexAccent },
              });

              slide.addText(cleanMarkdownText(item.title || `要点 ${iIdx + 1}`), {
                x: cardX + 0.24,
                y: cardY + 0.08,
                w: cellW - 0.32,
                h: 0.25,
                fontSize: 9,
                bold: true,
                color: '0F172A',
                fontFace: 'Microsoft YaHei',
                breakLine: true,
              });

              let desc = cleanMarkdownText(item.description || '');
              if (item.bullets && item.bullets.length > 0) {
                const subText = item.bullets.map((b) => `• ${cleanMarkdownText(b)}`).join('\n');
                desc = desc ? `${desc}\n${subText}` : subText;
              }

              slide.addText(desc, {
                x: cardX + 0.12,
                y: cardY + 0.35,
                w: cellW - 0.24,
                h: cellH - 0.42,
                fontSize: 7.5,
                color: '475569',
                fontFace: 'Microsoft YaHei',
                valign: 'top',
                breakLine: true,
              });
            });
          } else if (s.layout === 'quote') {
            // 8. QUOTE LAYOUT - Centered & 1:1 with Web View
            const hasTable = !!s.table;
            const hasItems = items.length > 0;

            if (hasTable && s.table) {
              // Dual-Panel Layout: Left Quotes (w: 3.8) + Right Table (w: 4.7) + Bottom Notes
              const leftW = 3.8;
              const rightW = 4.7;
              const mainH = 2.45;
              const notesH = s.notes ? 0.38 : 0;
              const notesGap = 0.2;
              const totalBlockH = mainH + (s.notes ? notesGap + notesH : 0);
              const quoteStartY = getCenteredY(totalBlockH);

              // Left Column: 3 Quotes
              const quoteCount = Math.min(items.length, 3);
              const qH = (mainH - (quoteCount - 1) * 0.12) / quoteCount;
              items.slice(0, 3).forEach((it, qIdx) => {
                const qY = quoteStartY + qIdx * (qH + 0.12);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: qY,
                  w: leftW,
                  h: qH,
                  rectRadius: 0.08,
                  fill: { color: 'F0FDF4' },
                  line: { color: 'E2E8F0', width: 0.75 },
                });

                // Left green accent line
                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: qY,
                  w: 0.06,
                  h: qH,
                  rectRadius: 0.03,
                  fill: { color: hexAccent },
                });

                const fullText = it.title ? `${it.title}：${it.description}` : it.description || '';
                slide.addText(cleanMarkdownText(fullText), {
                  x: 0.78,
                  y: qY + 0.04,
                  w: leftW - 0.28,
                  h: qH - 0.08,
                  fontSize: 8.5,
                  color: '065F46',
                  fontFace: 'Microsoft YaHei',
                  valign: 'middle',
                  breakLine: true,
                });
              });

              // Right Column: Native Table
              const tableRows: any[][] = [
                s.table.headers.map((h) => ({
                  text: cleanMarkdownText(h),
                  options: { fill: { color: hexAccent }, color: 'FFFFFF', bold: true, fontSize: 8.5, align: 'center' },
                })),
                ...s.table.rows.slice(0, 5).map((row, rIdx) =>
                  row.map((cell) => ({
                    text: cleanMarkdownText(cell),
                    options: {
                      fill: { color: rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF' },
                      color: '1E293B',
                      fontSize: 8,
                      align: 'left',
                    },
                  }))
                ),
              ];

              slide.addTable(tableRows, {
                x: 4.7,
                y: quoteStartY,
                w: rightW,
                h: mainH,
                border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
                margin: [0.03, 0.06, 0.03, 0.06],
              });

              // Bottom Notes
              if (s.notes) {
                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: quoteStartY + mainH + notesGap,
                  w: 8.8,
                  h: notesH,
                  rectRadius: 0.08,
                  fill: { color: 'F0FDF4' },
                  line: { color: hexAccent, width: 0.5 },
                });
                slide.addText(`💡 ${cleanMarkdownText(s.notes)}`, {
                  x: 0.75,
                  y: quoteStartY + mainH + notesGap,
                  w: 8.5,
                  h: notesH,
                  fontSize: 8.5,
                  color: '065F46',
                  valign: 'middle',
                  fontFace: 'Microsoft YaHei',
                });
              }
            } else if (hasItems) {
              // 3 Cards on Top + Conclusion Banner on Bottom
              const takeCount = Math.min(items.length, 3);
              const takeW = (8.8 - (takeCount - 1) * 0.2) / takeCount;
              const takeH = 1.6;
              const quoteBannerH = s.quoteText ? 0.75 : 0;
              const gap = 0.25;
              const totalBlockH = takeH + (s.quoteText ? gap + quoteBannerH : 0);
              const quoteStartY = getCenteredY(totalBlockH);

              // 3 Top Cards
              items.slice(0, 3).forEach((it, tIdx) => {
                const tX = 0.6 + tIdx * (takeW + 0.2);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: tX,
                  y: quoteStartY,
                  w: takeW,
                  h: takeH,
                  rectRadius: 0.1,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 0.8 },
                });

                if (it.title) {
                  slide.addShape(pres.ShapeType.roundRect, {
                    x: tX + 0.15,
                    y: quoteStartY + 0.16,
                    w: 0.05,
                    h: 0.2,
                    rectRadius: 0.025,
                    fill: { color: hexAccent },
                  });

                  slide.addText(cleanMarkdownText(it.title), {
                    x: tX + 0.25,
                    y: quoteStartY + 0.1,
                    w: takeW - 0.38,
                    h: 0.3,
                    fontSize: 10,
                    bold: true,
                    color: '0F172A',
                    fontFace: 'Microsoft YaHei',
                    breakLine: true,
                  });

                  slide.addShape(pres.ShapeType.rect, {
                    x: tX + 0.15,
                    y: quoteStartY + 0.42,
                    w: takeW - 0.3,
                    h: 0.01,
                    fill: { color: 'E2E8F0' },
                  });
                }

                slide.addText(cleanMarkdownText(it.description || ''), {
                  x: tX + 0.15,
                  y: quoteStartY + (it.title ? 0.5 : 0.15),
                  w: takeW - 0.3,
                  h: takeH - (it.title ? 0.6 : 0.25),
                  fontSize: 9,
                  color: '475569',
                  valign: 'top',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              });

              // Bottom Conclusion Banner
              if (s.quoteText) {
                const bannerY = quoteStartY + takeH + gap;
                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: bannerY,
                  w: 8.8,
                  h: quoteBannerH,
                  rectRadius: 0.08,
                  fill: { color: 'F0FDF4' },
                  line: { color: hexAccent, width: 0.8 },
                });

                slide.addText(cleanMarkdownText(s.quoteText), {
                  x: 0.8,
                  y: bannerY,
                  w: 8.4,
                  h: quoteBannerH,
                  fontSize: 10,
                  bold: true,
                  color: '065F46',
                  align: 'center',
                  valign: 'middle',
                  fontFace: 'Microsoft YaHei',
                  breakLine: true,
                });
              }
            } else {
              // Single Large Centered Quote Banner
              const quoteMainText = cleanMarkdownText(s.quoteText || s.bullets[0] || s.title || '');
              const quoteH = 1.8;
              const notesH = s.notes ? 0.35 : 0;
              const totalBlockH = quoteH + (s.notes ? 0.25 + notesH : 0);
              const quoteStartY = getCenteredY(totalBlockH);

              slide.addShape(pres.ShapeType.roundRect, {
                x: 0.6,
                y: quoteStartY,
                w: 8.8,
                h: quoteH,
                rectRadius: 0.12,
                fill: { color: 'F0FDF4' },
                line: { color: hexAccent, width: 1 },
              });

              slide.addText(quoteMainText, {
                x: 0.9,
                y: quoteStartY,
                w: 8.2,
                h: quoteH,
                fontSize: 13,
                bold: true,
                color: '065F46',
                align: 'center',
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
                breakLine: true,
              });

              if (s.notes) {
                slide.addText(cleanMarkdownText(s.notes), {
                  x: 1.0,
                  y: quoteStartY + quoteH + 0.25,
                  w: 8.0,
                  h: notesH,
                  fontSize: 9.5,
                  bold: true,
                  color: hexAccent,
                  align: 'center',
                  fontFace: 'Microsoft YaHei',
                });
              }
            }
          } else if (s.layout === 'table' && s.table) {
            // 9. NATIVE POWERPOINT TABLE (table) - Centered
            const tableRows: any[][] = [];

            // Header row with accent theme background
            tableRows.push(
              s.table.headers.map((h) => ({
                text: cleanMarkdownText(h),
                options: {
                  fill: { color: hexAccent },
                  color: 'FFFFFF',
                  bold: true,
                  fontSize: 10,
                  align: 'left',
                  valign: 'middle',
                  fontFace: 'Microsoft YaHei',
                },
              }))
            );

            // Data rows with alternating background
            const rowCount = Math.min(s.table.rows.length, 6);
            s.table.rows.slice(0, rowCount).forEach((row, rIdx) => {
              const rowBg = rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
              tableRows.push(
                row.map((cell) => ({
                  text: cleanMarkdownText(cell),
                  options: {
                    fill: { color: rowBg },
                    color: '334155',
                    fontSize: 9,
                    align: 'left',
                    valign: 'middle',
                    fontFace: 'Microsoft YaHei',
                  },
                }))
              );
            });

            const tableH = (rowCount + 1) * 0.38;
            const tableY = getCenteredY(tableH);

            slide.addTable(tableRows, {
              x: 0.6,
              y: tableY,
              w: 8.8,
              h: tableH,
              border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
              margin: [0.06, 0.08, 0.06, 0.08],
            });
          } else {
            // 10. HIGH-DENSITY & STANDARD ITEM CARDS - True Dynamic Vertical Centering
            const allItems: SlideItem[] = s.items && s.items.length > 0
              ? s.items
              : s.bullets.map((b) => ({ description: b }));
            const count = allItems.length;

            if (count >= 6) {
              // 2 Columns in PPTX
              const rowsPerCol = Math.ceil(Math.min(count, 10) / 2);
              const colW = (8.8 - 0.2) / 2;
              const rowGap = 0.08;
              const cardH = 0.52;
              const totalBlockH = rowsPerCol * cardH + (rowsPerCol - 1) * rowGap;
              const listY = getCenteredY(totalBlockH);

              allItems.slice(0, 10).forEach((it, iIdx) => {
                const col = Math.floor(iIdx / rowsPerCol);
                const row = iIdx % rowsPerCol;
                const cardX = 0.6 + col * (colW + 0.2);
                const cardY = listY + row * (cardH + rowGap);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: cardX,
                  y: cardY,
                  w: colW,
                  h: cardH,
                  rectRadius: 0.06,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 0.75 },
                });

                slide.addShape(pres.ShapeType.ellipse, {
                  x: cardX + 0.1,
                  y: cardY + cardH / 2 - 0.09,
                  w: 0.18,
                  h: 0.18,
                  fill: { color: hexAccent },
                });
                slide.addText(`${iIdx + 1}`, {
                  x: cardX + 0.1,
                  y: cardY + cardH / 2 - 0.09,
                  w: 0.18,
                  h: 0.18,
                  fontSize: 7.5,
                  bold: true,
                  color: 'FFFFFF',
                  align: 'center',
                  valign: 'middle',
                });

                const label = it.title ? `${it.title}: ${it.description || ''}` : it.description || '';
                slide.addText(cleanMarkdownText(label), {
                  x: cardX + 0.35,
                  y: cardY,
                  w: colW - 0.45,
                  h: cardH,
                  fontSize: 8.5,
                  color: '334155',
                  fontFace: 'Microsoft YaHei',
                  valign: 'middle',
                  breakLine: true,
                });
              });
            } else {
              // 1 Column in PPTX - Centered Stacked Cards
              const bulletList = s.bullets.length > 0 ? s.bullets : allItems.map((it) => `${it.title ? it.title + ': ' : ''}${it.description || ''}`);
              const bulletCount = bulletList.length;
              const rowGap = 0.12;
              const cardH = bulletCount <= 3 ? 0.68 : 0.58;
              const totalBlockH = bulletCount * cardH + (bulletCount - 1) * rowGap;
              const listY = getCenteredY(totalBlockH);

              bulletList.forEach((b, bIdx) => {
                const cardY = listY + bIdx * (cardH + rowGap);

                slide.addShape(pres.ShapeType.roundRect, {
                  x: 0.6,
                  y: cardY,
                  w: 8.8,
                  h: cardH,
                  rectRadius: 0.08,
                  fill: { color: 'FFFFFF' },
                  line: { color: 'E2E8F0', width: 0.75 },
                });

                slide.addShape(pres.ShapeType.ellipse, {
                  x: 0.8,
                  y: cardY + cardH / 2 - 0.1,
                  w: 0.2,
                  h: 0.2,
                  fill: { color: hexAccent },
                });
                slide.addText(`${bIdx + 1}`, {
                  x: 0.8,
                  y: cardY + cardH / 2 - 0.1,
                  w: 0.2,
                  h: 0.2,
                  fontSize: 8.5,
                  bold: true,
                  color: 'FFFFFF',
                  align: 'center',
                  valign: 'middle',
                });

                slide.addText(cleanMarkdownText(b), {
                  x: 1.12,
                  y: cardY,
                  w: 8.1,
                  h: cardH,
                  fontSize: 9.5,
                  color: '334155',
                  fontFace: 'Microsoft YaHei',
                  valign: 'middle',
                  breakLine: true,
                });
              });
            }
          }
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

  const renderSlideInner = () => (
    <>
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
          <div className="text-center my-auto space-y-2 sm:space-y-3 px-3 sm:px-6 w-full flex flex-col items-center justify-center">
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
              <p className="text-xs sm:text-sm text-slate-200/90 font-medium w-full text-center leading-relaxed break-words px-2">
                {renderFormattedText(currentSlide.subtitle)}
              </p>
            )}
            {(currentSlide.notes || currentSlide.quoteText) && !currentSlide.table && (
              <div className="inline-block px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-xs border border-white/20 text-white text-[10px] sm:text-xs font-medium shadow-2xs mt-2">
                {renderFormattedText(currentSlide.notes || currentSlide.quoteText || '')}
              </div>
            )}
            {currentSlide.table && (
              <div className="w-full max-w-xl mx-auto overflow-hidden rounded-lg bg-white/10 backdrop-blur-xs border border-white/20 text-[10px] sm:text-xs text-white mt-1">
                <div className="grid grid-cols-3 bg-white/20 font-bold px-2 py-1 border-b border-white/20">
                  {currentSlide.table.headers.map((h, hIdx) => (
                    <div key={hIdx} className="text-center">{renderFormattedText(h)}</div>
                  ))}
                </div>
                {currentSlide.table.rows.map((r, rIdx) => (
                  <div key={rIdx} className="grid grid-cols-3 px-2 py-1 border-b last:border-b-0 border-white/10 text-slate-200 text-[9.5px] sm:text-[10.5px]">
                    {r.map((c, cIdx) => (
                      <div key={cIdx} className="text-center truncate px-1">{renderFormattedText(c)}</div>
                    ))}
                  </div>
                ))}
              </div>
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

            {/* 2. TIMELINE / ROADMAP (2~5 items with connecting line) */}
            {currentSlide.layout === 'timeline' && currentSlide.items && currentSlide.items.length > 0 ? (
              <div className="flex flex-col my-auto w-full space-y-2.5">
                <div className="relative w-full">
                  {/* Horizontal connecting background line */}
                  <div className="hidden sm:block absolute top-4 left-6 right-6 h-0.5 bg-slate-200 dark:bg-slate-700 z-0" />
                  
                  <div className={`grid gap-2 sm:gap-2.5 z-10 relative ${
                    currentSlide.items.length === 5 ? 'grid-cols-2 sm:grid-cols-5' :
                    currentSlide.items.length === 4 ? 'grid-cols-2 sm:grid-cols-4' :
                    currentSlide.items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                  }`}>
                    {currentSlide.items.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="flex flex-col p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition-all">
                        <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
                          <span
                            className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white shadow-xs shrink-0 ring-2 ring-white dark:ring-slate-800"
                            style={{ backgroundColor: activeTheme.accent }}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 break-words leading-tight flex-1">
                            {renderFormattedText(item.title || `阶段 ${idx + 1}`)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[10px] sm:text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal mb-1">
                            {renderFormattedText(item.description)}
                          </p>
                        )}
                        {item.bullets && item.bullets.length > 0 && (
                          <div className="space-y-0.5">
                            {item.bullets.map((sub, sIdx) => (
                              <div key={sIdx} className="text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-300 leading-snug break-words">
                                {renderFormattedText(sub)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {currentSlide.notes && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[9.5px] sm:text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-snug">
                    💡 {renderFormattedText(currentSlide.notes)}
                  </div>
                )}
              </div>
            ) : /* 3. STATS / METRICS CARDS (Large bold numbers / accent badges) */
            currentSlide.layout === 'stats' && currentSlide.items && currentSlide.items.length > 0 ? (
              <div className="flex flex-col my-auto w-full space-y-2">
                <div className={`grid gap-2 sm:gap-2.5 w-full ${
                  currentSlide.items.length >= 5 ? 'grid-cols-2 sm:grid-cols-3' :
                  currentSlide.items.length === 4 ? 'grid-cols-2' :
                  currentSlide.items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                }`}>
                  {currentSlide.items.slice(0, 6).map((item, idx) => (
                    <div key={idx} className="relative p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-linear-to-b from-white to-slate-50 dark:from-slate-800/90 dark:to-slate-900/90 shadow-2xs flex flex-col justify-between overflow-hidden group">
                      <div>
                        <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-700/50">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 break-words flex-1 truncate">
                            {renderFormattedText(item.title || `指标 0${idx + 1}`)}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase text-white shrink-0 ml-1"
                            style={{ backgroundColor: activeTheme.accent }}
                          >
                            KPI
                          </span>
                        </div>

                        {item.description && (
                          <p className="text-[10px] sm:text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal">
                            {renderFormattedText(item.description)}
                          </p>
                        )}

                        {item.bullets && item.bullets.length > 0 && (
                          <div className="space-y-0.5 mt-1">
                            {item.bullets.map((sub, sIdx) => (
                              <div key={sIdx} className="text-[9.5px] sm:text-[10px] text-slate-700 dark:text-slate-300 leading-tight break-words">
                                {renderFormattedText(sub)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="w-6 h-0.5 mt-2 rounded-full" style={{ backgroundColor: activeTheme.accent }} />
                    </div>
                  ))}
                </div>

                {currentSlide.notes && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[9.5px] sm:text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-snug text-center">
                    💡 {renderFormattedText(currentSlide.notes)}
                  </div>
                )}
              </div>
            ) : /* 4. TWO-COLUMN COMPARISON / HERO PILLARS (grid2) */
            currentSlide.layout === 'grid2' && currentSlide.items && currentSlide.items.length >= 2 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 my-auto w-full">
                {currentSlide.items.slice(0, 2).map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 sm:p-3 rounded-2xl border shadow-2xs flex flex-col justify-between transition-all ${
                      idx === 0
                        ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                        : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50'
                    }`}
                  >
                    <div>
                      {item.title && (
                        <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-slate-200/70 dark:border-slate-700/60">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: activeTheme.accent }}
                          />
                          <span className="text-[11.5px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 break-words leading-tight flex-1">
                            {renderFormattedText(item.title)}
                          </span>
                        </div>
                      )}
                      {item.description && (
                        <p className="text-[10px] sm:text-[10.5px] text-slate-500 dark:text-slate-400 italic mb-1 break-words leading-tight">
                          {renderFormattedText(item.description)}
                        </p>
                      )}
                      {item.bullets && item.bullets.length > 0 && (
                        <div className="space-y-1 mt-1 pr-1">
                          {item.bullets.map((sub, sIdx) => (
                            <div key={sIdx} className="flex items-start gap-1 text-[9.5px] sm:text-[10px] text-slate-700 dark:text-slate-300 leading-snug">
                              <span className="text-slate-400 font-bold shrink-0">•</span>
                              <span className="break-words flex-1">{renderFormattedText(sub)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : /* 5. THREE-COLUMN PILLARS (grid3) */
            currentSlide.layout === 'grid3' && currentSlide.items && currentSlide.items.length >= 3 ? (
              <div className="flex flex-col my-auto w-full space-y-2">
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full">
                  {currentSlide.items.slice(0, 3).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 sm:p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
                          <span
                            className="w-1.5 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: activeTheme.accent }}
                          />
                          <span className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 break-words leading-tight flex-1">
                            {renderFormattedText(item.title || `模块 0${idx + 1}`)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[10px] sm:text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal mb-1">
                            {renderFormattedText(item.description)}
                          </p>
                        )}
                        {item.bullets && item.bullets.length > 0 && (
                          <div className="space-y-0.5 mt-1">
                            {item.bullets.map((sub, sIdx) => (
                              <div key={sIdx} className="flex items-start gap-1 text-[9px] sm:text-[9.5px] text-slate-600 dark:text-slate-300 leading-snug">
                                <span className="text-slate-400 font-bold shrink-0">•</span>
                                <span className="break-words flex-1">{renderFormattedText(sub)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {currentSlide.notes && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[9.5px] sm:text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-snug text-center">
                    💡 {renderFormattedText(currentSlide.notes)}
                  </div>
                )}
              </div>
            ) : /* 6. FOUR-CARD 2x2 MATRIX (grid4) */
            currentSlide.layout === 'grid4' && currentSlide.items && currentSlide.items.length >= 4 ? (
              <div className="flex flex-col my-auto w-full space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 w-full">
                  {currentSlide.items.slice(0, 4).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 sm:p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs flex items-start gap-2"
                    >
                      <span
                        className="flex items-center justify-center w-4 h-4 rounded-md text-[9px] font-bold text-white shrink-0 mt-0.5"
                        style={{ backgroundColor: activeTheme.accent }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {item.title && (
                          <div className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 mb-0.5 break-words leading-tight">
                            {renderFormattedText(item.title)}
                          </div>
                        )}
                        {item.description && (
                          <p className="text-[10px] sm:text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug break-words whitespace-normal mb-1">
                            {renderFormattedText(item.description)}
                          </p>
                        )}
                        {item.bullets && item.bullets.length > 0 && (
                          <div className="space-y-0.5 mt-0.5">
                            {item.bullets.map((sub, sIdx) => (
                              <div key={sIdx} className="flex items-start gap-1 text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-300 leading-snug">
                                <span className="text-slate-400 font-bold shrink-0">•</span>
                                <span className="break-words flex-1">{renderFormattedText(sub)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {currentSlide.notes && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[9.5px] sm:text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-snug">
                    💡 {renderFormattedText(currentSlide.notes)}
                  </div>
                )}
              </div>
            ) : /* 7. FIVE-CARD / SIX-CARD MATRICES (grid5 / grid6) */
            (currentSlide.layout === 'grid5' || currentSlide.layout === 'grid6') && currentSlide.items && currentSlide.items.length >= 5 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-auto w-full">
                {currentSlide.items.slice(0, currentSlide.layout === 'grid6' ? 6 : 5).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 shrink-0 pb-1 border-b border-slate-200/60 dark:border-slate-700/50">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.accent }} />
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate flex-1">
                          {renderFormattedText(item.title || `要点 ${idx + 1}`)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-300 leading-tight break-words whitespace-normal mb-1">
                          {renderFormattedText(item.description)}
                        </p>
                      )}
                      {item.bullets && item.bullets.length > 0 && (
                        <div className="space-y-0.5 mt-0.5">
                          {item.bullets.map((sub, sIdx) => (
                            <div key={sIdx} className="flex items-start gap-1 text-[9px] sm:text-[9.5px] text-slate-600 dark:text-slate-300 leading-tight">
                              <span className="text-slate-400 font-bold shrink-0">•</span>
                              <span className="break-words flex-1">{renderFormattedText(sub)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : /* 8. QUOTE / HIGHLIGHT CALLOUT (quote) */
            currentSlide.layout === 'quote' ? (
              <div className="flex flex-col my-auto w-full space-y-2.5 max-h-[340px] overflow-hidden">
                {currentSlide.table ? (
                  /* Dual-Panel Layout: Quotes on Left + Table Checklist on Right */
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full items-stretch my-auto">
                    {/* Left Column: Golden Quote Callout Cards (5 cols) */}
                    <div className="md:col-span-5 flex flex-col justify-between space-y-2">
                      {currentSlide.items && currentSlide.items.length > 0 ? (
                        currentSlide.items.slice(0, 3).map((it, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-linear-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-l-3.5 border-emerald-500 shadow-2xs flex items-center"
                          >
                            <p className="text-[10px] sm:text-[10.5px] font-medium text-slate-800 dark:text-slate-200 leading-snug break-words">
                              {renderFormattedText(it.title ? `${it.title}：${it.description}` : it.description || '')}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 rounded-xl bg-linear-to-r from-emerald-500/15 via-teal-500/10 to-transparent border-l-4 border-emerald-500 my-auto">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 leading-relaxed break-words">
                            {renderFormattedText(currentSlide.quoteText || currentSlide.bullets[0] || '')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Checklist Table (7 cols) */}
                    <div className="md:col-span-7 flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: activeTheme.accent }}>
                            {currentSlide.table.headers.map((head, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-2.5 py-1 text-[9.5px] sm:text-[10.5px] font-bold text-white tracking-wide border-r last:border-r-0 border-white/20"
                              >
                                {renderFormattedText(head)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800/90 text-[9px] sm:text-[10px]">
                          {currentSlide.table.rows.slice(0, 5).map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={rIdx % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''}
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-2.5 py-1 text-slate-700 dark:text-slate-200 border-r last:border-r-0 border-slate-100 dark:border-slate-800 leading-tight break-words"
                                >
                                  {renderFormattedText(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : currentSlide.items && currentSlide.items.length > 0 ? (
                  <>
                    {/* Top 3 Pillar Cards */}
                    <div
                      className={`grid gap-2.5 w-full ${
                        currentSlide.items.length === 3
                          ? 'grid-cols-1 sm:grid-cols-3'
                          : currentSlide.items.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-1'
                      }`}
                    >
                      {currentSlide.items.slice(0, 3).map((it, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/70 shadow-2xs flex flex-col justify-between"
                        >
                          <div>
                            {it.title && (
                              <div className="text-[11.5px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-700/60">
                                <span
                                  className="w-1.5 h-3 rounded-full shrink-0"
                                  style={{ backgroundColor: activeTheme.accent }}
                                />
                                <span className="break-words flex-1">{renderFormattedText(it.title)}</span>
                              </div>
                            )}
                            <div className="text-[10px] sm:text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug break-words">
                              {renderFormattedText(it.description || '')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Conclusion Banner */}
                    {currentSlide.quoteText && (
                      <div className="p-2.5 rounded-xl bg-linear-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 border border-emerald-300/80 dark:border-emerald-700/80 text-center">
                        <div className="text-[10.5px] sm:text-[11.5px] font-bold text-emerald-950 dark:text-emerald-100 leading-relaxed break-words">
                          {renderFormattedText(currentSlide.quoteText)}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Single Centered Golden Quote Banner */}
                    <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-500/15 via-teal-500/10 to-transparent border-l-4 border-emerald-500 text-left">
                      <div className="text-xs sm:text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 leading-relaxed break-words">
                        {renderFormattedText(
                          currentSlide.quoteText ||
                            currentSlide.bullets[0] ||
                            currentSlide.title ||
                            ''
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Thank you / interactive footer notes */}
                {currentSlide.notes && (
                  <div className="text-center pt-0.5">
                    <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/50 text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      💡 {renderFormattedText(currentSlide.notes)}
                    </span>
                  </div>
                )}
              </div>
            ) : /* 9. STRUCTURED DATA TABLE (table) */
            currentSlide.layout === 'table' && currentSlide.table ? (
              <div className="my-auto w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: activeTheme.accent }}>
                      {currentSlide.table.headers.map((head, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-2.5 py-1.5 text-[10px] sm:text-xs font-bold text-white tracking-wide border-r last:border-r-0 border-white/20"
                        >
                          {renderFormattedText(head)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800/90 text-[9.5px] sm:text-[11px]">
                    {currentSlide.table.rows.slice(0, 5).map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-2.5 py-1.5 text-slate-700 dark:text-slate-200 border-r last:border-r-0 border-slate-100 dark:border-slate-800 leading-snug break-words"
                          >
                            {renderFormattedText(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {currentSlide.notes && (
                  <div className="px-3 py-1.5 bg-emerald-50/70 dark:bg-emerald-950/30 border-t border-emerald-200/60 dark:border-emerald-900/40 text-[9.5px] sm:text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-snug text-center">
                    💡 {renderFormattedText(currentSlide.notes)}
                  </div>
                )}
              </div>
            ) : (
              /* 10. HIGH-DENSITY & STANDARD ITEM CARDS (Auto Dual-Column for >= 6 items) */
              (() => {
                const allItems: SlideItem[] = currentSlide.items && currentSlide.items.length > 0
                  ? currentSlide.items
                  : currentSlide.bullets.map((b) => ({ description: b }));
                const count = allItems.length;

                if (count >= 6) {
                  // 2-Column High Density Grid for 6~10 items
                  return (
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 my-auto w-full overflow-hidden">
                      {allItems.slice(0, 10).map((it, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-1.5 rounded-lg bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs font-medium transition-all ${
                            count >= 8 ? 'p-1 sm:p-1.5 text-[9px] sm:text-[10px]' : 'p-1.5 sm:p-2 text-[10px] sm:text-[11px]'
                          }`}
                        >
                          <span
                            className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8.5px] font-bold text-white shrink-0 mt-0.5"
                            style={{ backgroundColor: activeTheme.accent }}
                          >
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {it.title && (
                              <span className="font-bold text-slate-900 dark:text-slate-100 mr-1 inline">
                                {renderFormattedText(it.title)}:
                              </span>
                            )}
                            <span className="text-slate-700 dark:text-slate-200 break-words leading-tight whitespace-normal">
                              {renderFormattedText(it.description || '')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                // 1-Column Elegant Stacked Cards for 1~5 items
                return (
                  <div className="space-y-1.5 sm:space-y-2 my-auto w-full">
                    {allItems.map((it, bIdx) => (
                      <div
                        key={bIdx}
                        className={`flex items-start gap-2 rounded-xl bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs font-medium transition-all ${
                          count === 5 ? 'p-1.5 sm:p-2 text-[11px]' : 'p-2.5 sm:p-3 text-xs sm:text-[13px]'
                        }`}
                      >
                        <span
                          className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white shrink-0 mt-0.5"
                          style={{ backgroundColor: activeTheme.accent }}
                        >
                          {bIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {it.title && (
                            <span className="font-bold text-slate-900 dark:text-slate-100 mr-1 inline">
                              {renderFormattedText(it.title)}:
                            </span>
                          )}
                          <span className="text-slate-700 dark:text-slate-200 break-words leading-relaxed whitespace-normal">
                            {renderFormattedText(it.description || '')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </>
        )}
      </div>
    </>
  );

  if (slides.length === 0) return null;

  return (
    <div
      className={`my-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md overflow-hidden transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none flex flex-col justify-between p-3 sm:p-6 bg-slate-950 text-white my-0'
          : 'w-full max-w-3xl mx-auto'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/70 dark:border-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-orange-100 dark:bg-orange-950/70 text-orange-600 dark:text-orange-400">
            {isSourceMode ? <Code className="w-4 h-4" /> : <Presentation className="w-4 h-4" />}
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {isSourceMode ? 'PPT 源码视图 (Markdown)' : `AI 幻灯片演示 (${safeIdx + 1} / ${totalSlides} 页)`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Toggle View: Slide Presentation vs Raw Text */}
          <button
            onClick={() => setIsSourceMode(!isSourceMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium border transition-all active:scale-95 ${
              isSourceMode
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={isSourceMode ? '返回 PPT 交互式演示预览' : '切换为 Markdown / 文本源码视图'}
          >
            {isSourceMode ? (
              <>
                <Presentation className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">PPT 演示</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">纯文本/源码</span>
              </>
            )}
          </button>

          {!isSourceMode && (
            <>
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
            </>
          )}

          {isSourceMode && (
            <button
              onClick={handleCopyRaw}
              className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium border border-slate-200/80 dark:border-slate-700 transition-all active:scale-95"
              title="复制全部 PPT Markdown 源码"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? '已复制' : '复制代码'}</span>
            </button>
          )}
        </div>
      </div>

      {isSourceMode ? (
        /* Source Mode: Clean Markdown / Code Text Container */
        <div className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-[500px] leading-relaxed select-text whitespace-pre-wrap">
          {rawCode}
        </div>
      ) : (
        <>
          {/* 2. Slide Visual Card Canvas (Strict 16:9 Fixed Ratio Box, Proportional Scaling in Fullscreen) */}
          {isFullscreen ? (
            <div
              ref={fullscreenContainerRef}
              className="flex-1 w-full h-full flex items-center justify-center overflow-hidden relative p-2 sm:p-4 bg-slate-950 select-none"
            >
              {/* Proportional Scaled 16:9 Slide Canvas */}
              <div
                style={{
                  width: `${960 * fullscreenScale}px`,
                  height: `${540 * fullscreenScale}px`,
                }}
                className="relative flex items-center justify-center shrink-0 shadow-2xl rounded-2xl overflow-hidden transition-all duration-75"
              >
                <div
                  className={`w-[960px] h-[540px] rounded-2xl shadow-2xl border border-slate-700/60 p-8 flex flex-col justify-between relative overflow-hidden select-none origin-top-left ${
                    currentSlide.layout === 'cover'
                      ? 'text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100'
                  }`}
                  style={{
                    transform: `scale(${fullscreenScale})`,
                    transformOrigin: 'top left',
                    backgroundColor: currentSlide.layout === 'cover' ? activeTheme.bg : undefined,
                  }}
                >
                  {renderSlideInner()}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-5 flex items-center justify-center bg-slate-100/60 dark:bg-slate-950/40">
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
                {renderSlideInner()}
              </div>
            </div>
          )}

          {/* 3. Navigation Controls */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200/70 dark:border-slate-800 text-xs shrink-0">
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
        </>
      )}
    </div>
  );
};
