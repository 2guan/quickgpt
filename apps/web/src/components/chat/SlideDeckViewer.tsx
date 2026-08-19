import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pptxgen from 'pptxgenjs';
import { Check, ChevronLeft, ChevronRight, Code, Copy, Download, FileText, Maximize2, Minimize2, Presentation } from 'lucide-react';
import {
  buildSlideDeck,
  cleanMarkdownText,
  COLOR_THEMES,
  DEFAULT_DECK_STYLE,
  getDeckStyle,
  getThemePalette,
  getSlidePlan,
  itemText,
  SLIDE_FONT,
  slideItems,
  type SlideData,
  type SlideItem,
  type SlideTheme,
} from './slideDeck.js';
import { useThemeStore } from '../../stores/themeStore.js';

export { buildSlideDeck as parseMarkdownSlides, cleanMarkdownText } from './slideDeck.js';
export type { SlideData, SlideItem } from './slideDeck.js';

interface SlideDeckProps { rawCode: string; isStreaming?: boolean; }

function renderFormattedText(text = ''): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-900/10 px-1 font-mono text-[.9em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

const hex = (color: string) => color.replace('#', '');
const itemDensity = (item: SlideItem) => cleanMarkdownText(itemText(item)).length;
const shouldCenterTableCell = (value: string) => {
  const text = cleanMarkdownText(value);
  return text.length <= 10 && !/[，。；：,:;]/.test(text);
};

const pptColors = (isDark: boolean) => isDark
  ? { background: '0F172A', card: '1E293B', border: '334155', title: 'F8FAFC', body: 'CBD5E1', muted: '94A3B8', stripe: '334155' }
  : { background: 'F8FAFC', card: 'FFFFFF', border: 'E2E8F0', title: '0F172A', body: '475569', muted: '64748B', stripe: 'CBD5E1' };

const SlideHeader: React.FC<{ slide: SlideData; theme: SlideTheme }> = ({ slide, theme }) => (
  <header className="mb-5 shrink-0">
    <div className="flex items-start gap-3"><span className="mt-1 h-7 w-2 shrink-0 rounded-full" style={{ backgroundColor: theme.accent }} />
      <div className="min-w-0"><h2 className="m-0 text-[25px] font-bold leading-tight text-slate-900 dark:text-slate-50">{renderFormattedText(slide.title)}</h2>
        {slide.subtitle && <p className="mb-0 mt-1 text-[14px] font-medium leading-snug text-slate-500 dark:text-slate-400">{renderFormattedText(slide.subtitle)}</p>}
      </div>
    </div>
  </header>
);

const ItemCard: React.FC<{ item: SlideItem; index: number; theme: SlideTheme; compact: boolean; timeline?: boolean; colorful?: boolean }> = ({ item, index, theme, compact, timeline, colorful = false }) => {
  const text = itemText(item);
  const dense = itemDensity(item) > (compact ? 150 : 230);
  const palette = getThemePalette(theme, colorful);
  const accent = colorful ? palette[index % palette.length] : theme.accent;
  return <article className="relative h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800" style={{ borderTopColor: timeline || colorful ? accent : undefined, borderTopWidth: timeline || colorful ? 3 : undefined }}>
    <div className="mb-2 flex min-w-0 items-start gap-2 border-b border-slate-100 pb-2 dark:border-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>{index + 1}</span>
      <h3 className={`min-w-0 flex-1 break-words font-bold leading-tight text-slate-900 dark:text-slate-50 ${dense ? (compact ? 'text-[12px]' : 'text-[14px]') : (compact ? 'text-[14px]' : 'text-[17px]')}`}>{renderFormattedText(item.title || `要点 ${index + 1}`)}</h3>
    </div>
    {text && <div className={`whitespace-pre-line break-words leading-relaxed text-slate-600 dark:text-slate-300 ${dense ? 'text-[10px]' : (compact ? 'text-[12px]' : 'text-[14px]')}`}>{renderFormattedText(text)}</div>}
  </article>;
};

const TableView: React.FC<{ slide: SlideData; theme: SlideTheme }> = ({ slide, theme }) => {
  const table = slide.table!;
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"><table className="w-full table-fixed border-collapse text-left text-[11px] leading-relaxed"><thead style={{ backgroundColor: theme.accent }}><tr>{table.headers.map((header, index) => <th key={index} className="break-words border-r border-white/25 px-3 py-2 text-center align-middle font-bold text-white last:border-r-0">{renderFormattedText(header)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? 'bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'}>{table.headers.map((_, colIndex) => <td key={colIndex} className={`break-words border-r border-t border-slate-100 px-3 py-2 align-middle text-slate-700 last:border-r-0 dark:border-slate-700 dark:text-slate-200 ${shouldCenterTableCell(row[colIndex] || '') ? 'text-center' : 'text-left'}`}>{renderFormattedText(row[colIndex] || '')}</td>)}</tr>)}</tbody></table></div>;
};

const ChartView: React.FC<{ chart: NonNullable<SlideData['chart']>; theme: SlideTheme; colorful: boolean }> = ({ chart, theme, colorful }) => {
  const colors = getThemePalette(theme, colorful); const width = 430; const height = 250; const left = 42; const top = 28; const bottom = 34; const right = 12;
  const values = chart.series.flatMap((series) => series.values); const max = Math.max(1, ...values) * 1.12; const plotW = width - left - right; const plotH = height - top - bottom;
  const point = (value: number, index: number, size: number) => `${left + (size < 2 ? plotW / 2 : index * plotW / (size - 1))},${top + plotH - value / max * plotH}`;
  if (chart.type === 'pie') { const series = chart.series[0]; const total = series.values.reduce((sum, value) => sum + value, 0) || 1; let offset = 0; return <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"><p className="mb-1 truncate text-center text-[11px] font-bold text-slate-700 dark:text-slate-200">{chart.title || series.name}</p><div className="flex h-[calc(100%-24px)] items-center gap-2"><svg className="h-full min-w-0 flex-1" viewBox="0 0 180 180" role="img" aria-label={chart.title || '饼图'}>{series.values.map((value, index) => { const dash = value / total * 100; const circle = <circle key={index} cx="90" cy="90" r="54" pathLength="100" fill="none" stroke={colors[index % colors.length]} strokeWidth="28" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />; offset += dash; return circle; })}<text x="90" y="86" textAnchor="middle" className="fill-slate-800 text-[13px] font-bold dark:fill-slate-100">{total.toFixed(1)}</text><text x="90" y="103" textAnchor="middle" className="fill-slate-400 text-[8px] dark:fill-slate-400">总计</text></svg><div className="min-w-0 space-y-1 text-[9px] text-slate-600 dark:text-slate-300">{chart.categories.map((label, index) => <div key={label} className="flex items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{label} {series.values[index]}</span></div>)}</div></div></div>; }
  const paths = chart.series.map((series, index) => ({ color: colors[index % colors.length], points: series.values.map((value, pointIndex) => point(value, pointIndex, series.values.length)).join(' ') }));
  const areaPath = (points: string) => `M ${left},${top + plotH} L ${points.replace(/ /g, ' L ')} L ${left + plotW},${top + plotH} Z`;
  return <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"><p className="mb-1 truncate text-center text-[11px] font-bold text-slate-700 dark:text-slate-200">{chart.title || '数据图表'}</p><svg className="h-[calc(100%-24px)] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title || '数据图表'}>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + plotH * ratio} y2={top + plotH * ratio} stroke="currentColor" className="text-slate-100 dark:text-slate-700" strokeWidth="1" /><text x={left - 5} y={top + plotH * ratio + 3} textAnchor="end" className="fill-slate-400 text-[8px]">{Math.round(max * (1 - ratio))}</text></g>)}{chart.type === 'bar' ? chart.series[0].values.map((value, index) => <g key={chart.categories[index]}><text x={left - 5} y={top + index * plotH / chart.categories.length + 12} textAnchor="end" className="fill-slate-500 text-[8px]">{chart.categories[index]}</text><rect x={left} y={top + index * plotH / chart.categories.length + 3} width={value / max * plotW} height={Math.max(8, plotH / chart.categories.length - 7)} rx="3" fill={colors[0]} /></g>) : chart.type === 'column' ? chart.series.flatMap((series, seriesIndex) => series.values.map((value, index) => <rect key={`${series.name}-${index}`} x={left + index * plotW / chart.categories.length + seriesIndex * (plotW / chart.categories.length / chart.series.length) + 5} y={top + plotH - value / max * plotH} width={Math.max(5, plotW / chart.categories.length / chart.series.length - 6)} height={value / max * plotH} rx="3" fill={colors[seriesIndex % colors.length]} />)) : paths.map((path, index) => <g key={chart.series[index].name}>{(chart.type === 'area' || chart.type === 'mountain') && <path d={areaPath(path.points)} fill={path.color} opacity="0.2" />}<polyline points={path.points} fill="none" stroke={path.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{chart.series[index].values.map((value, pointIndex) => <circle key={pointIndex} cx={point(value, pointIndex, chart.series[index].values.length).split(',')[0]} cy={point(value, pointIndex, chart.series[index].values.length).split(',')[1]} r="3" fill={path.color} />)}</g>)}{chart.type !== 'bar' && chart.categories.map((label, index) => <text key={label} x={left + (chart.categories.length < 2 ? plotW / 2 : index * plotW / (chart.categories.length - 1))} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[8px]">{label}</text>)}<g transform={`translate(${left}, ${top - 13})`}>{chart.series.map((series, index) => <g key={series.name} transform={`translate(${index * 82}, 0)`}><circle cx="4" cy="4" r="4" fill={colors[index % colors.length]} /><text x="11" y="7" className="fill-slate-500 text-[8px] dark:fill-slate-300">{series.name}</text></g>)}</g></svg></div>;
};

function webCardPlacement(plan: ReturnType<typeof getSlidePlan>, index: number): React.CSSProperties | undefined {
  if (plan.variant === 'bento') {
    if (index === 0) return { gridColumn: '1', gridRow: '1 / span 2' };
    const position = index - 1;
    return { gridColumn: String(2 + (position % 2)), gridRow: String(1 + Math.floor(position / 2)) };
  }
  if (plan.variant === 'masonry') {
    if (index === 0) return { gridColumn: '1', gridRow: '1 / span 2' };
    if (index === 1) return { gridColumn: '2', gridRow: '1' };
    if (index === 2) return { gridColumn: '2', gridRow: '2' };
    return { gridColumn: String(index === 3 ? 1 : 2), gridRow: '3' };
  }
  return undefined;
}

const SlideBody: React.FC<{ slide: SlideData; theme: SlideTheme; colorful: boolean }> = ({ slide, theme, colorful }) => {
  const plan = getSlidePlan(slide);
  const items = slideItems(slide);
  if (plan.kind === 'cover') return <div className="flex h-full flex-col items-center justify-center px-16 text-center text-white"><h1 className={`max-w-[720px] break-words font-bold leading-tight ${slide.title.length > 26 ? 'text-[35px]' : 'text-[46px]'}`}>{renderFormattedText(slide.title)}</h1>{slide.subtitle && <p className="mt-4 max-w-[720px] break-words text-[18px] leading-relaxed text-white/80">{renderFormattedText(slide.subtitle)}</p>}{(slide.quoteText || slide.notes) && <p className="mt-7 max-w-[700px] rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[13px] font-medium leading-relaxed">{renderFormattedText(slide.quoteText || slide.notes || '')}</p>}</div>;
  if (plan.kind === 'quote') return <div className="flex flex-1 flex-col justify-center gap-5"><blockquote className="m-0 rounded-2xl border-l-8 bg-slate-50 px-8 py-7 text-center text-[22px] font-bold leading-relaxed text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100" style={{ borderLeftColor: theme.accent }}>{renderFormattedText(slide.quoteText || slide.title)}</blockquote>{items.length > 0 && <div className="grid grid-cols-3 gap-3">{items.map((item, index) => <ItemCard key={index} item={item} index={index} theme={theme} compact colorful={colorful} />)}</div>}</div>;
  if (plan.kind === 'table') return <div className="flex flex-1 flex-col justify-center gap-3"><TableView slide={slide} theme={theme} />{slide.quoteText && <aside className="rounded-xl border-l-4 px-4 py-2 text-center text-[12px] font-bold leading-relaxed" style={{ borderColor: theme.accent, backgroundColor: theme.cardBg, color: theme.textColor }}>{renderFormattedText(slide.quoteText)}</aside>}{slide.notes && <aside className="rounded-xl border px-4 py-2 text-center text-[11px] font-medium leading-relaxed" style={{ borderColor: theme.accentSoft, backgroundColor: theme.cardBg, color: theme.textColor }}>💡 {renderFormattedText(slide.notes)}</aside>}</div>;
  if (plan.kind === 'spotlight') { const topCount = items.length > 3 ? 3 : items.length; const highlights = items.slice(0, topCount); const details = items.slice(topCount); return <div className="flex flex-1 flex-col gap-4"><div className="rounded-2xl border-l-4 bg-slate-50 p-3 dark:bg-slate-800" style={{ borderColor: theme.accent }}><div className={`grid gap-3 ${highlights.length === 1 ? 'grid-cols-1' : highlights.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{highlights.map((item, index) => <ItemCard key={index} item={item} index={index} theme={theme} compact colorful={colorful} />)}</div></div>{details.length > 0 && <div className={`grid min-h-0 flex-1 gap-4 ${details.length === 1 ? 'grid-cols-1' : details.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{details.map((item, index) => <ItemCard key={index} item={item} index={index + topCount} theme={theme} compact={false} colorful={colorful} />)}</div>}</div>; }
  if (plan.kind === 'chart' && slide.chart) { const chartFirst = slide.layout === 'chart-left'; return <div className="flex flex-1 flex-col justify-center gap-3"><div className="grid min-h-0 flex-1 grid-cols-2 gap-4">{chartFirst && <ChartView chart={slide.chart} theme={theme} colorful={colorful} />}<div className="grid min-h-0 grid-rows-[auto_1fr] gap-3"><div><p className="text-[17px] font-bold text-slate-800 dark:text-slate-100">{slide.chart.title || '关键洞察'}</p>{slide.subtitle && <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{slide.subtitle}</p>}</div><div className="grid min-h-0 grid-rows-2 gap-3">{items.slice(0, 2).map((item, index) => <ItemCard key={index} item={item} index={index} theme={theme} compact colorful={colorful} />)}</div></div>{!chartFirst && <ChartView chart={slide.chart} theme={theme} colorful={colorful} />}</div>{slide.quoteText && <aside className="rounded-xl border-l-4 px-4 py-2 text-center text-[12px] font-bold leading-relaxed" style={{ borderColor: theme.accent, backgroundColor: theme.cardBg, color: theme.textColor }}>{renderFormattedText(slide.quoteText)}</aside>}</div>; }
  const compact = plan.rows > 1 || plan.columns >= 4 || plan.kind === 'stats';
  return <div className="flex flex-1 flex-col justify-center gap-3"><div className={`relative grid flex-1 gap-3 ${plan.kind === 'timeline' ? 'pt-5' : ''}`} style={{ gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${plan.rows}, minmax(0, 1fr))` }}>{plan.kind === 'timeline' && <div className="absolute left-8 right-8 top-[20px] h-px bg-slate-200 dark:bg-slate-700" />}{items.map((item, index) => <div key={index} className="min-h-0" style={webCardPlacement(plan, index)}><ItemCard item={item} index={index} theme={theme} compact={compact} timeline={plan.kind === 'timeline'} colorful={colorful} /></div>)}</div>{slide.quoteText && <aside className="rounded-xl border-l-4 px-4 py-2 text-center text-[12px] font-bold leading-relaxed dark:bg-slate-800 dark:text-slate-100" style={{ borderColor: theme.accent, backgroundColor: theme.cardBg, color: theme.textColor }}>{renderFormattedText(slide.quoteText)}</aside>}{slide.notes && <aside className="rounded-xl border px-4 py-2 text-center text-[11px] font-medium leading-relaxed dark:bg-slate-800 dark:text-slate-200" style={{ borderColor: theme.accentSoft, backgroundColor: theme.cardBg, color: theme.textColor }}>💡 {renderFormattedText(slide.notes)}</aside>}</div>;
};

function pptText(fontSize: number, color: string, bold = false) { return { fontFace: 'Microsoft YaHei', fontSize, color, bold, breakLine: true, fit: 'shrink' as const, margin: 0.04, valign: 'top' as const }; }
function addPptHeader(slide: any, deck: any, data: SlideData, theme: SlideTheme, isDark: boolean) {
  const colors = pptColors(isDark);
  slide.background = { color: colors.background };
  slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: hex(theme.accent) }, line: { color: hex(theme.accent) } });
  slide.addShape(deck.ShapeType.roundRect, { x: 0.6, y: 0.34, w: 0.08, h: 0.38, rectRadius: 0.04, fill: { color: hex(theme.accent) }, line: { color: hex(theme.accent) } });
  slide.addText(cleanMarkdownText(data.title), { x: 0.8, y: 0.29, w: 8.7, h: 0.38, ...pptText(17, colors.title, true) });
  if (data.subtitle) slide.addText(cleanMarkdownText(data.subtitle), { x: 0.8, y: 0.76, w: 8.7, h: 0.3, ...pptText(9.5, colors.muted) });
}
function addPptCard(slide: any, deck: any, item: SlideItem, index: number, x: number, y: number, w: number, h: number, theme: SlideTheme, timeline: boolean, isDark: boolean, colorful = false) {
  const colors = pptColors(isDark);
  const palette = getThemePalette(theme, colorful);
  const accent = hex(colorful ? palette[index % palette.length] : theme.accent);
  const body = cleanMarkdownText(itemText(item)); const dense = body.length > 180 || h < 1.5;
  // The accent is a complete card behind the content card, offset upward by a
  // few pixels. The foreground card naturally reveals only the rounded top.
  if (timeline || colorful) slide.addShape(deck.ShapeType.roundRect, { x, y: y - 0.07, w, h, rectRadius: 0.2, fill: { color: accent }, line: { color: accent, width: 0.7 } });
  slide.addShape(deck.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.2, fill: { color: colors.card }, line: { color: colors.border, width: 0.7 } });
  slide.addShape(deck.ShapeType.ellipse, { x: x + 0.13, y: y + 0.13, w: 0.24, h: 0.24, fill: { color: accent }, line: { color: accent } });
  slide.addText(String(index + 1), { x: x + 0.13, y: y + 0.125, w: 0.24, h: 0.24, fontFace: 'Microsoft YaHei', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  slide.addText(cleanMarkdownText(item.title || `要点 ${index + 1}`), { x: x + 0.43, y: y + 0.1, w: w - 0.56, h: 0.3, ...pptText(h < 1.5 ? 8 : body.length < 60 ? 12 : 10, colors.title, true), valign: 'middle' });
  if (body) slide.addText(body, { x: x + 0.15, y: y + 0.48, w: w - 0.3, h: h - 0.6, ...pptText(dense ? 6.7 : body.length < 60 ? 10.5 : body.length < 120 ? 9.2 : 8.3, colors.body) });
}
function pptCardBox(plan: ReturnType<typeof getSlidePlan>, index: number, x: number, y: number, cardW: number, cardH: number, gap: number) {
  if (plan.variant === 'bento') {
    if (index === 0) return { x, y, w: cardW, h: cardH * 2 + gap };
    const position = index - 1;
    return { x: x + (1 + (position % 2)) * (cardW + gap), y: y + Math.floor(position / 2) * (cardH + gap), w: cardW, h: cardH };
  }
  if (plan.variant === 'masonry') {
    if (index === 0) return { x, y, w: cardW, h: cardH * 2 + gap };
    if (index === 1) return { x: x + cardW + gap, y, w: cardW, h: cardH };
    if (index === 2) return { x: x + cardW + gap, y: y + cardH + gap, w: cardW, h: cardH };
    return { x: x + (index === 3 ? 0 : cardW + gap), y: y + 2 * (cardH + gap), w: cardW, h: cardH };
  }
  return { x: x + (index % plan.columns) * (cardW + gap), y: y + Math.floor(index / plan.columns) * (cardH + gap), w: cardW, h: cardH };
}
function addPptTable(slide: any, data: SlideData, theme: SlideTheme, y: number, h: number, isDark: boolean) {
  const colors = pptColors(isDark);
  const table = data.table!;
  const bodyFontSize = table.headers.length >= 6 ? 8.2 : 9;
  const rowH = h / (table.rows.length + 1);
  const rows = [table.headers.map((text) => ({ text: cleanMarkdownText(text), options: { fill: { color: hex(theme.accent) }, color: 'FFFFFF', bold: true, fontFace: 'Microsoft YaHei', fontSize: bodyFontSize + 0.7, align: 'center', valign: 'middle' } })), ...table.rows.map((row, rowIndex) => table.headers.map((_, index) => ({ text: cleanMarkdownText(row[index] || ''), options: { fill: { color: rowIndex % 2 ? colors.background : colors.card }, color: colors.body, fontFace: 'Microsoft YaHei', fontSize: bodyFontSize, align: shouldCenterTableCell(row[index] || '') ? 'center' : 'left', valign: 'middle' } })))];
  slide.addTable(rows, { x: 0.6, y, w: 8.8, h, rowH, border: { type: 'solid', pt: 0.5, color: colors.border }, margin: [0.08, 0.1, 0.08, 0.1] });
}
function addPptChart(slide: any, deck: any, chart: NonNullable<SlideData['chart']>, theme: SlideTheme, isDark: boolean, colorful: boolean, x: number, y: number, w: number, h: number) {
  const colors = pptColors(isDark); const type = chart.type === 'pie' ? deck.ChartType.doughnut : chart.type === 'bar' || chart.type === 'column' ? deck.ChartType.bar : chart.type === 'line' ? deck.ChartType.line : deck.ChartType.area;
  const palette = getThemePalette(theme, colorful).map(hex);
  const chartColors = chart.type === 'pie' || chart.series.length > 1 ? palette : [palette[0]];
  slide.addChart(type, chart.series.map((series) => ({ name: series.name, labels: chart.categories, values: series.values })), { x, y, w, h, showTitle: !!chart.title, title: chart.title, titleFontFace: 'Microsoft YaHei', titleFontSize: 10, titleColor: colors.title, showLegend: chart.series.length > 1 || chart.type === 'pie', legendColor: colors.body, legendFontFace: 'Microsoft YaHei', legendFontSize: 7, chartColors, showValue: false, showCatName: false, showLabel: false, showPercent: false, holeSize: chart.type === 'pie' ? 52 : undefined, catAxisLabelColor: colors.muted, catAxisLabelFontFace: 'Microsoft YaHei', catAxisLabelFontSize: 7, valAxisLabelColor: colors.muted, valAxisLabelFontFace: 'Microsoft YaHei', valAxisLabelFontSize: 7, valGridLine: { color: colors.border, style: 'solid', transparency: 35 }, chartArea: { fill: { color: colors.background }, border: { color: colors.background, transparency: 100 } }, plotArea: { fill: { color: colors.background, transparency: 100 }, border: { color: colors.background, transparency: 100 } }, lineSize: 2.5, lineDataSymbol: 'circle', barDir: chart.type === 'bar' ? 'bar' : 'col', barGrouping: 'clustered' });
}
async function exportPptx(slides: SlideData[], theme: SlideTheme, isDark: boolean, colorful: boolean) {
  const deck = new pptxgen(); deck.layout = 'LAYOUT_16x9';
  slides.forEach((data) => {
    const slide = deck.addSlide(); const plan = getSlidePlan(data); const colors = pptColors(isDark);
    if (plan.kind === 'cover') {
      slide.background = { color: isDark ? colors.background : hex(theme.bg) };
      const title = cleanMarkdownText(data.title); slide.addText(title, { x: 0.9, y: 1.55, w: 8.2, h: 1.35, fontFace: 'Microsoft YaHei', fontSize: title.length > 25 ? 22 : 29, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fit: 'shrink' as const, margin: 0.04 });
      if (data.subtitle) slide.addText(cleanMarkdownText(data.subtitle), { x: 1.2, y: 3.0, w: 7.6, h: 0.48, fontFace: 'Microsoft YaHei', fontSize: 11, color: 'DCE7F5', align: 'center', fit: 'shrink' as const });
      const quote = cleanMarkdownText(data.quoteText || data.notes || ''); if (quote) slide.addText(quote, { x: 1.3, y: 3.85, w: 7.4, h: 0.42, fontFace: 'Microsoft YaHei', fontSize: 9.5, bold: true, color: 'FFFFFF', align: 'center', fit: 'shrink' as const });
      return;
    }
    addPptHeader(slide, deck, data, theme, isDark); const contentY = data.subtitle ? 1.22 : 1.02; const noteH = data.notes ? 0.38 : 0; const quoteH = data.quoteText ? 0.46 : 0; const contentH = 4.1 - noteH - quoteH;
    if (plan.kind === 'table') addPptTable(slide, data, theme, contentY + 0.05, contentH, isDark);
    else if (plan.kind === 'spotlight') { const items = slideItems(data); const topCount = items.length > 3 ? 3 : items.length; const gap = 0.16; const topW = (8.8 - gap * Math.max(0, topCount - 1)) / Math.max(1, topCount); items.slice(0, topCount).forEach((item, index) => addPptCard(slide, deck, item, index, 0.6 + index * (topW + gap), contentY, topW, 1.1, theme, false, isDark, colorful)); const details = items.slice(topCount); const detailW = (8.8 - gap * Math.max(0, details.length - 1)) / Math.max(1, details.length); details.forEach((item, index) => addPptCard(slide, deck, item, index + topCount, 0.6 + index * (detailW + gap), contentY + 1.32, detailW, contentH - 1.32, theme, false, isDark, colorful)); }
    else if (plan.kind === 'chart' && data.chart) { const chartLeft = data.layout === 'chart-left'; const chartX = chartLeft ? 0.6 : 5.15; const insightX = chartLeft ? 5.15 : 0.6; addPptChart(slide, deck, data.chart, theme, isDark, colorful, chartX, contentY, 4.25, contentH); slideItems(data).slice(0, 2).forEach((item, index) => addPptCard(slide, deck, item, index, insightX, contentY + index * (contentH / 2 + 0.08), 4.25, contentH / 2 - 0.08, theme, false, isDark, colorful)); }
    else if (plan.kind === 'quote') { const quoteItems = slideItems(data); const quoteY = quoteItems.length ? 1.4 : 2.0; const quoteH = quoteItems.length ? 1.15 : 1.45; slide.addShape(deck.ShapeType.roundRect, { x: 0.85, y: quoteY, w: 8.3, h: quoteH, rectRadius: 0.12, fill: { color: isDark ? colors.card : hex(theme.cardBg) }, line: { color: hex(theme.accent), width: 1 } }); slide.addText(cleanMarkdownText(data.quoteText || data.title), { x: 1.1, y: quoteY + 0.12, w: 7.8, h: quoteH - 0.24, fontFace: 'Microsoft YaHei', fontSize: quoteItems.length ? 12.5 : 15, bold: true, color: isDark ? colors.title : hex(theme.textColor), align: 'center', valign: 'middle', fit: 'shrink' as const, margin: 0.04 }); quoteItems.forEach((item, index) => addPptCard(slide, deck, item, index, 0.6 + index * ((8.8 - (quoteItems.length - 1) * 0.16) / quoteItems.length + 0.16), 2.85, (8.8 - (quoteItems.length - 1) * 0.16) / quoteItems.length, 1.35, theme, false, isDark, colorful)); }
    else { const items = slideItems(data); const gap = 0.16; const cardW = (8.8 - gap * (plan.columns - 1)) / plan.columns; const cardH = (contentH - gap * (plan.rows - 1)) / plan.rows; if (plan.kind === 'timeline') slide.addShape(deck.ShapeType.rect, { x: 0.9, y: contentY + 0.23, w: 8.2, h: 0.02, fill: { color: colors.stripe }, line: { color: colors.stripe } }); items.forEach((item, index) => { const box = pptCardBox(plan, index, 0.6, contentY, cardW, cardH, gap); addPptCard(slide, deck, item, index, box.x, box.y, box.w, box.h, theme, plan.kind === 'timeline', isDark, colorful); }); }
    if (data.quoteText && plan.kind !== 'quote') { const quoteY = contentY + contentH + 0.1; slide.addShape(deck.ShapeType.roundRect, { x: 0.6, y: quoteY, w: 8.8, h: 0.34, rectRadius: 0.06, fill: { color: isDark ? colors.card : hex(theme.cardBg) }, line: { color: hex(theme.accent), width: 0.5 } }); slide.addText(cleanMarkdownText(data.quoteText), { x: 0.76, y: quoteY + 0.07, w: 8.45, h: 0.16, fontFace: 'Microsoft YaHei', fontSize: 8.5, bold: true, color: isDark ? colors.title : hex(theme.textColor), align: 'center', fit: 'shrink' as const }); }
    if (data.notes) { slide.addShape(deck.ShapeType.roundRect, { x: 0.6, y: 5.02, w: 8.8, h: 0.34, rectRadius: 0.06, fill: { color: isDark ? colors.card : hex(theme.cardBg) }, line: { color: hex(theme.accent), width: 0.5 } }); slide.addText(`💡 ${cleanMarkdownText(data.notes)}`, { x: 0.76, y: 5.09, w: 8.45, h: 0.15, fontFace: 'Microsoft YaHei', fontSize: 7.8, color: isDark ? colors.body : hex(theme.textColor), align: 'center', fit: 'shrink' as const }); slide.addNotes(cleanMarkdownText(data.notes)); }
  });
  const name = cleanMarkdownText(slides[0]?.title || '演示文稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30); await deck.writeFile({ fileName: `${name}_QuickGPT.pptx` });
}

export const SlideDeckViewer: React.FC<SlideDeckProps> = ({ rawCode, isStreaming = false }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const deckStyle = useMemo(() => getDeckStyle(rawCode), [rawCode]);
  const defaultThemeIndex = Math.max(0, COLOR_THEMES.findIndex((theme) => theme.id === DEFAULT_DECK_STYLE.themeId));
  const [slides, setSlides] = useState<SlideData[]>(() => isStreaming ? [] : buildSlideDeck(rawCode)); const [currentIndex, setCurrentIndex] = useState(0); const [themeIndex, setThemeIndex] = useState(defaultThemeIndex); const [isColorful, setIsColorful] = useState(DEFAULT_DECK_STYLE.colorful); const [isFullscreen, setIsFullscreen] = useState(false); const [isSourceMode, setIsSourceMode] = useState(false); const [isExporting, setIsExporting] = useState(false); const [copied, setCopied] = useState(false); const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null); const touchStart = useRef<number | null>(null); const appliedStyle = useRef(''); const theme = COLOR_THEMES[themeIndex] ?? COLOR_THEMES[defaultThemeIndex];
  useEffect(() => {
    // Keep the component mounted while streaming, but show a meaningful final
    // page as soon as its title/structure arrives instead of waiting for the
    // next page delimiter (which does not exist for the last slide).
    const next = buildSlideDeck(rawCode);
    if (next.length) setSlides(next);
  }, [rawCode]);
  useEffect(() => {
    const key = `${deckStyle.themeId}:${deckStyle.colorful}`;
    if (appliedStyle.current === key) return;
    appliedStyle.current = key;
    setThemeIndex(Math.max(0, COLOR_THEMES.findIndex((theme) => theme.id === deckStyle.themeId)));
    setIsColorful(deckStyle.colorful);
  }, [deckStyle]);
  const updateScale = useCallback(() => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect?.width) return; const next = Math.max(0.1, Math.min(rect.width / 960, rect.height > 0 ? rect.height / 540 : 1)); setScale((previous) => Math.abs(previous - next) > 0.001 ? next : previous); }, []);
  useEffect(() => { const element = containerRef.current; if (!element) return; const observer = new ResizeObserver(updateScale); observer.observe(element); updateScale(); return () => observer.disconnect(); }, [updateScale, isFullscreen]);
  const total = slides.length; const safeIndex = Math.min(currentIndex, Math.max(0, total - 1)); const currentSlide = slides[safeIndex];
  useEffect(() => { if (!isFullscreen) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsFullscreen(false); if (event.key === 'ArrowLeft' || event.key === 'PageUp') setCurrentIndex((index) => Math.max(0, index - 1)); if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); setCurrentIndex((index) => Math.min(total - 1, index + 1)); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [isFullscreen, total]);
  const copySource = async () => {
    try { await navigator.clipboard.writeText(rawCode); }
    catch {
      const textarea = document.createElement('textarea');
      textarea.value = rawCode; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  const download = async () => { if (!slides.length) return; setIsExporting(true); try { await exportPptx(slides, theme, isDark, isColorful); } catch (error: any) { alert(`导出 PPTX 失败：${error.message}`); } finally { setIsExporting(false); } };
  const canvas = useMemo(() => currentSlide && <div style={{ width: 960, height: 540, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: SLIDE_FONT, backgroundColor: currentSlide.layout === 'cover' ? theme.bg : isDark ? '#0f172a' : '#ffffff' }} className={`not-prose absolute left-0 top-0 flex flex-col overflow-hidden p-8 ${currentSlide.layout === 'cover' ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{currentSlide.layout !== 'cover' && <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: theme.accent }} />}{currentSlide.layout === 'cover' ? <SlideBody slide={currentSlide} theme={theme} colorful={isColorful} /> : <><SlideHeader slide={currentSlide} theme={theme} /><SlideBody slide={currentSlide} theme={theme} colorful={isColorful} /></>}</div>, [currentSlide, isColorful, isDark, scale, theme]);
  if (!currentSlide) return <section className="not-prose my-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900"><div className="aspect-video w-full bg-slate-100 p-3 dark:bg-slate-950"><div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"><Presentation className="mr-2 h-5 w-5 text-emerald-600" />正在生成完整幻灯片…</div></div></section>;
  return <section className={`not-prose my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900 ${isFullscreen ? 'fixed inset-0 z-50 flex flex-col rounded-none bg-slate-950 p-4 sm:p-8' : 'mx-auto w-full max-w-3xl'}`} aria-label="AI 幻灯片演示">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><div className="flex min-w-0 items-center gap-2"><span className="rounded-lg bg-orange-100 p-1 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">{isSourceMode ? <Code className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}</span><span className="truncate font-semibold text-slate-800 dark:text-slate-100">{isSourceMode ? 'PPT 源码视图' : `AI 幻灯片演示（${safeIndex + 1} / ${total}）`}</span></div><div className="flex items-center gap-1.5"><button onClick={() => setIsSourceMode((value) => !value)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={isSourceMode ? '显示 PPT 预览' : '显示 PPT 源码'}>{isSourceMode ? <Presentation className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</button>{!isSourceMode && <><div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 dark:border-slate-600 dark:bg-slate-800" aria-label="选择颜色主题">{COLOR_THEMES.map((colorTheme, index) => <button key={colorTheme.id} onClick={() => setThemeIndex(index)} title={colorTheme.name} aria-label={`切换到${colorTheme.name}`} className={`h-3.5 w-3.5 rounded-full ${themeIndex === index ? 'ring-2 ring-slate-500 ring-offset-1 dark:ring-slate-300' : ''}`} style={{ backgroundColor: colorTheme.accent }} />)}</div><button onClick={() => setIsColorful((value) => !value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={isColorful ? '切换为单色配色' : '切换为彩色配色'}>{isColorful ? '彩色' : '单色'}</button><button onClick={download} disabled={isExporting} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">{isExporting ? '生成中…' : '下载 PPTX'}</span></button><button onClick={() => setIsFullscreen((value) => !value)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={isFullscreen ? '退出全屏' : '全屏放映'}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button></>}{isSourceMode && <button onClick={copySource} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}<span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span></button>}</div></div>
    {isSourceMode ? <div className="m-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner"><div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-5 py-3 text-xs text-slate-300"><span className="font-mono">PPT Markdown</span><button onClick={copySource} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-200 hover:bg-slate-800" aria-label="复制 PPT 源码">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? '已复制' : '复制代码'}</button></div><div className="max-h-[460px] overflow-x-auto overflow-y-scroll" style={{ scrollbarGutter: 'stable' }}><code className="block whitespace-pre p-7 font-mono text-[13px] leading-6 text-slate-100 selection:bg-emerald-500/40">{rawCode}</code></div></div> : <><div ref={containerRef} className={`flex min-h-0 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-950 ${isFullscreen ? 'flex-1 p-4' : 'h-[360px] p-3 sm:h-[460px]'}`} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const start = touchStart.current; const end = event.changedTouches[0]?.clientX; if (start !== null && end !== undefined && Math.abs(start - end) > 40) setCurrentIndex((index) => Math.max(0, Math.min(total - 1, index + (start > end ? 1 : -1)))); touchStart.current = null; }}><div className="relative shrink-0 overflow-hidden rounded-2xl border border-slate-200 shadow-lg dark:border-slate-700" style={{ width: 960 * scale, height: 540 * scale }}>{canvas}</div></div><nav className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" aria-label="幻灯片分页"><button onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={!safeIndex} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"><ChevronLeft className="h-4 w-4" />上一页</button><div className="flex max-w-[200px] gap-1 overflow-x-auto py-1">{slides.map((_, index) => <button key={index} onClick={() => setCurrentIndex(index)} aria-label={`跳转到第 ${index + 1} 页`} className={`h-2 w-2 shrink-0 rounded-full ${safeIndex === index ? 'w-5 bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`} />)}</div><button onClick={() => setCurrentIndex((index) => Math.min(total - 1, index + 1))} disabled={safeIndex === total - 1} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">下一页<ChevronRight className="h-4 w-4" /></button></nav></>}
  </section>;
};
