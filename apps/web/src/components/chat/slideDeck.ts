export type SlideLayout =
  | 'cover'
  | 'grid2'
  | 'grid3'
  | 'grid4'
  | 'grid5'
  | 'grid6'
  | 'grid7'
  | 'grid8'
  | 'grid9'
  | 'timeline'
  | 'stats'
  | 'quote'
  | 'table'
  | 'chart'
  | 'chart-left'
  | 'chart-right'
  | 'spotlight'
  | 'content';

export type ChartType = 'bar' | 'column' | 'line' | 'area' | 'mountain' | 'pie';
export type SlideLayoutVariant = 'horizontal' | 'balanced' | 'two-column' | 'vertical' | 'masonry' | 'focus';

export interface SlideChart {
  type: ChartType;
  title?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

export interface SlideItem {
  tag?: string;
  title?: string;
  description?: string;
  bullets?: string[];
  children?: SlideItem[];
}

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets: string[];
  items: SlideItem[];
  table?: { headers: string[]; rows: string[][] };
  chart?: SlideChart;
  quoteText?: string;
  quoteBlocks?: string[];
  notes?: string;
  layout: SlideLayout;
  layoutVariant?: SlideLayoutVariant;
  continuation?: boolean;
}

export interface SlideTheme {
  id: string;
  name: string;
  bg: string;
  accent: string;
  accentSoft: string;
  cardBg: string;
  textColor: string;
  darkText: string;
}

export interface DeckStyle {
  themeId: string;
  colorful: boolean;
}

export const SLIDE_FONT = 'Microsoft YaHei, PingFang SC, Hiragino Sans GB, sans-serif';

export const COLOR_THEMES: SlideTheme[] = [
  { id: 'ruby', name: '活力珊瑚', bg: '#7c2d12', accent: '#ea580c', accentSoft: '#ffedd5', cardBg: '#fff7ed', textColor: '#9a3412', darkText: '#ffffff' },
  { id: 'amber', name: '暖调琥珀', bg: '#451a03', accent: '#d97706', accentSoft: '#fef3c7', cardBg: '#fffbeb', textColor: '#92400e', darkText: '#ffffff' },
  { id: 'emerald', name: '清新极光绿', bg: '#064e3b', accent: '#10b981', accentSoft: '#d1fae5', cardBg: '#ecfdf5', textColor: '#065f46', darkText: '#ffffff' },
  { id: 'teal', name: '深海青绿', bg: '#134e4a', accent: '#0f766e', accentSoft: '#ccfbf1', cardBg: '#f0fdfa', textColor: '#115e59', darkText: '#ffffff' },
  { id: 'cyan', name: '澄澈青蓝', bg: '#083344', accent: '#0891b2', accentSoft: '#cffafe', cardBg: '#ecfeff', textColor: '#155e75', darkText: '#ffffff' },
  { id: 'business', name: '商务深海蓝', bg: '#172554', accent: '#2563eb', accentSoft: '#dbeafe', cardBg: '#eff6ff', textColor: '#1e3a8a', darkText: '#ffffff' },
  { id: 'tech', name: '科技星空', bg: '#0f172a', accent: '#6366f1', accentSoft: '#e0e7ff', cardBg: '#f8fafc', textColor: '#334155', darkText: '#ffffff' },
  { id: 'purple', name: '灵感紫罗兰', bg: '#3b0764', accent: '#9333ea', accentSoft: '#f3e8ff', cardBg: '#faf5ff', textColor: '#6b21a8', darkText: '#ffffff' },
  { id: 'rose', name: '人文玫瑰', bg: '#4c0519', accent: '#e11d48', accentSoft: '#ffe4e6', cardBg: '#fff1f2', textColor: '#9f1239', darkText: '#ffffff' },
  { id: 'slate', name: '经典石墨', bg: '#1e293b', accent: '#475569', accentSoft: '#e2e8f0', cardBg: '#f8fafc', textColor: '#334155', darkText: '#ffffff' },
];

export const DEFAULT_DECK_STYLE: DeckStyle = { themeId: 'business', colorful: true };

