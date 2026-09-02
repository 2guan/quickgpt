import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pptxgen from 'pptxgenjs';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Download,
  FileCode,
  Maximize2,
  Minimize2,
  Presentation,
  Sparkles,
} from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore.js';

interface HtmlSlideDeckViewerProps {
  rawCode: string;
  isStreaming?: boolean;
}

/**
 * Robustly extract individual slide HTML snippets from LLM output.
 */
function parseHtmlSlides(raw: string, isStreaming = false): string[] {
  if (!raw || !raw.trim()) return [];

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:html-ppt|html:ppt|html)?\n?/i, '').replace(/```$/i, '').trim();

  // 1. Primary: Match all complete <section ...>...</section> tags
  const sectionRegex = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  const sections: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(cleaned)) !== null) {
    sections.push(match[0]);
  }

  if (sections.length > 0) {
    return sections;
  }

  // 2. Secondary: Match by <!-- slide --> or --- dividers
  if (cleaned.includes('<!-- slide -->') || cleaned.includes('<!-- page -->') || cleaned.includes('\n---\n')) {
    const parts = cleaned
      .split(/<!--\s*(?:slide|page)\s*-->|(?:\n\s*---\s*\n)/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    if (parts.length > 0) return parts;
  }

  // 3. Tertiary: Match <div class="...slide..."> tags
  const divSlideRegex = /<div\b[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  const divSlides: string[] = [];
  while ((match = divSlideRegex.exec(cleaned)) !== null) {
    divSlides.push(match[0]);
  }
  if (divSlides.length > 0) return divSlides;

  // Fallback: Return raw cleaned text
  return cleaned.length > 10 ? [cleaned] : [];
}

/** Helper to clean text for PowerPoint */
function cleanText(text = ''): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/<\/?[a-zA-Z0-9_-]+>?/g, '')
    .replace(/^[a-zA-Z0-9_-]+>\s*$/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Helper to parse RGB/RGBA string */
function parseRgba(colorStr: string): { r: number; g: number; b: number; a: number; hex: string } | null {
  if (!colorStr || colorStr === 'transparent') return null;
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  return { r, g, b, a, hex };
}

/**
 * Universal High-Fidelity Slide Background Detector:
 * Mathematically detects custom Hex gradients, light themes, ocean cyan, and dark luxury themes.
 */
function detectSlideBackground(classes = ''): { dataUrl: string; isLight: boolean; c1: string } {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', isLight: false, c1: '#020617' };

  // 1. Direct Regex Extraction of Hex gradients
  const fromHex = classes.match(/from-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const viaHex = classes.match(/via-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const toHex = classes.match(/to-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const bgHex = classes.match(/bg-\[#?([0-9a-fA-F]{6})\]/)?.[1];

  let c1 = '#020617';
  let c2 = '#0f172a';
  let c3 = '#020617';
  let isLight = false;
  let glow1 = 'rgba(99, 102, 241, 0.18)';
  let glow2 = 'rgba(45, 212, 191, 0.14)';

  if (fromHex && toHex) {
    c1 = '#' + fromHex.toUpperCase();
    c2 = viaHex ? '#' + viaHex.toUpperCase() : c1;
    c3 = '#' + toHex.toUpperCase();
    const r = parseInt(fromHex.slice(0, 2), 16) || 0;
    const g = parseInt(fromHex.slice(2, 4), 16) || 0;
    const b = parseInt(fromHex.slice(4, 6), 16) || 0;
    const br = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = br > 175 && !classes.includes('text-white') && !classes.includes('text-slate-100');
    glow1 = 'rgba(255, 255, 255, 0.12)';
    glow2 = 'rgba(255, 255, 255, 0.08)';
  } else if (bgHex) {
    c1 = '#' + bgHex.toUpperCase();
    c2 = c1;
    c3 = c1;
    const r = parseInt(bgHex.slice(0, 2), 16) || 0;
    const g = parseInt(bgHex.slice(2, 4), 16) || 0;
    const b = parseInt(bgHex.slice(4, 6), 16) || 0;
    const br = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = br > 175 && !classes.includes('text-white') && !classes.includes('text-slate-100');
    glow1 = isLight ? 'rgba(59, 130, 246, 0.06)' : 'rgba(99, 102, 241, 0.18)';
    glow2 = isLight ? 'rgba(14, 165, 233, 0.04)' : 'rgba(45, 212, 191, 0.14)';
  } else {
    // 2. Tailwind class name matching
    isLight =
      classes.includes('bg-white') ||
      classes.includes('bg-slate-50') ||
      classes.includes('bg-slate-100') ||
      classes.includes('bg-neutral-50') ||
      classes.includes('bg-stone-50') ||
      classes.includes('bg-teal-50') ||
      classes.includes('bg-amber-50') ||
      ((classes.includes('text-slate-800') || classes.includes('text-slate-900') || classes.includes('text-stone-800') || classes.includes('text-teal-950') || classes.includes('text-neutral-900')) &&
        !classes.includes('from-slate-950') &&
        !classes.includes('from-[#'));

    if (isLight) {
      if (classes.includes('stone') || classes.includes('amber') || classes.includes('orange')) {
        c1 = '#FAF8F5';
        c2 = '#F5F2EC';
        c3 = '#EFECE6';
        glow1 = 'rgba(217, 119, 6, 0.06)';
        glow2 = 'rgba(180, 83, 9, 0.04)';
      } else if (classes.includes('teal') || classes.includes('cyan')) {
        c1 = '#F0FDFA';
        c2 = '#E6FFFA';
        c3 = '#CCFBF1';
        glow1 = 'rgba(20, 184, 166, 0.08)';
        glow2 = 'rgba(6, 182, 212, 0.06)';
      } else {
        c1 = '#FFFFFF';
        c2 = '#F8FAFC';
        c3 = '#F1F5F9';
        glow1 = 'rgba(59, 130, 246, 0.06)';
        glow2 = 'rgba(14, 165, 233, 0.04)';
      }
    } else if (classes.includes('amber') || classes.includes('orange') || classes.includes('stone') || classes.includes('yellow')) {
      c1 = '#0c0a09';
      c2 = '#22160d';
      c3 = '#141210';
      glow1 = 'rgba(245, 158, 11, 0.22)';
      glow2 = 'rgba(234, 88, 12, 0.16)';
    } else if (classes.includes('emerald') || classes.includes('green') || classes.includes('teal')) {
      c1 = '#021A15';
      c2 = '#052E24';
      c3 = '#011410';
      glow1 = 'rgba(16, 185, 129, 0.20)';
      glow2 = 'rgba(20, 184, 166, 0.14)';
    } else if (classes.includes('blue') || classes.includes('cyan') || classes.includes('sky')) {
      c1 = '#030712';
      c2 = '#172554';
      c3 = '#030712';
      glow1 = 'rgba(59, 130, 246, 0.18)';
      glow2 = 'rgba(6, 182, 212, 0.14)';
    }
  }

  const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.5, c2);
  grad.addColorStop(1, c3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1920, 1080);

  // Top-right ambient glow
  const g1 = ctx.createRadialGradient(1700, 120, 0, 1700, 120, 650);
  g1.addColorStop(0, glow1);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 1920, 1080);

  // Bottom-left ambient glow
  const g2 = ctx.createRadialGradient(200, 960, 0, 200, 960, 550);
  g2.addColorStop(0, glow2);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 1920, 1080);

  return { dataUrl: canvas.toDataURL('image/png'), isLight, c1 };
}

interface ContainerStyle {
  fill?: string;
  fillTransparency?: number;
  topAccentColor?: string;
  border?: string;
  borderBottom?: string;
  borderTop?: string;
  borderLeft?: string;
}

/**
 * Universal Container Fill & Border Resolver
 */
function extractContainerFillAndBorder(el: HTMLElement, isLightSlide: boolean): ContainerStyle {
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  const style = window.getComputedStyle(el);
  const bgRgba = parseRgba(style.backgroundColor);
  const borderRgba = parseRgba(style.borderColor);

  let fillHex: string | undefined = undefined;
  let fillTransparency: number | undefined = undefined;
  let topAccentColor: string | undefined = undefined;
  let borderHex: string | undefined = undefined;
  let borderBottomHex: string | undefined = undefined;
  let borderTopHex: string | undefined = undefined;
  let borderLeftHex: string | undefined = undefined;

  // Detect explicit alpha opacity in Tailwind class, e.g. bg-emerald-500/20, bg-cyan-950/80, bg-[#131530]/60
  const alphaMatch = cls.match(/bg-[a-zA-Z0-9_#[\]-]+\/(\d+)/);
  if (alphaMatch) {
    const alphaPercent = parseInt(alphaMatch[1], 10);
    if (!isNaN(alphaPercent) && alphaPercent <= 100) {
      fillTransparency = Math.max(0, 100 - alphaPercent);
    }
  } else if (bgRgba && bgRgba.a < 0.95 && bgRgba.a > 0.01) {
    fillTransparency = Math.round((1 - bgRgba.a) * 100);
  }

  // 1. Direct hex in class name
  const bgHexMatch = cls.match(/bg-\[#?([0-9a-fA-F]{6})\]/);
  if (bgHexMatch) {
    fillHex = bgHexMatch[1].toUpperCase();
  }

  // Check for top accent strip inside this card (e.g. Slide 2 KPI cards)
  const topStripEl = el.querySelector(':scope > div.absolute.top-0, :scope > div[class*="h-1"], :scope > div[class*="h-0.5"]');
  if (topStripEl) {
    const stripCls = topStripEl.className && typeof topStripEl.className === 'string' ? topStripEl.className : '';
    if (stripCls.includes('from-indigo') || stripCls.includes('bg-indigo')) topAccentColor = '6366F1';
    else if (stripCls.includes('from-cyan') || stripCls.includes('bg-cyan')) topAccentColor = '06B6D4';
    else if (stripCls.includes('from-emerald') || stripCls.includes('bg-emerald')) topAccentColor = '10B981';
    else if (stripCls.includes('from-amber') || stripCls.includes('bg-amber')) topAccentColor = 'F59E0B';
    else if (stripCls.includes('from-purple') || stripCls.includes('bg-purple')) topAccentColor = 'A855F7';
    else if (stripCls.includes('from-blue') || stripCls.includes('bg-blue')) topAccentColor = '3B82F6';
  }

  // 2. Gradients and themed fills (Pure vector fills)
  if (!fillHex) {
    if (cls.includes('from-cyan-900') || cls.includes('from-cyan-950') || cls.includes('to-indigo-900')) {
      fillHex = '0D1530';
    } else if (cls.includes('from-indigo-900') || cls.includes('from-indigo-950')) {
      fillHex = '0E112E';
    } else if (cls.includes('from-emerald-900') || cls.includes('from-emerald-950')) {
      fillHex = '062419';
    } else if (cls.includes('from-amber-900') || cls.includes('from-amber-950')) {
      fillHex = '261505';
    } else if (cls.includes('from-indigo-600') || cls.includes('from-indigo-500') || cls.includes('bg-indigo-500') || cls.includes('bg-indigo-600')) {
      fillHex = '6366F1';
    } else if (cls.includes('from-cyan-500') || cls.includes('from-cyan-600') || cls.includes('bg-cyan-500') || cls.includes('bg-cyan-600')) {
      fillHex = '06B6D4';
    } else if (cls.includes('from-emerald-500') || cls.includes('from-emerald-600') || cls.includes('bg-emerald-500') || cls.includes('bg-emerald-600')) {
      fillHex = '10B981';
    } else if (cls.includes('from-amber-500') || cls.includes('from-amber-600') || cls.includes('bg-amber-500') || cls.includes('bg-amber-600')) {
      fillHex = 'F59E0B';
    } else if (cls.includes('from-purple-500') || cls.includes('from-purple-600') || cls.includes('bg-purple-500') || cls.includes('bg-purple-600')) {
      fillHex = 'A855F7';
    } else if (cls.includes('from-blue-500') || cls.includes('from-blue-600') || cls.includes('bg-blue-500') || cls.includes('bg-blue-600')) {
      fillHex = '3B82F6';
    } else if (cls.includes('from-rose-500') || cls.includes('from-rose-600') || cls.includes('bg-rose-500') || cls.includes('bg-rose-600')) {
      fillHex = 'F43F5E';
    } else if (cls.includes('bg-cyan-950')) {
      fillHex = '083344';
    } else if (cls.includes('bg-indigo-950')) {
      fillHex = '1E1B4B';
    } else if (cls.includes('bg-emerald-950')) {
      fillHex = '064E3B';
    } else if (cls.includes('bg-[#151633]') || cls.includes('bg-[#131530]') || cls.includes('bg-[#11132A]') || cls.includes('bg-[#0F1230]') || cls.includes('bg-[#12152C]') || cls.includes('bg-[#151838]')) {
      fillHex = '131530';
    } else if (cls.includes('bg-white/15') || cls.includes('bg-white/20') || cls.includes('bg-white/10') || cls.includes('bg-white/25')) {
      fillHex = 'FFFFFF';
    } else if (cls.includes('bg-white')) {
      fillHex = 'FFFFFF';
    } else if (cls.includes('bg-teal-50')) fillHex = 'F0FDFA';
    else if (cls.includes('bg-amber-50')) fillHex = 'FFFBEB';
    else if (cls.includes('bg-emerald-50')) fillHex = 'ECFDF5';
    else if (cls.includes('bg-blue-50')) fillHex = 'EFF6FF';
    else if (cls.includes('bg-orange-50')) fillHex = 'FFF7ED';
    else if (cls.includes('bg-rose-50')) fillHex = 'FFF1F2';
    else if (cls.includes('bg-cyan-50')) fillHex = 'ECFEFF';
    else if (cls.includes('bg-slate-900') || cls.includes('bg-slate-950')) fillHex = '0F172A';
    else if (cls.includes('bg-slate-800')) fillHex = '1E293B';
    else if (cls.includes('bg-slate-700')) fillHex = '334155';
    else if (cls.includes('bg-slate-600')) fillHex = '475569';
    else if (cls.includes('bg-slate-500')) fillHex = '64748B';
    else if (cls.includes('bg-slate-100') || cls.includes('bg-slate-50')) fillHex = 'F8FAFC';
    else if (cls.includes('bg-neutral-50')) fillHex = 'FAFAFA';
    else if (bgRgba && bgRgba.a > 0.05) {
      fillHex = bgRgba.hex;
    }
  }

  // Border Resolution:
  let resolvedColor = '3B82F6';
  if (cls.includes('border-white/30') || cls.includes('border-white/20') || cls.includes('border-white/25') || cls.includes('border-white')) resolvedColor = 'FFFFFF';
  else if (cls.includes('border-indigo-500') || cls.includes('border-indigo-800')) resolvedColor = '6366F1';
  else if (cls.includes('border-teal-100') || cls.includes('border-teal-200')) resolvedColor = 'CCFBF1';
  else if (cls.includes('border-neutral-200') || cls.includes('border-stone-200')) resolvedColor = 'E5E5E5';
  else if (cls.includes('border-slate-800') || cls.includes('border-slate-700') || cls.includes('border-slate-600')) resolvedColor = '334155';
  else if (cls.includes('border-emerald-500') || cls.includes('border-emerald-800')) resolvedColor = '10B981';
  else if (cls.includes('border-amber-500') || cls.includes('border-amber-800')) resolvedColor = 'F59E0B';
  else if (cls.includes('border-blue-500') || cls.includes('border-blue-800')) resolvedColor = '3B82F6';
  else if (cls.includes('border-cyan-500') || cls.includes('border-cyan-800')) resolvedColor = '06B6D4';
  else if (cls.includes('border-purple-500')) resolvedColor = 'A855F7';
  else if (borderRgba && borderRgba.a > 0.15) {
    resolvedColor = borderRgba.hex;
  }

  const isFullBorder = cls.split(/\s+/).some((c) => c === 'border' || c === 'border-2' || c === 'border-4' || (c.startsWith('border-[') && !c.includes('-t') && !c.includes('-b') && !c.includes('-l') && !c.includes('-r')));

  if (isFullBorder) {
    borderHex = resolvedColor;
  } else if (cls.includes('border-b')) {
    borderBottomHex = resolvedColor;
  } else if (cls.includes('border-t')) {
    borderTopHex = resolvedColor;
  }

  if (cls.includes('border-l-4') || cls.includes('border-l-2') || cls.includes('border-l')) {
    borderLeftHex = resolvedColor;
  }

  return { fill: fillHex, fillTransparency, topAccentColor, border: borderHex, borderBottom: borderBottomHex, borderTop: borderTopHex, borderLeft: borderLeftHex };
}

/**
 * Universal Effective Text Color Resolver
 */
function getEffectiveTextColor(el: HTMLElement, isLightSlide: boolean): string {
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  const style = window.getComputedStyle(el);

  // Check for text gradient classes (Return luminous vector highlight color)
  if (cls.includes('bg-clip-text') || cls.includes('text-transparent')) {
    if (cls.includes('from-white') || cls.includes('to-cyan-200') || cls.includes('via-indigo-100')) {
      return isLightSlide ? '0F172A' : 'E0F2FE';
    } else if (cls.includes('from-indigo') && cls.includes('to-cyan')) {
      return isLightSlide ? '2563EB' : '67E8F9';
    } else if (cls.includes('from-amber') || cls.includes('to-orange')) {
      return isLightSlide ? 'D97706' : 'FBBF24';
    } else if (cls.includes('from-emerald') || cls.includes('to-teal') || cls.includes('to-green')) {
      return isLightSlide ? '059669' : '6EE7B7';
    } else if (cls.includes('from-purple') || cls.includes('to-pink')) {
      return isLightSlide ? '7C3AED' : 'E879F9';
    }
  }

  // Exact Tailwind text color class resolution for high contrast
  if (cls.includes('text-emerald-300') || cls.includes('text-emerald-400')) return '6EE7B7';
  if (cls.includes('text-emerald-200')) return 'A7F3D0';
  if (cls.includes('text-cyan-300') || cls.includes('text-cyan-400')) return '67E8F9';
  if (cls.includes('text-cyan-200')) return 'A5F3FC';
  if (cls.includes('text-amber-300') || cls.includes('text-amber-400')) return 'FCD34D';
  if (cls.includes('text-amber-200')) return 'FDE68A';
  if (cls.includes('text-purple-300') || cls.includes('text-purple-400')) return 'D8B4FE';
  if (cls.includes('text-purple-200')) return 'E9D5FF';
  if (cls.includes('text-indigo-300') || cls.includes('text-indigo-400')) return 'A5B4FC';
  if (cls.includes('text-indigo-200')) return 'C7D2FE';
  if (cls.includes('text-rose-300') || cls.includes('text-rose-400')) return 'FDA4AF';
  if (cls.includes('text-teal-300') || cls.includes('text-teal-400')) return '5EEAD4';
  if (cls.includes('text-slate-200')) return 'E2E8F0';
  if (cls.includes('text-slate-300')) return 'CBD5E1';
  if (cls.includes('text-slate-400')) return '94A3B8';
  if (cls.includes('text-slate-500')) return '64748B';
  if (cls.includes('text-white')) return 'FFFFFF';

  const parsed = parseRgba(style.color);
  let hex = parsed ? parsed.hex : isLightSlide ? '1E293B' : 'FFFFFF';

  // Check if element or its parent is explicitly styled with white/light text
  const isExplicitWhite =
    cls.includes('text-white') ||
    cls.includes('text-slate-100') ||
    cls.includes('text-slate-200') ||
    cls.includes('text-slate-300') ||
    cls.includes('text-amber-300') ||
    cls.includes('text-cyan-300') ||
    cls.includes('text-emerald-300') ||
    cls.includes('text-purple-200') ||
    cls.includes('text-purple-300') ||
    el.closest('.bg-gradient-to-r, .bg-gradient-to-br, [class*="from-"], [class*="bg-slate-900"], [class*="bg-[#0"], [class*="bg-blue-600"], [class*="bg-teal-600"]') !== null;

  if (isExplicitWhite) {
    if (hex === '1E293B' || hex === '000000' || hex === '0F172A') return 'FFFFFF';
    return hex;
  }

  if (isLightSlide) {
    if (hex === 'FFFFFF' || hex === 'F8FAFC' || hex === 'F1F5F9') return '1E293B';
    return hex;
  } else {
    if (hex === '000000' || hex === '1E293B' || hex === '0F172A' || hex === '042F2E') return 'E2E8F0';
    return hex;
  }
}

/**
 * Universal High-Fidelity Spatial DOM-to-PowerPoint Vector Exporter:
 * Accurately translates real browser-computed DOM layout geometry, colors, borders,
 * tables, progress bars, and typography 1:1 into native editable PowerPoint objects.
 */
async function exportEditablePptx(slides: string[]) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  // Create temporary in-DOM offscreen staging container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '960px';
  container.style.height = '540px';
  container.style.overflow = 'hidden';
  container.style.zIndex = '-9999';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.className = 'not-prose';
  document.body.appendChild(container);

  try {
    for (let i = 0; i < slides.length; i++) {
      const slideHtml = slides[i];
      container.innerHTML = slideHtml;

      // Wait for fonts & layout calculation
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => setTimeout(r, 50));

      const slideEl = (container.firstElementChild as HTMLElement) || container;
      const rootRect = slideEl.getBoundingClientRect();
      const rootW = rootRect.width || 960;
      const rootH = rootRect.height || 540;

      const slide = pptx.addSlide();
      const bgInfo = detectSlideBackground(slideEl.className);
      slide.background = { data: bgInfo.dataUrl };
      const isLightSlide = bgInfo.isLight;

      const toPptX = (domX: number) => ((domX - rootRect.left) / rootW) * 10;
      const toPptY = (domY: number) => ((domY - rootRect.top) / rootH) * 5.625;
      const toPptW = (domW: number) => (domW / rootW) * 10;
      const toPptH = (domH: number) => (domH / rootH) * 5.625;

      const visitedElements = new Set<Element>();

      // =========================================================================
      // LAYER 1: CARDS, BOXES, PILLS AND CONTAINERS (Drawn from largest to smallest)
      // =========================================================================
      const containerCandidates = Array.from(
        slideEl.querySelectorAll(
          'div, section, article, blockquote, span, .rounded-xl, .rounded-2xl, .rounded-lg, .rounded-md, .rounded-full, .border'
        )
      ).filter((el) => {
        if (el === slideEl) return false;
        if (el.tagName === 'TABLE' || el.closest('table')) return false;

        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        const parentCls = el.parentElement?.className && typeof el.parentElement.className === 'string' ? el.parentElement.className : '';
        const r = el.getBoundingClientRect();

        // FILTER OUT PURE DECORATIVE AMBIENT BLUR LIGHTS & GIANT BACKGROUND GLOW ORBS
        const isAmbientBlur = (cls.includes('blur-') || cls.includes('blur-[')) && !cls.includes('backdrop-blur');
        const isGiantGlowOrb =
          cls.includes('rounded-full') &&
          cls.includes('absolute') &&
          r.width >= 120 &&
          r.height >= 120 &&
          (cls.includes('bg-white/10') || cls.includes('bg-cyan-') || cls.includes('bg-indigo-') || cls.includes('opacity-'));

        if (
          isAmbientBlur ||
          isGiantGlowOrb ||
          cls.includes('pointer-events-none') ||
          cls.includes('opacity-10') ||
          cls.includes('opacity-5') ||
          (cls.includes('animate-pulse') && !cls.includes('w-1.5') && !cls.includes('w-2'))
        ) {
          return false;
        }

        return r.width >= 3 && r.height >= 1;
      });

      // Priority sort:
      // 1. Thin connecting line tracks (z-0 / background lines) must be drawn FIRST
      // 2. Large outer cards drawn next.
      // 3. Small inner cards/badges/header strips/progress bars drawn last.
      containerCandidates.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const aIsTrack = ra.height <= 4 || (a.className && a.className.includes('h-0.5'));
        const bIsTrack = rb.height <= 4 || (b.className && b.className.includes('h-0.5'));
        if (aIsTrack && !bIsTrack) return -1;
        if (!aIsTrack && bIsTrack) return 1;
        return rb.width * rb.height - ra.width * ra.height;
      });

      containerCandidates.forEach((el) => {
        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        const style = window.getComputedStyle(el);
        const { fill: fillColor, fillTransparency, topAccentColor, border: borderColor, borderBottom, borderTop, borderLeft } = extractContainerFillAndBorder(el as HTMLElement, isLightSlide);
        const radius = parseFloat(style.borderRadius) || 0;
        const rect = el.getBoundingClientRect();
        const sx = toPptX(rect.left);
        const sy = toPptY(rect.top);
        const sw = toPptW(rect.width);
        const sh = toPptH(rect.height);

        if (sx >= -0.5 && sy >= -0.5 && sx <= 10.5 && sy <= 6.0 && sw > 0.01 && sh > 0.005) {
          const isCircle = radius >= rect.height / 2 - 3 && Math.abs(rect.width - rect.height) < 10;
          const shapeType = isCircle
            ? pptx.ShapeType.ellipse
            : radius > 2
            ? pptx.ShapeType.roundRect
            : pptx.ShapeType.rect;

          // 1. Draw top accent crown behind card (if card has top color strip, e.g. Slide 2 KPI cards)
          if (topAccentColor) {
            slide.addShape(shapeType, {
              x: sx,
              y: Math.max(0.04, sy - 0.04),
              w: sw,
              h: sh,
              rectRadius: Math.min(0.2, (radius / rootW) * 10),
              fill: { color: topAccentColor },
            });
          }

          // 2. Draw solid or semi-transparent vector card/pill with optional shadow
          if (fillColor || borderColor) {
            const hasShadow = cls.includes('shadow') && !cls.includes('shadow-none');
            let shadowConfig: any = undefined;
            if (hasShadow) {
              let shadowColor = '000000';
              if (cls.includes('shadow-indigo')) shadowColor = '4F46E5';
              else if (cls.includes('shadow-cyan')) shadowColor = '06B6D4';
              else if (cls.includes('shadow-emerald')) shadowColor = '059669';
              else if (cls.includes('shadow-amber')) shadowColor = 'D97706';
              else if (cls.includes('shadow-purple')) shadowColor = '7C3AED';
              else if (cls.includes('shadow-blue')) shadowColor = '2563EB';

              shadowConfig = {
                type: 'outer' as const,
                color: shadowColor,
                blur: 8,
                offset: 3,
                angle: 135,
                opacity: 0.38,
              };
            }

            slide.addShape(shapeType, {
              x: sx,
              y: sy,
              w: sw,
              h: sh,
              rectRadius: isCircle ? undefined : Math.min(0.2, (radius / rootW) * 10),
              fill: fillColor
                ? {
                    color: fillColor,
                    transparency: fillTransparency,
                  }
                : undefined,
              line: borderColor ? { color: borderColor, width: 0.75 } : undefined,
              shadow: shadowConfig,
            });
          }

          // 3. Draw 1-sided dividing line at bottom
          if (borderBottom) {
            slide.addShape(pptx.ShapeType.line, {
              x: sx,
              y: toPptY(rect.bottom),
              w: sw,
              h: 0,
              line: { color: borderBottom, width: 0.75 },
            });
          }

          // 4. Draw 1-sided dividing line at top
          if (borderTop) {
            slide.addShape(pptx.ShapeType.line, {
              x: sx,
              y: toPptY(rect.top),
              w: sw,
              h: 0,
              line: { color: borderTop, width: 0.75 },
            });
          }

          // 5. Draw callout left accent bar
          if (borderLeft) {
            slide.addShape(pptx.ShapeType.rect, {
              x: sx,
              y: sy,
              w: 0.05,
              h: sh,
              fill: { color: borderLeft },
            });
          }
        }
      });

      // =========================================================================
      // LAYER 2: PROGRESS BARS (Multi-segment bars, % width bars, and meters)
      // =========================================================================
      const progressFills = Array.from(
        slideEl.querySelectorAll('[style*="width:"], [class*="w-["]')
      ).filter((el) => {
        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        const style = el.getAttribute('style') || '';
        const hasWidthPercent =
          (style.includes('width:') && style.includes('%')) ||
          /w-\[\d+%\]/.test(cls);
        const r = el.getBoundingClientRect();
        return hasWidthPercent && (el.tagName === 'DIV' || el.tagName === 'SPAN') && r.height <= 25;
      });

      progressFills.forEach((fillEl) => {
        const rect = fillEl.getBoundingClientRect();
        const cls = fillEl.className && typeof fillEl.className === 'string' ? fillEl.className : '';
        let colorHex = '3B82F6';

        if (cls.includes('from-indigo') || cls.includes('bg-indigo')) colorHex = '6366F1';
        else if (cls.includes('from-cyan') || cls.includes('bg-cyan')) colorHex = '06B6D4';
        else if (cls.includes('from-emerald') || cls.includes('bg-emerald')) colorHex = '10B981';
        else if (cls.includes('from-amber') || cls.includes('bg-amber')) colorHex = 'F59E0B';
        else if (cls.includes('from-orange') || cls.includes('bg-orange')) colorHex = 'F97316';
        else if (cls.includes('from-purple') || cls.includes('bg-purple')) colorHex = 'A855F7';
        else if (cls.includes('from-blue') || cls.includes('bg-blue')) colorHex = '3B82F6';
        else if (cls.includes('bg-slate-600')) colorHex = '475569';
        else if (cls.includes('bg-slate-700')) colorHex = '334155';
        else if (cls.includes('bg-slate-500')) colorHex = '64748B';

        const sx = toPptX(rect.left);
        const sy = toPptY(rect.top);
        const sw = toPptW(rect.width);
        const sh = Math.max(0.04, toPptH(rect.height));

        if (sw > 0.02 && sh > 0.01) {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: sx,
            y: sy,
            w: sw,
            h: sh,
            rectRadius: 0.04,
            fill: { color: colorHex },
          });
        }
      });

      // =========================================================================
      // LAYER 3: TABLES (Drawn ON TOP of containers so they are 100% visible)
      // =========================================================================
      const tables = Array.from(slideEl.querySelectorAll('table'));
      tables.forEach((table) => {
        visitedElements.add(table);
        table.querySelectorAll('*').forEach((el) => visitedElements.add(el));

        const tRect = table.getBoundingClientRect();
        const headers = Array.from(table.querySelectorAll('th')).map((th) => cleanText(th.textContent || ''));
        const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) => {
            const colorParsed = getEffectiveTextColor(td, isLightSlide);
            return {
              text: cleanText(td.textContent || ''),
              color: colorParsed,
            };
          })
        );

        if (headers.length > 0 && rows.length > 0) {
          const tableData = [
            headers.map((h) => ({
              text: h,
              options: {
                fill: { color: isLightSlide ? 'E2E8F0' : '241D17' },
                color: isLightSlide ? '1E293B' : 'FDE68A',
                bold: true,
                fontFace: 'Microsoft YaHei',
                fontSize: 8.5,
                align: 'left' as const,
              },
            })),
            ...rows.map((row, rIdx) =>
              row.map((cell) => ({
                text: cell.text,
                options: {
                  fill: { color: isLightSlide ? (rIdx % 2 === 0 ? 'F8FAFC' : 'FFFFFF') : (rIdx % 2 === 0 ? '1C1917' : '141210') },
                  color: cell.color,
                  fontFace: 'Microsoft YaHei',
                  fontSize: 8,
                  align: 'left' as const,
                },
              }))
            ),
          ];

          slide.addTable(tableData, {
            x: Math.max(0.2, toPptX(tRect.left)),
            y: Math.max(0.2, toPptY(tRect.top)),
            w: Math.min(9.6, toPptW(tRect.width)),
            h: Math.min(5.2, toPptH(tRect.height)),
            border: { type: 'solid', pt: 0.5, color: isLightSlide ? 'CBD5E1' : '3C3836' },
          });
        }
      });

      // =========================================================================
      // LAYER 4: TEXT FRAMES (100% Native Editable PowerPoint Text Boxes)
      // =========================================================================
      const allTextElements = Array.from(slideEl.querySelectorAll('*')).filter((el) => {
        if (visitedElements.has(el)) return false;
        if (el.tagName === 'TABLE' || el.closest('table')) return false;
        const text = cleanText(el.textContent || '');
        return text.length > 0;
      });

      allTextElements.forEach((el) => {
        if (visitedElements.has(el)) return;

        const text = cleanText(el.textContent || '');
        if (!text) return;

        const isHeading = ['H1', 'H2', 'H3', 'H4'].includes(el.tagName);
        const isParagraph = el.tagName === 'P' || el.tagName === 'BLOCKQUOTE';
        const isLeaf = el.children.length === 0;

        const hasDirectText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0
        );

        // Only emit if it is a heading, a paragraph, a leaf text element, or a callout container with direct text nodes
        const shouldEmit = isHeading || isParagraph || isLeaf || (hasDirectText && el.children.length <= 4);

        if (!shouldEmit) {
          return;
        }

        const rect = el.getBoundingClientRect();
        const domW = rect.width;
        const domH = rect.height;
        const domCenterX = rect.left + domW / 2;

        let pptW = toPptW(domW);
        let pptX = toPptX(rect.left);
        const pptY = toPptY(rect.top);
        let pptH = Math.max(0.18, toPptH(domH));

        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        const parentCls = el.parentElement?.className && typeof el.parentElement.className === 'string' ? el.parentElement.className : '';
        const style = window.getComputedStyle(el);

        const isBadgeOrPill =
          cls.includes('rounded-full') ||
          cls.includes('rounded-lg') ||
          cls.includes('rounded-md') ||
          cls.includes('rounded-xl') ||
          cls.includes('rounded') ||
          (cls.includes('px-') && cls.includes('py-')) ||
          cls.includes('cursor-pointer') ||
          parentCls.includes('rounded-full') ||
          (parentCls.includes('px-') && parentCls.includes('py-'));

        const isCentered =
          style.textAlign === 'center' ||
          cls.includes('text-center') ||
          cls.includes('justify-center') ||
          isBadgeOrPill ||
          (parentCls.includes('text-center') && !cls.includes('text-left') && !cls.includes('text-right') && !parentCls.includes('flex'));

        // Check if text is naturally multi-line (card body descriptions, paragraphs, long summaries, leading classes)
        const isMultiLine =
          isParagraph ||
          text.includes('\n') ||
          text.length > 15 ||
          domH > 20 ||
          cls.includes('leading-tight') ||
          cls.includes('leading-normal') ||
          cls.includes('leading-relaxed') ||
          cls.includes('leading-snug') ||
          cls.includes('leading-loose');

        if (isMultiLine) {
          // Constrain width to container's computed width with slight breathing room, ensure wrap is true
          pptW = Math.max(pptW * 1.02, 0.4);
          pptH = Math.max(pptH * 1.25, 0.3);
          if (isCentered && !isBadgeOrPill) {
            pptX = toPptX(domCenterX) - pptW / 2;
          }
        } else {
          // Single-line elements (headings, badges, tags, buttons, short metric values)
          if (isHeading) {
            pptW = Math.max(pptW * 1.18, el.tagName === 'H1' ? 7.5 : el.tagName === 'H2' ? 6.0 : 3.5);
            if (isCentered) {
              pptX = toPptX(domCenterX) - pptW / 2;
            }
          } else if (!isBadgeOrPill) {
            pptW = Math.max(pptW * 1.1, text.length * 0.1, 0.3);
            if (isCentered) {
              pptX = toPptX(domCenterX) - pptW / 2;
            }
          }
        }

        if (pptX >= -0.5 && pptY >= -0.5 && pptX <= 10.5 && pptY <= 6.0 && pptW > 0.02) {
          let textColor = getEffectiveTextColor(el as HTMLElement, isLightSlide);

          const fontSizePx = parseFloat(style.fontSize) || 12;
          let fontSizePt = Math.max(7, Math.min(36, fontSizePx * (72 / 96)));
          const isBold = parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold';

          if (isHeading) {
            fontSizePt = Math.min(30, fontSizePt * 0.92);
            if (el.tagName === 'H1' && !isLightSlide && !cls.includes('text-white') && !cls.includes('from-white')) textColor = 'FDE68A';
          } else if (isMultiLine) {
            fontSizePt = Math.max(6.8, Math.min(22, fontSizePt * 0.92));
          } else {
            fontSizePt = Math.max(6.8, Math.min(24, fontSizePt * 0.94));
          }

          const textAlign = (isCentered ? 'center' : style.textAlign === 'right' ? 'right' : 'left') as
            | 'center'
            | 'right'
            | 'left';

          slide.addText(text, {
            x: Math.max(0.08, pptX),
            y: Math.max(0.08, pptY),
            w: Math.min(9.8, pptW),
            h: pptH,
            fontSize: Math.round(fontSizePt * 10) / 10,
            color: textColor,
            bold: isBold,
            align: textAlign,
            fontFace: 'Microsoft YaHei',
            wrap: isMultiLine,
            shrinkText: true,
            valign: isHeading || isBadgeOrPill ? 'middle' : isMultiLine ? 'top' : isCentered ? 'middle' : 'top',
            margin: 0,
          });

          // Mark element and all descendants as visited
          visitedElements.add(el);
          el.querySelectorAll('*').forEach((child) => visitedElements.add(child));
        }
      });
    }

    const titleMatch = slides[0]?.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
    const rawTitle = titleMatch ? cleanText(titleMatch[1]) : 'Presentation';
    const fileName = `${rawTitle.slice(0, 25).replace(/[\\/:*?"<>|]/g, '_')}_QuickGPT.pptx`;
    await pptx.writeFile({ fileName });
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Single-file standalone HTML presentation export with embedded player and Tailwind
 */
function exportStandaloneHtml(slides: string[], title = '演示文稿') {
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #020617; color: #f8fafc; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; overflow: hidden; }
    .slide-wrapper { width: 960px; height: 540px; transform-origin: center center; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--scale, 1)); }
    .slide { width: 960px !important; height: 540px !important; }
  </style>
</head>
<body class="flex flex-col h-screen w-screen justify-between select-none">
  <header class="p-3 flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 bg-slate-900/80">
    <span class="font-bold text-slate-200">${title}</span>
    <div class="flex gap-2">
      <button id="prevBtn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-white cursor-pointer">上一页 (←)</button>
      <span id="pageIndicator" class="px-2 py-1">1 / ${slides.length}</span>
      <button id="nextBtn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-white cursor-pointer">下一页 (→)</button>
    </div>
  </header>

  <main class="flex-1 relative overflow-hidden flex items-center justify-center">
    <div id="deck" class="slide-wrapper shadow-2xl rounded-2xl overflow-hidden">
      ${slides.map((s, idx) => `<div class="slide-page ${idx === 0 ? 'block' : 'hidden'}" data-index="${idx}">${s}</div>`).join('\n')}
    </div>
  </main>

  <footer class="p-2 text-center text-[11px] text-slate-500 bg-slate-900/60 border-t border-slate-800">
    使用键盘 ← / → 或空格键翻页 · 支持 F11 全屏放映
  </footer>

  <script>
    let current = 0;
    const total = ${slides.length};
    const pages = document.querySelectorAll('.slide-page');
    const indicator = document.getElementById('pageIndicator');

    function updateScale() {
      const w = window.innerWidth - 32;
      const h = window.innerHeight - 90;
      const scale = Math.min(w / 960, h / 540, 1.8);
      document.getElementById('deck').style.setProperty('--scale', scale);
    }
    window.addEventListener('resize', updateScale);
    updateScale();

    function showPage(idx) {
      if (idx < 0 || idx >= total) return;
      current = idx;
      pages.forEach((p, i) => {
        p.classList.toggle('hidden', i !== current);
        p.classList.toggle('block', i === current);
      });
      indicator.textContent = (current + 1) + ' / ' + total;
    }

    document.getElementById('prevBtn').onclick = () => showPage(current - 1);
    document.getElementById('nextBtn').onclick = () => showPage(current + 1);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') showPage(current + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') showPage(current - 1);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}_QuickGPT.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export const HtmlSlideDeckViewer: React.FC<HtmlSlideDeckViewerProps> = ({
  rawCode,
  isStreaming = false,
}) => {
  const isDark = useThemeStore((state) => state.isDark);

  const slides = useMemo(() => parseHtmlSlides(rawCode, isStreaming), [rawCode, isStreaming]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceScope, setSourceScope] = useState<'current' | 'all'>('current');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);

  const total = slides.length;
  const safeIndex = Math.min(currentIndex, Math.max(0, total - 1));
  const currentSlideHtml = slides[safeIndex] || '';

  // Extract real PPT title from the first slide <h1>, <h2> or <!-- title: ... -->
  const deckTitle = useMemo(() => {
    const matchH1 = slides[0]?.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (matchH1) {
      const text = cleanText(matchH1[1]);
      if (text) return text;
    }
    const matchH2 = slides[0]?.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (matchH2) {
      const text = cleanText(matchH2[1]);
      if (text) return text;
    }
    const matchComment = rawCode.match(/<!--\s*(?:title|topic):\s*(.*?)\s*-->/i);
    if (matchComment) {
      const text = cleanText(matchComment[1]);
      if (text) return text;
    }
    return '演示文稿';
  }, [slides, rawCode]);

  const displayTitle = useMemo(() => {
    return deckTitle.length > 15 ? deckTitle.slice(0, 15) + '…' : deckTitle;
  }, [deckTitle]);

  // Auto resize canvas scale to maintain 16:9
  const updateScale = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = Math.max(0.1, Math.min(rect.width / 960, rect.height > 0 ? rect.height / 540 : 1));
    setScale((prev) => (Math.abs(prev - next) > 0.001 ? next : prev));
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    updateScale();
    return () => observer.disconnect();
  }, [updateScale, isFullscreen, isSourceMode]);

  // Fullscreen keyboard controls
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setCurrentIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(total - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, total]);

  const copyCode = async () => {
    const textToCopy = sourceScope === 'current' ? currentSlideHtml : rawCode;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadPptx = async () => {
    if (!slides.length || isStreaming || isExporting) return;
    setIsExporting(true);
    try {
      await exportEditablePptx(slides);
    } catch (err: any) {
      console.error('PPTX Export error:', err);
      alert(`导出可编辑 PPTX 失败：${err?.message || err || '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadHtml = () => {
    if (!slides.length) return;
    const titleMatch = slides[0]?.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : (deckTitle || '演示文稿');
    exportStandaloneHtml(slides, title);
  };

  if (!currentSlideHtml) {
    return (
      <section className="not-prose my-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
        <div className="aspect-video w-full bg-slate-100 p-3 dark:bg-slate-950">
          <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <Sparkles className="mr-2 h-5 w-5 text-purple-600 animate-spin" />
            正在生成原生 HTML 幻灯片…
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`not-prose my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900 ${
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col rounded-none bg-slate-950 p-4 sm:p-8'
          : 'mx-auto w-full max-w-3xl'
      }`}
      aria-label={deckTitle}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-lg bg-purple-100 p-1 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
            {isSourceMode ? <Code className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </span>
          <span className="truncate font-semibold text-slate-800 dark:text-slate-100 max-w-[240px]" title={deckTitle}>
            {isSourceMode
              ? `HTML 源码 (${sourceScope === 'current' ? `第 ${safeIndex + 1} 页` : '完整代码'})`
              : `${displayTitle}（${safeIndex + 1} / ${total}）`}
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 animate-pulse">
              逐页生成中...
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Source / Preview Toggle Button */}
          <button
            onClick={() => setIsSourceMode((val) => !val)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
            aria-label={isSourceMode ? '显示幻灯片' : '查看 HTML 源码'}
            title={isSourceMode ? '返回预览' : '查看 HTML 源码'}
          >
            {isSourceMode ? <Presentation className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isSourceMode ? '返回预览' : '源码'}</span>
          </button>

          {!isSourceMode ? (
            <>
              {/* Export HTML button */}
              <button
                onClick={downloadHtml}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                title="导出单文件离线 HTML 演示包"
              >
                <FileCode className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span className="hidden sm:inline">HTML</span>
              </button>

              {/* Export Editable PPTX button */}
              <button
                onClick={downloadPptx}
                disabled={isExporting || isStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-2.5 py-1.5 font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                title="导出为完全可编辑的 PowerPoint (PPTX)"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isExporting ? '生成可编辑 PPTX…' : '导出 PPTX (可编辑)'}</span>
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={() => setIsFullscreen((val) => !val)}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                aria-label={isFullscreen ? '退出全屏' : '全屏放映'}
                title={isFullscreen ? '退出全屏' : '全屏放映'}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </>
          ) : (
            <>
              {/* Scope Switcher in Source Mode: Current Slide vs All */}
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800 text-[11px]">
                <button
                  onClick={() => setSourceScope('current')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    sourceScope === 'current'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  当前页源码
                </button>
                <button
                  onClick={() => setSourceScope('all')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    sourceScope === 'all'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  完整 HTML
                </button>
              </div>

              {/* Copy Code button */}
              <button
                onClick={copyCode}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isSourceMode ? (
        <div className="m-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-xs text-slate-300">
            <span className="font-mono text-purple-400">
              {sourceScope === 'current' ? `<!-- Slide ${safeIndex + 1} / ${total} -->` : '<!-- Full HTML Presentation -->'}
            </span>
            <span className="text-[11px] text-slate-500">
              {sourceScope === 'current' ? '点击底部上一页/下一页可同步切换源码' : '包含所有页面完整结构'}
            </span>
          </div>
          <div className="max-h-[460px] overflow-x-auto overflow-y-scroll" style={{ scrollbarGutter: 'stable' }}>
            <code className="block whitespace-pre p-6 font-mono text-[12.5px] leading-6 text-slate-100 selection:bg-purple-500/40">
              {sourceScope === 'current' ? currentSlideHtml : rawCode}
            </code>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`flex min-h-0 items-center justify-center overflow-hidden bg-slate-950 ${
            isFullscreen ? 'flex-1 p-4' : 'h-[360px] p-3 sm:h-[460px]'
          }`}
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientX;
            if (start !== null && end !== undefined && Math.abs(start - end) > 40) {
              setCurrentIndex((idx) => Math.max(0, Math.min(total - 1, idx + (start > end ? 1 : -1))));
            }
            touchStart.current = null;
          }}
        >
          {/* 16:9 Aspect Ratio Canvas Container with Instant Native Rendering */}
          <div
            className="relative shrink-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800/80 bg-slate-950 flex items-center justify-center select-none"
            style={{ width: 960 * scale, height: 540 * scale }}
          >
            <div
              style={{
                width: 960,
                height: 540,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className="not-prose absolute left-0 top-0 overflow-hidden flex items-center justify-center [&_.slide]:w-[960px]! [&_.slide]:h-[540px]! [&_.slide]:overflow-hidden!"
              dangerouslySetInnerHTML={{ __html: currentSlideHtml }}
            />
          </div>
        </div>
      )}

      {/* Bottom Pagination Bar */}
      <nav
        className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
        aria-label="幻灯片分页"
      >
        <button
          onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
          disabled={safeIndex === 0}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>

        {/* Slide Indicator Dots */}
        <div className="flex max-w-[240px] items-center gap-1.5 overflow-x-auto py-1 px-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`跳转到第 ${idx + 1} 页`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                safeIndex === idx ? 'w-6 bg-purple-600' : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setCurrentIndex((idx) => Math.min(total - 1, idx + 1))}
          disabled={safeIndex === total - 1}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </section>
  );
};