/** 每个主题在“彩色”模式下使用一组独立且协调的辅助色。 */
export const COLORFUL_PALETTES: Record<string, string[]> = {
  emerald: ['#10b981', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6'],
  business: ['#2563eb', '#0891b2', '#14b8a6', '#6366f1', '#f59e0b', '#38bdf8'],
  tech: ['#6366f1', '#22d3ee', '#a855f7', '#ec4899', '#38bdf8', '#f97316'],
  purple: ['#9333ea', '#c026d3', '#6366f1', '#06b6d4', '#f59e0b', '#f472b6'],
  rose: ['#e11d48', '#fb7185', '#f97316', '#f59e0b', '#a855f7', '#0ea5e9'],
  amber: ['#d97706', '#ea580c', '#ef4444', '#eab308', '#0f766e', '#2563eb'],
  cyan: ['#0891b2', '#0284c7', '#0f766e', '#2563eb', '#7c3aed', '#f59e0b'],
  slate: ['#475569', '#0284c7', '#0f766e', '#7c3aed', '#c2410c', '#be123c'],
  teal: ['#0f766e', '#14b8a6', '#06b6d4', '#2563eb', '#84cc16', '#f59e0b'],
  ruby: ['#ea580c', '#ef4444', '#ec4899', '#a855f7', '#eab308', '#14b8a6'],
};

export function getThemePalette(theme: SlideTheme, colorful: boolean): string[] {
  if (!colorful) return [theme.accent, `${theme.accent}CC`, `${theme.accent}99`, `${theme.accent}66`, `${theme.accent}44`];
  return COLORFUL_PALETTES[theme.id] ?? [theme.accent, '#14b8a6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
}

export function getDeckStyle(raw = ''): DeckStyle {
  const declaredTheme = raw.match(/^<!--\s*theme:\s*([\w-]+)\s*-->$/im)?.[1]?.toLowerCase();
  const declaredMode = raw.match(/^<!--\s*color-mode:\s*(colorful|monochrome)\s*-->$/im)?.[1]?.toLowerCase();
  return {
    themeId: COLOR_THEMES.some((theme) => theme.id === declaredTheme) ? declaredTheme! : DEFAULT_DECK_STYLE.themeId,
    colorful: declaredMode ? declaredMode === 'colorful' : DEFAULT_DECK_STYLE.colorful,
  };
}

/** During streaming, only pages terminated by a Markdown divider are safe to render. */
export function completedPptMarkdown(raw = ''): string {
  const lines = raw.replace(/^\s*---\s*\n/, '').split('\n');
  const completed: string[] = [];
  let current: string[] = [];
  lines.forEach((line, index) => {
    if (line.trim() === '---' && isSlideBreak(lines, index)) {
      if (current.join('\n').trim()) completed.push(current.join('\n').trim());
      current = [];
    } else current.push(line);
  });
  return completed.join('\n\n---\n\n');
}

const LAYOUTS = new Set<SlideLayout>([
  'cover', 'grid2', 'grid3', 'grid4', 'grid5', 'grid6', 'grid7', 'grid8', 'grid9',
  'timeline', 'stats', 'quote', 'table', 'chart', 'chart-left', 'chart-right', 'spotlight', 'content',
]);
const LAYOUT_VARIANTS = new Set<SlideLayoutVariant>(['horizontal', 'balanced', 'two-column', 'vertical', 'masonry', 'focus']);

export function cleanMarkdownText(text = ''): string {
  return text
    .replace(/^#+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

function parseTable(lines: string[]): SlideData['table'] | undefined {
  if (lines.length < 2) return undefined;
  const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(1)
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map(cells)
    .filter((row) => row.some(Boolean));
  return headers.length && rows.length ? { headers, rows } : undefined;
}

function parseChart(table: SlideData['table'], type?: ChartType, title?: string): SlideChart | undefined {
  if (!type || !table || table.headers.length < 2 || !table.rows.length) return undefined;
  const categories = table.rows.map((row) => cleanMarkdownText(row[0] || ''));
  const series = table.headers.slice(1).map((name, index) => ({
    name: cleanMarkdownText(name),
    values: table.rows.map((row) => Number(String(row[index + 1] || '0').replace(/[,%\s]/g, '')) || 0),
  }));
  return categories.some(Boolean) && series.length ? { type, title, categories, series } : undefined;
}

function itemFromBullet(text: string): SlideItem {
  const bold = text.match(/^\*\*([^*]+)\*\*[：:]?\s*(.*)$/);
  const bracket = text.match(/^【([^】]+)】[：:]?\s*(.*)$/);
  const colon = text.match(/^([^：:]{1,20})[：:]\s*(.+)$/);
  if (bold) return { title: bold[1].trim(), description: bold[2].trim(), bullets: [] };
  if (bracket) return { title: bracket[1].trim(), description: bracket[2].trim(), bullets: [] };
  if (colon) return { title: colon[1].trim(), description: colon[2].trim(), bullets: [] };
  return { description: text, bullets: [] };
}

function isSlideBreak(lines: string[], index: number): boolean {
  const next = lines.slice(index + 1).find((line) => line.trim());
  return !!next && /^(?:<!--\s*(?:layout|theme|color-mode):|#{1,2}\s+)/i.test(next.trim());
}

/** Models occasionally add horizontal rules inside a page. Treat a rule as a page break only when a new page follows it. */
function splitSlideSections(raw: string): string[] {
  const lines = raw.replace(/^\s*---\s*\n/, '').split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '---') { current.push(lines[index]); continue; }
    if (isSlideBreak(lines, index)) {
      if (current.join('\n').trim()) sections.push(current.join('\n').trim());
      current = [];
    }
    // A non-page horizontal rule has no presentation meaning, so omit it.
  }
  if (current.join('\n').trim()) sections.push(current.join('\n').trim());
  return sections;
}

/** Parse the documented PPT markdown protocol without throwing away mixed content. */
export function parseMarkdownSlides(raw: string): SlideData[] {
  if (!raw.trim()) return [];
  return splitSlideSections(raw).flatMap((section, slideIndex) => {
    const lines = section.split('\n');
    const h3Indexes = lines.map((line, index) => line.trim().startsWith('### ') ? index : -1).filter((index) => index >= 0);
    let layout: SlideLayout | undefined;
    let layoutVariant: SlideLayoutVariant | undefined;
    let title = '';
    let subtitle = '';
    let quoteText = '';
    const quoteBlocks: string[] = [];
    let quoteBlockIndex = -1;
    let notes = '';
    let chartType: ChartType | undefined;
    let chartTitle = '';
    const bullets: string[] = [];
    const items: SlideItem[] = [];
    const tableLines: string[] = [];
    let activeItem: SlideItem | undefined;
    let activeChild: SlideItem | undefined;

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) { quoteBlockIndex = -1; return; }
      if (!line.startsWith('>')) quoteBlockIndex = -1;
      const layoutMatch = line.match(/^<!--\s*layout:\s*([\w-]+)\s*-->$/i);
      if (layoutMatch) {
        const candidate = layoutMatch[1].toLowerCase() as SlideLayout;
        if (LAYOUTS.has(candidate)) layout = candidate;
        return;
      }
      const variantMatch = line.match(/^<!--\s*layout-variant:\s*([\w-]+)\s*-->$/i);
      if (variantMatch) {
        const candidate = variantMatch[1].toLowerCase() as SlideLayoutVariant;
        if (LAYOUT_VARIANTS.has(candidate)) layoutVariant = candidate;
        return;
      }
      const chartMatch = line.match(/^<!--\s*chart:\s*(bar|column|line|area|mountain|pie)\s*-->$/i);
      if (chartMatch) { chartType = chartMatch[1].toLowerCase() as ChartType; return; }
      const chartTitleMatch = line.match(/^<!--\s*chart-title:\s*(.*?)\s*-->$/i);
      if (chartTitleMatch) { chartTitle = chartTitleMatch[1]; return; }
      // Deck-level settings are consumed by getDeckStyle, never by a slide.
      if (/^<!--\s*(?:theme|color-mode):\s*.*?\s*-->$/i.test(line)) return;
      if (line.startsWith('|') && line.endsWith('|')) {
        tableLines.push(line);
        return;
      }
      if (line.startsWith('>')) {
        const text = line.replace(/^>\s*/, '').trim();
        if (/^(?:💡|📌|⭐|✨)?\s*(?:\*\*)?(?:演讲备注|备注|notes?)\b/i.test(text)) {
          notes = text.replace(/^(?:💡|📌|⭐|✨)?\s*(?:\*\*)?(?:演讲备注|备注|notes?)[：:]?\s*(?:\*\*)?/i, '').trim();
        } else {
          // A trailing action prompt belongs in the slide footer, not in the
          // main quotation. This preserves the visual hierarchy in quote pages.
          if (layout === 'quote' && quoteText && /^(?:[📌💡🗓️🎯]\s*)?(?:课后挑战|行动挑战|下一步|温馨提示|提示)/.test(text)) {
            notes = text;
            return;
          }
          quoteText = [quoteText, text].filter(Boolean).join('\n');
          if (quoteBlockIndex < 0) {
            quoteBlocks.push(text);
            quoteBlockIndex = quoteBlocks.length - 1;
          } else quoteBlocks[quoteBlockIndex] = `${quoteBlocks[quoteBlockIndex]}\n${text}`;
        }
        return;
      }
      if (/^#\s+/.test(line) || (!title && /^##\s+/.test(line))) {
        title = line.replace(/^#{1,2}\s+/, '').trim();
        return;
      }
      if (/^##\s+/.test(line) && !title) {
        title = line.replace(/^##\s+/, '').trim();
        return;
      }
      if (/^###\s+/.test(line)) {
        const text = line.replace(/^###\s+/, '').trim();
        // The documented protocol puts the optional subtitle in the first H3.
        if (!subtitle && (index === h3Indexes[0] || !activeItem)) {
          subtitle = text;
          return;
        }
        activeItem = { title: text, bullets: [] };
        items.push(activeItem);
        activeChild = undefined;
        return;
      }
      if (/^####\s+/.test(line)) {
        const text = line.replace(/^####\s+/, '').trim();
        if (!activeItem) {
          activeItem = { title: subtitle || text, bullets: [], children: [] };
          items.push(activeItem);
        }
        activeItem.children ||= [];
        activeChild = { title: text, bullets: [] };
        activeItem.children.push(activeChild);
        return;
      }
      const listMatch = rawLine.match(/^\s*[-*+]\s+(.*)$/) || rawLine.match(/^\s*\d+[\.、]\s+(.*)$/);
      if (listMatch) {
        const text = listMatch[1].trim();
        const itemHeading = text.match(/^###\s+(.+)$/);
        if (itemHeading) {
          activeItem = { title: itemHeading[1].trim(), bullets: [] };
          items.push(activeItem);
          return;
        }
        const isIndented = /^\s{2,}|^\t/.test(rawLine);
        const target = activeChild || activeItem;
        if (target && (activeChild || isIndented || h3Indexes.length > 1)) {
          target.bullets ||= [];
          target.bullets.push(text);
        } else {
          bullets.push(text);
          const item = itemFromBullet(text);
          items.push(item);
          activeItem = item;
        }
        return;
      }
      if (!title) title = line;
      else if (!subtitle) subtitle = line;
      else if (layout === 'quote' && !activeItem && /^\*\*[^*]+\*\*$/.test(line)) quoteText = line;
      else if (activeChild) {
        activeChild.description = [activeChild.description, line].filter(Boolean).join('\n');
      }
      else if (activeItem) {
        if (/^(?:\*\*[^*]+\*\*|【[^】]+】)[：:]/.test(line)) {
          const item = itemFromBullet(line);
          items.push(item);
          activeItem = item;
        } else {
          activeItem.description = [activeItem.description, line].filter(Boolean).join('\n');
        }
      } else {
        // Quote pages often add compact, bold "推荐场景：..." cards after the quote.
        const item = itemFromBullet(line);
        if (!item.title && !items.length && subtitle) item.title = subtitle;
        items.push(item);
        activeItem = item;
        activeChild = undefined;
      }
    });

    const table = parseTable(tableLines);
    const chart = parseChart(table, chartType, chartTitle);
    if (!title && !items.length && !table && !quoteText) return [];
    const isCover = layout === 'cover' || (slideIndex === 0 && !items.length && !table && !!title);
    return [{
      title: title || `幻灯片 ${slideIndex + 1}`,
      subtitle,
      bullets,
      items,
      table,
      chart,
      quoteText,
      quoteBlocks,
      notes,
      layout: layout || (table ? 'table' : isCover ? 'cover' : 'content'),
      layoutVariant,
    }];
  });
}

export function slideItems(slide: SlideData): SlideItem[] {
  return slide.items.length ? slide.items : slide.bullets.map((description) => ({ description, bullets: [] }));
}

export interface SlidePlan {
  kind: 'cover' | 'table' | 'quote' | 'timeline' | 'stats' | 'chart' | 'spotlight' | 'cards';
  columns: number;
  rows: number;
  variant: 'contrast' | 'pillars' | 'matrix' | 'masonry' | 'bento' | 'stacked' | 'rail' | 'checklist';
}

function countPlan(count: number): Pick<SlidePlan, 'columns' | 'rows' | 'variant'> {
  if (count <= 2) return { columns: 2, rows: 1, variant: 'contrast' };
  if (count === 3) return { columns: 3, rows: 1, variant: 'pillars' };
  if (count === 4) return { columns: 2, rows: 2, variant: 'matrix' };
  if (count === 5) return { columns: 3, rows: 2, variant: 'matrix' };
  if (count === 6) return { columns: 2, rows: 3, variant: 'rail' };
  if (count === 7 || count === 8) return { columns: 2, rows: 4, variant: 'rail' };
  return { columns: 3, rows: 3, variant: 'matrix' };
}

function variantPlan(count: number, variant?: SlideLayoutVariant): Pick<SlidePlan, 'columns' | 'rows' | 'variant'> | undefined {
  if (!variant) return undefined;
  if (variant === 'horizontal' && count >= 2 && count <= 5) return { columns: count, rows: 1, variant: 'pillars' };
  if (variant === 'vertical' && count >= 2 && count <= 3) return { columns: 1, rows: count, variant: 'stacked' };
  if (variant === 'masonry' && count === 5) return { columns: 2, rows: 3, variant: 'masonry' };
  if (variant === 'focus' && count === 5) return { columns: 3, rows: 2, variant: 'bento' };
  if (variant === 'two-column') return { columns: 2, rows: Math.ceil(count / 2), variant: count === 2 ? 'contrast' : 'rail' };
  if (variant === 'balanced') {
    if (count <= 3) return { columns: count, rows: 1, variant: count === 2 ? 'contrast' : 'pillars' };
    if (count === 4) return { columns: 2, rows: 2, variant: 'matrix' };
    if (count === 5 || count === 6) return { columns: 3, rows: 2, variant: 'matrix' };
    if (count === 7 || count === 8) return { columns: 4, rows: 2, variant: 'matrix' };
    return { columns: 3, rows: 3, variant: 'matrix' };
  }
  return undefined;
}

/** One layout decision feeds both the browser canvas and the PPTX exporter. */
export function getSlidePlan(slide: SlideData): SlidePlan {
  if (slide.layout === 'cover') return { kind: 'cover', columns: 1, rows: 1, variant: 'pillars' };
  if (slide.chart) return { kind: 'chart', columns: 2, rows: 1, variant: slide.layout === 'chart-left' ? 'contrast' : 'pillars' };
  if (slide.table) return { kind: 'table', columns: 1, rows: 1, variant: 'checklist' };
  if (slide.layout === 'quote') return { kind: 'quote', columns: 1, rows: 1, variant: 'pillars' };
  const items = slideItems(slide);
  const count = Math.max(1, items.length);
  const title = `${slide.title} ${slide.subtitle || ''}`.toLowerCase();
  const process = /路线|阶段|流程|步骤|历程|里程碑|演进|实施|calendar|roadmap|timeline|step/.test(title);
  const metric = /指标|数据|成效|优势|统计|kpi|metric|stats/.test(title);
  const detail = items.reduce((total, item) => total + itemText(item).length + (item.title?.length || 0), 0);
  const countLayout = countPlan(count);
  const selectedVariant = variantPlan(count, slide.layoutVariant);
  if (selectedVariant) return { kind: 'cards', ...selectedVariant };
  if (slide.layout === 'spotlight') return { kind: 'spotlight', columns: 3, rows: 2, variant: 'bento' };
  // An explicit grid5 declaration is a deliberate five-up comparison layout.
  // Do not let content heuristics turn it into short, clipped rows.
  if (slide.layout === 'grid5' && count === 5) {
    return { kind: 'cards', columns: 5, rows: 1, variant: 'pillars' };
  }
  if ((slide.layout === 'timeline' || (process && count >= 2 && count <= 5)) && count <= 5) {
    return { kind: 'timeline', columns: count, rows: 1, variant: 'pillars' };
  }
  if (slide.layout === 'stats' || (metric && count >= 2 && count <= 6)) {
    return { kind: 'stats', ...countPlan(Math.min(count, 6)) };
  }
  if (count === 5 && detail > 300) {
    return { kind: 'cards', columns: 2, rows: 3, variant: 'rail' };
  }
  if (count === 3 && detail > 300) {
    return { kind: 'cards', columns: 1, rows: 3, variant: 'stacked' };
  }
  if (count === 9 && detail > 720) {
    return { kind: 'cards', columns: 2, rows: 5, variant: 'rail' };
  }
  return { kind: 'cards', ...countLayout };
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

const MAX_CARD_BULLETS = 5;
const MAX_CARD_DESCRIPTION = 360;

function splitDescription(text = ''): string[] {
  if (text.length <= MAX_CARD_DESCRIPTION) return [text];
  const sentences = text.split(/(?<=[。！？；.!?;])\s*/).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > MAX_CARD_DESCRIPTION) {
      if (current) { parts.push(current); current = ''; }
      for (let index = 0; index < sentence.length; index += MAX_CARD_DESCRIPTION) parts.push(sentence.slice(index, index + MAX_CARD_DESCRIPTION));
    } else if (`${current}${sentence}`.length > MAX_CARD_DESCRIPTION && current) {
      parts.push(current); current = sentence;
    } else current += sentence;
  }
  return current ? [...parts, current] : parts;
}

/** Keep dense user/model content readable by turning it into continuation cards instead of clipping it. */
function splitDenseItem(item: SlideItem): SlideItem[] {
  const descriptions = splitDescription(item.description || '');
  const bulletGroups = chunk(item.bullets || [], MAX_CARD_BULLETS);
  const count = Math.max(descriptions.length, bulletGroups.length, 1);
  if (count === 1) return [item];
  return Array.from({ length: count }, (_, index) => ({
    ...item,
    title: index ? `${item.title || '要点'}（续）` : item.title,
    description: descriptions[index] || '',
    bullets: bulletGroups[index] || [],
  }));
}

/**
 * Preserve every item and table row. Dense slides become continuation slides instead of clipping.
 */
export function expandSlides(slides: SlideData[]): SlideData[] {
  return slides.flatMap<SlideData>((slide): SlideData[] => {
    if (slide.table && !slide.chart && slide.table.rows.length > 6) {
      return chunk(slide.table.rows, 6).map((rows, index) => ({
        ...slide,
        title: index ? `${slide.title}（续）` : slide.title,
        table: { ...slide.table!, rows },
        notes: index === 0 ? slide.notes : '',
        continuation: index > 0,
      }));
    }
    const items = slideItems(slide).flatMap(splitDenseItem);
    const normalizedSlide: SlideData = { ...slide, items, bullets: [] };
    // Chart views can render at most four text insights beside the graphic.
    // Repeat the chart on continuation pages rather than silently discarding insights.
    if (normalizedSlide.chart && items.length > 4) {
      return chunk(items, 4).map((pageItems, index) => ({
        ...normalizedSlide,
        title: index ? `${slide.title}（续）` : slide.title,
        items: pageItems,
        quoteText: index === 0 ? slide.quoteText : '',
        notes: index === 0 ? slide.notes : '',
        continuation: index > 0,
      }));
    }
    if (normalizedSlide.layout === 'quote' && items.length > 3) {
      return chunk(items, 3).map((pageItems, index) => ({
        ...normalizedSlide,
        title: index ? `${slide.title}（续）` : slide.title,
        items: pageItems,
        notes: index === 0 ? slide.notes : '',
        continuation: index > 0,
      }));
    }
    if (items.length <= 9 || normalizedSlide.layout === 'cover') return [normalizedSlide];
    return chunk(items, 9).map((pageItems, index) => ({
      ...normalizedSlide,
      title: index ? `${slide.title}（续）` : slide.title,
      items: pageItems,
      bullets: [],
      notes: index === 0 ? slide.notes : '',
      continuation: index > 0,
    }));
  });
}

export function buildSlideDeck(raw: string): SlideData[] {
  return expandSlides(parseMarkdownSlides(raw));
}

export function itemText(item: SlideItem): string {
  return [
    item.description,
    ...(item.bullets || []).map((bullet) => `• ${bullet}`),
    ...(item.children || []).flatMap((child) => [child.title, itemText(child)]),
  ].filter(Boolean).join('\n');
}
