import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
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
    .replace(/<br\s*\/?>/gi, '___BR___')
    .replace(/<[^>]+>/g, '')
    .replace(/<\/?[a-zA-Z0-9_-]+>?/g, '')
    .replace(/^[a-zA-Z0-9_-]+>\s*$/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/___BR___/g, '\n')
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
interface SlideBackgroundInfo {
  isLight: boolean;
  c1: string;
  c2: string;
  c3: string;
  isSolid: boolean;
  angleXml: number;
}

const TAILWIND_COLOR_PALETTE: Record<string, Record<string, string>> = {
  slate: { '50': 'F8FAFC', '100': 'F1F5F9', '200': 'E2E8F0', '300': 'CBD5E1', '400': '94A3B8', '500': '64748B', '600': '475569', '700': '334155', '800': '1E293B', '900': '0F172A', '950': '020617' },
  gray: { '50': 'F9FAFB', '100': 'F3F4F6', '200': 'E5E7EB', '300': 'D1D5DB', '400': '9CA3AF', '500': '6B7280', '600': '4B5563', '700': '374151', '800': '1F2937', '900': '111827', '950': '030712' },
  zinc: { '50': 'FAFAFA', '100': 'F4F4F5', '200': 'E4E4E7', '300': 'D4D4D8', '400': 'A1A1AA', '500': '71717A', '600': '52525B', '700': '3F3F46', '800': '27272A', '900': '18181B', '950': '09090B' },
  neutral: { '50': 'FAFAFA', '100': 'F5F5F5', '200': 'E5E5E5', '300': 'D4D4D4', '400': 'A3A3A3', '500': '737373', '600': '525252', '700': '404040', '800': '262626', '900': '171717', '950': '0A0A0A' },
  stone: { '50': 'FAFAF9', '100': 'F5F5F4', '200': 'E7E5E4', '300': 'D6D3D1', '400': 'A8A29E', '500': '78716C', '600': '57534E', '700': '44403C', '800': '292524', '900': '1C1917', '950': '0C0A09' },
  red: { '50': 'FEF2F2', '100': 'FEE2E2', '200': 'FECACA', '300': 'FCA5A5', '400': 'F87171', '500': 'EF4444', '600': 'DC2626', '700': 'B91C1C', '800': '991B1B', '900': '7F1D1D', '950': '450A0A' },
  orange: { '50': 'FFF7ED', '100': 'FFEDD5', '200': 'FED7AA', '300': 'FDBA74', '400': 'FB923C', '500': 'F97316', '600': 'EA580C', '700': 'C2410C', '800': '9A3412', '900': '7C2D12', '950': '431407' },
  amber: { '50': 'FFFBEB', '100': 'FEF3C7', '200': 'FDE68A', '300': 'FCD34D', '400': 'FBBF24', '500': 'F59E0B', '600': 'D97706', '700': 'B45309', '800': '92400E', '900': '78350F', '950': '451A03' },
  yellow: { '50': 'FEFCE8', '100': 'FEF08A', '200': 'FDE047', '300': 'FACC15', '400': 'EAB308', '500': 'CA8A04', '600': 'A16207', '700': '854D0E', '800': '713F12', '900': '58310E', '950': '422006' },
  lime: { '50': 'F7FEE7', '100': 'ECFCCB', '200': 'D9F99D', '300': 'BEF264', '400': 'A3E635', '500': '84CC16', '600': '65A30D', '700': '4D7C0F', '800': '3F6212', '900': '365314', '950': '1A2E05' },
  green: { '50': 'F0FDF4', '100': 'DCFCE7', '200': 'BBF7D0', '300': '86EFAC', '400': '4ADE80', '500': '22C55E', '600': '16A34A', '700': '15803D', '800': '166534', '900': '14532D', '950': '052E16' },
  emerald: { '50': 'ECFDF5', '100': 'D1FAE5', '200': 'A7F3D0', '300': '6EE7B7', '400': '34D399', '500': '10B981', '600': '059669', '700': '047857', '800': '065F46', '900': '064E3B', '950': '022C22' },
  teal: { '50': 'F0FDFA', '100': 'CCFBF1', '200': '99F6E4', '300': '5EEAD4', '400': '2DD4BF', '500': '14B8A6', '600': '0D9488', '700': '0F766E', '800': '115E59', '900': '134E4A', '950': '042F2E' },
  cyan: { '50': 'ECFEFF', '100': 'CFFAFE', '200': 'A5F3FC', '300': '67E8F9', '400': '22D3EE', '500': '06B6D4', '600': '0891B2', '700': '0E7490', '800': '155E75', '900': '164E63', '950': '083344' },
  sky: { '50': 'F0F9FF', '100': 'E0F2FE', '200': 'BAE6FD', '300': '7DD3FC', '400': '38BDF8', '500': '0EA5E9', '600': '0284C7', '700': '0369A1', '800': '075985', '900': '0C4A6E', '950': '082F49' },
  blue: { '50': 'EFF6FF', '100': 'DBEAFE', '200': 'BFDBFE', '300': '93C5FD', '400': '60A5FA', '500': '3B82F6', '600': '2563EB', '700': '1D4ED8', '800': '1E40AF', '900': '1E3A8A', '950': '172554' },
  indigo: { '50': 'EEF2FF', '100': 'E0E7FF', '200': 'C7D2FE', '300': 'A5B4FC', '400': '818CF8', '500': '6366F1', '600': '4F46E5', '700': '4338CA', '800': '3730A3', '900': '312E81', '950': '1E1B4B' },
  violet: { '50': 'F5F3FF', '100': 'EDE9FE', '200': 'DDD6FE', '300': 'C4B5FD', '400': 'A78BFA', '500': '8B5CF6', '600': '7C3AED', '700': '6D28D9', '800': '5B21B6', '900': '4C1D95', '950': '2E1065' },
  purple: { '50': 'FAF5FF', '100': 'F3E8FF', '200': 'E9D5FF', '300': 'D8B4FE', '400': 'C084FC', '500': 'A855F7', '600': '9333EA', '700': '7E22CE', '800': '6B21A8', '900': '581C87', '950': '3B0764' },
  fuchsia: { '50': 'FDF4FF', '100': 'FAE8FF', '200': 'F5D0FE', '300': 'F0ABFC', '400': 'E879F9', '500': 'D946EF', '600': 'C026D3', '700': 'A21CAF', '800': '86198F', '900': '701A75', '950': '4A044E' },
  pink: { '50': 'FDF2F8', '100': 'FCE7F3', '200': 'FBCFE8', '300': 'F472B6', '400': 'F472B6', '500': 'EC4899', '600': 'DB2777', '700': 'BE185D', '800': '9D174D', '900': '831843', '950': '500724' },
  rose: { '50': 'FFF1F2', '100': 'FFE4E6', '200': 'FECDD3', '300': 'FDA4AF', '400': 'FB7185', '500': 'F43F5E', '600': 'E11D48', '700': 'BE123C', '800': '9F1239', '900': '881337', '950': '4C0519' },
};

function parseTailwindColorToken(token: string): string | null {
  if (!token) return null;
  if (token === 'white') return 'FFFFFF';
  if (token === 'black') return '000000';
  if (token === 'transparent') return null;

  // Check hex [#123456]
  const hexMatch = token.match(/^\[#?([0-9a-fA-F]{6})\]$/);
  if (hexMatch) return hexMatch[1].toUpperCase();

  // Check color-shade, e.g. emerald-300, blue-900, indigo-100
  const shadeMatch = token.match(/^([a-z]+)-(\d{2,3})$/);
  if (shadeMatch) {
    const family = shadeMatch[1];
    const shade = shadeMatch[2];
    if (TAILWIND_COLOR_PALETTE[family] && TAILWIND_COLOR_PALETTE[family][shade]) {
      return TAILWIND_COLOR_PALETTE[family][shade];
    }
  }

  // Check family alone, e.g. from-indigo
  if (TAILWIND_COLOR_PALETTE[token]) {
    return TAILWIND_COLOR_PALETTE[token]['500'] || '3B82F6';
  }

  return null;
}

/**
 * Universal Dynamic Text Gradient Resolver:
 * Extracts exact multi-stop color gradients directly from HTML class/style.
 */
function extractTextGradientStops(el: HTMLElement): string[] | null {
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  const style = el.getAttribute('style') || '';

  const hasClipText =
    cls.includes('bg-clip-text') ||
    style.includes('background-clip: text') ||
    style.includes('-webkit-background-clip: text');

  const hasTransparentText =
    cls.includes('text-transparent') ||
    cls.includes('text-opacity-0') ||
    style.includes('color: transparent');

  if (!hasClipText || !hasTransparentText) {
    return null;
  }

  const fromMatch = cls.match(/(?:^|\s)from-([a-zA-Z0-9_\#[\]-]+)/);
  const viaMatch = cls.match(/(?:^|\s)via-([a-zA-Z0-9_\#[\]-]+)/);
  const toMatch = cls.match(/(?:^|\s)to-(?!r\b|br\b|b\b|tr\b|tl\b|bl\b|l\b|t\b)([a-zA-Z0-9_\#[\]-]+)/);

  const fromColor = fromMatch ? parseTailwindColorToken(fromMatch[1]) : null;
  const viaColor = viaMatch ? parseTailwindColorToken(viaMatch[1]) : null;
  const toColor = toMatch ? parseTailwindColorToken(toMatch[1]) : null;

  if (fromColor && toColor) {
    return viaColor ? [fromColor, viaColor, toColor] : [fromColor, toColor];
  } else if (fromColor && viaColor) {
    return [fromColor, viaColor];
  } else if (fromColor) {
    return [fromColor, fromColor];
  }

  return null;
}

/**
 * Universal High-Fidelity Slide Background Detector:
 * Mathematically detects custom Hex gradients, light themes, ocean cyan, and dark luxury themes.
 */
function detectSlideBackground(classes = ''): SlideBackgroundInfo {
  // 1. Direct Regex Extraction of Hex gradients
  const fromHex = classes.match(/from-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const viaHex = classes.match(/via-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const toHex = classes.match(/to-\[#?([0-9a-fA-F]{6})\]/)?.[1];
  const bgHex = classes.match(/bg-\[#?([0-9a-fA-F]{6})\]/)?.[1];

  const hasGradient =
    classes.includes('bg-gradient-') ||
    classes.includes('from-') ||
    (fromHex !== undefined && toHex !== undefined);

  let c1 = '#090A1A';
  let c2 = '#0E1128';
  let c3 = '#060712';
  let isLight = false;
  let isSolid = false;
  let angleXml = 3240000; // 54 degrees / diagonal

  if (classes.includes('to-r') || classes.includes('bg-gradient-to-r')) {
    angleXml = 0;
  } else if (classes.includes('to-b') || classes.includes('bg-gradient-to-b')) {
    angleXml = 5400000;
  } else if (classes.includes('to-br') || classes.includes('bg-gradient-to-br')) {
    angleXml = 3240000;
  }

  if (fromHex && toHex) {
    c1 = '#' + fromHex.toUpperCase();
    c2 = viaHex ? '#' + viaHex.toUpperCase() : c1;
    c3 = '#' + toHex.toUpperCase();
    const r = parseInt(fromHex.slice(0, 2), 16) || 0;
    const g = parseInt(fromHex.slice(2, 4), 16) || 0;
    const b = parseInt(fromHex.slice(4, 6), 16) || 0;
    const br = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = br > 175 && !classes.includes('text-white') && !classes.includes('text-slate-100');
  } else if (bgHex && !hasGradient) {
    c1 = '#' + bgHex.toUpperCase();
    c2 = c1;
    c3 = c1;
    const r = parseInt(bgHex.slice(0, 2), 16) || 0;
    const g = parseInt(bgHex.slice(2, 4), 16) || 0;
    const b = parseInt(bgHex.slice(4, 6), 16) || 0;
    const br = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = br > 175 && !classes.includes('text-white') && !classes.includes('text-slate-100');
    isSolid = true;
  } else {
    // 2. High-precision Light Slide Detection:
    const isExplicitDark =
      classes.includes('from-[#0') ||
      classes.includes('from-[#1') ||
      classes.includes('from-slate-950') ||
      classes.includes('from-slate-900') ||
      classes.includes('from-slate-800') ||
      classes.includes('from-blue-950') ||
      classes.includes('from-blue-900') ||
      classes.includes('from-emerald-950') ||
      classes.includes('from-amber-950') ||
      classes.includes('bg-slate-950') ||
      classes.includes('bg-slate-900') ||
      classes.includes('bg-[#0') ||
      classes.includes('bg-[#1');

    isLight =
      !isExplicitDark &&
      (classes.includes('bg-white') ||
        classes.includes('from-white') ||
        classes.includes('from-slate-50') ||
        classes.includes('from-blue-50') ||
        classes.includes('from-emerald-50') ||
        classes.includes('from-amber-50') ||
        classes.includes('from-teal-50') ||
        classes.includes('from-gray-50') ||
        classes.includes('from-zinc-50') ||
        classes.includes('from-stone-50') ||
        classes.includes('bg-slate-50') ||
        classes.includes('bg-blue-50') ||
        classes.includes('bg-emerald-50') ||
        classes.includes('bg-amber-50') ||
        classes.includes('bg-teal-50') ||
        classes.includes('bg-gray-50') ||
        classes.includes('text-slate-800') ||
        classes.includes('text-slate-900') ||
        classes.includes('text-gray-800') ||
        classes.includes('text-gray-900') ||
        classes.includes('text-stone-800'));

    if (isLight) {
      if (!hasGradient && (classes.includes('bg-white') || classes.includes('bg-slate-50') || classes.includes('bg-gray-50'))) {
        isSolid = true;
        c1 = classes.includes('bg-white') ? '#FFFFFF' : '#F8FAFC';
        c2 = c1;
        c3 = c1;
      } else if (classes.includes('stone') || classes.includes('amber') || classes.includes('orange')) {
        c1 = '#FAF8F5';
        c2 = '#F5F2EC';
        c3 = '#EFECE6';
      } else if (classes.includes('teal') || classes.includes('emerald') || classes.includes('green')) {
        c1 = '#F0FDFA';
        c2 = '#E6FFFA';
        c3 = '#CCFBF1';
      } else if (classes.includes('blue') || classes.includes('cyan') || classes.includes('indigo')) {
        c1 = '#FFFFFF';
        c2 = '#F0F7FF';
        c3 = '#E0F2FE';
      } else {
        c1 = '#FFFFFF';
        c2 = '#F8FAFC';
        c3 = '#F1F5F9';
      }
    } else {
      if (classes.includes('amber') || classes.includes('orange') || classes.includes('stone') || classes.includes('yellow')) {
        c1 = '#0C0A09';
        c2 = '#22160D';
        c3 = '#141210';
      } else if (classes.includes('emerald') || classes.includes('green') || classes.includes('teal')) {
        c1 = '#021A15';
        c2 = '#052E24';
        c3 = '#011410';
      } else if (classes.includes('blue') || classes.includes('cyan') || classes.includes('sky')) {
        c1 = '#0F172A';
        c2 = '#0B132B';
        c3 = '#060B1E';
      }
    }
  }

  return { isLight, c1, c2, c3, isSolid, angleXml };
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

  // Check for top accent strip inside this card (e.g. Slide 2 KPI cards with absolute top-0 left-0 right-0 h-1)
  const topStripEl = el.querySelector(
    ':scope > div.absolute.top-0.left-0, :scope > div.absolute.top-0[class*="right-0"], :scope > div.absolute.top-0[class*="w-full"]'
  );
  if (topStripEl) {
    const stripCls = topStripEl.className && typeof topStripEl.className === 'string' ? topStripEl.className : '';
    if (stripCls.includes('from-indigo') || stripCls.includes('bg-indigo') || stripCls.includes('to-indigo')) topAccentColor = '6366F1';
    else if (stripCls.includes('from-cyan') || stripCls.includes('bg-cyan') || stripCls.includes('to-cyan')) topAccentColor = '06B6D4';
    else if (stripCls.includes('from-emerald') || stripCls.includes('bg-emerald') || stripCls.includes('to-emerald')) topAccentColor = '10B981';
    else if (stripCls.includes('from-amber') || stripCls.includes('bg-amber') || stripCls.includes('to-amber')) topAccentColor = 'F59E0B';
    else if (stripCls.includes('from-purple') || stripCls.includes('bg-purple') || stripCls.includes('to-purple')) topAccentColor = 'A855F7';
    else if (stripCls.includes('from-rose') || stripCls.includes('bg-rose') || stripCls.includes('to-rose')) topAccentColor = 'F43F5E';
    else if (stripCls.includes('from-blue') || stripCls.includes('bg-blue') || stripCls.includes('to-blue')) topAccentColor = '3B82F6';
  }

  // Check SVG fill or polygon fill ONLY IF el itself is an SVG element
  const tag = el.tagName.toLowerCase();
  if (tag === 'svg' || tag === 'polygon' || tag === 'path' || tag === 'circle' || tag === 'rect') {
    const svgFill = el.getAttribute('fill') || (tag === 'svg' ? el.querySelector('polygon, path, circle, rect')?.getAttribute('fill') : undefined);
    if (svgFill && svgFill.startsWith('#')) {
      fillHex = svgFill.slice(1).toUpperCase();
    }
  }

  // 2. Themed fills
  if (!fillHex) {
    if (cls.includes('bg-white')) fillHex = 'FFFFFF';
    else if (cls.includes('bg-indigo-600') || cls.includes('from-indigo-600') || cls.includes('from-indigo-500') || cls.includes('bg-indigo-500')) fillHex = '4F46E5';
    else if (cls.includes('bg-cyan-600') || cls.includes('from-cyan-600') || cls.includes('from-cyan-500') || cls.includes('bg-cyan-500')) fillHex = '06B6D4';
    else if (cls.includes('bg-violet-600') || cls.includes('from-violet-600') || cls.includes('from-violet-500') || cls.includes('bg-violet-500')) fillHex = '7C3AED';
    else if (cls.includes('bg-blue-600') || cls.includes('from-blue-600')) fillHex = '2563EB';
    else if (cls.includes('bg-blue-500') || cls.includes('from-blue-500')) fillHex = '3B82F6';
    else if (cls.includes('bg-blue-100')) fillHex = 'DBEAFE';
    else if (cls.includes('bg-blue-50')) fillHex = 'EFF6FF';
    else if (cls.includes('bg-blue-200')) fillHex = 'BFDBFE';
    else if (cls.includes('bg-emerald-600') || cls.includes('from-emerald-600')) fillHex = '059669';
    else if (cls.includes('bg-emerald-500') || cls.includes('from-emerald-500')) fillHex = '10B981';
    else if (cls.includes('bg-emerald-100')) fillHex = 'D1FAE5';
    else if (cls.includes('bg-emerald-50')) fillHex = 'ECFDF5';
    else if (cls.includes('bg-amber-600') || cls.includes('from-amber-600')) fillHex = 'D97706';
    else if (cls.includes('bg-amber-500') || cls.includes('from-amber-500')) fillHex = 'F59E0B';
    else if (cls.includes('bg-amber-100')) fillHex = 'FEF3C7';
    else if (cls.includes('bg-amber-50')) fillHex = 'FFFBEB';
    else if (cls.includes('bg-purple-600') || cls.includes('from-purple-600')) fillHex = '7C3AED';
    else if (cls.includes('bg-purple-500') || cls.includes('from-purple-500')) fillHex = 'A855F7';
    else if (cls.includes('bg-purple-100')) fillHex = 'F3E8FF';
    else if (cls.includes('bg-purple-50')) fillHex = 'FAF5FF';
    else if (cls.includes('bg-teal-600') || cls.includes('from-teal-600') || cls.includes('from-teal-500') || cls.includes('bg-teal-500')) fillHex = '0D9488';
    else if (cls.includes('bg-teal-50')) fillHex = 'F0FDFA';
    else if (cls.includes('bg-rose-600') || cls.includes('from-rose-600') || cls.includes('from-rose-500') || cls.includes('bg-rose-500')) fillHex = 'E11D48';
    else if (cls.includes('bg-rose-50')) fillHex = 'FFF1F2';
    else if (cls.includes('bg-sky-600') || cls.includes('from-sky-600') || cls.includes('from-sky-500') || cls.includes('bg-sky-500')) fillHex = '0284C7';
    else if (cls.includes('bg-slate-50')) fillHex = 'F8FAFC';
    else if (cls.includes('bg-slate-100')) fillHex = 'F1F5F9';
    else if (cls.includes('bg-slate-200')) fillHex = 'E2E8F0';
    else if (cls.includes('bg-slate-300')) fillHex = 'CBD5E1';
    else if (cls.includes('bg-slate-900') || cls.includes('bg-slate-950')) fillHex = '0F172A';
    else if (cls.includes('bg-slate-800')) fillHex = '1E293B';
    else if (cls.includes('bg-slate-700')) fillHex = '334155';
    else if (cls.includes('bg-slate-600')) fillHex = '475569';
    else if (cls.includes('bg-slate-500')) fillHex = '64748B';
    else if (cls.includes('bg-cyan-950')) fillHex = '083344';
    else if (cls.includes('bg-indigo-950')) fillHex = '1E1B4B';
    else if (cls.includes('bg-emerald-950')) fillHex = '064E3B';
    else if (bgRgba && bgRgba.a > 0.05) {
      fillHex = bgRgba.hex;
    }
  }

  // Border Resolution:
  let resolvedColor = isLightSlide ? 'E2E8F0' : '334155';
  if (cls.includes('border-indigo-500')) resolvedColor = '6366F1';
  else if (cls.includes('border-indigo-600')) resolvedColor = '4F46E5';
  else if (cls.includes('border-cyan-500')) resolvedColor = '06B6D4';
  else if (cls.includes('border-cyan-600')) resolvedColor = '0891B2';
  else if (cls.includes('border-blue-100')) resolvedColor = 'DBEAFE';
  else if (cls.includes('border-blue-200')) resolvedColor = 'BFDBFE';
  else if (cls.includes('border-blue-500')) resolvedColor = '3B82F6';
  else if (cls.includes('border-blue-600')) resolvedColor = '2563EB';
  else if (cls.includes('border-emerald-100')) resolvedColor = 'D1FAE5';
  else if (cls.includes('border-emerald-200')) resolvedColor = 'A7F3D0';
  else if (cls.includes('border-emerald-500')) resolvedColor = '10B981';
  else if (cls.includes('border-amber-100')) resolvedColor = 'FEF3C7';
  else if (cls.includes('border-amber-200')) resolvedColor = 'FDE68A';
  else if (cls.includes('border-amber-500')) resolvedColor = 'F59E0B';
  else if (cls.includes('border-purple-100')) resolvedColor = 'F3E8FF';
  else if (cls.includes('border-purple-200')) resolvedColor = 'E9D5FF';
  else if (cls.includes('border-purple-500')) resolvedColor = 'A855F7';
  else if (cls.includes('border-slate-100')) resolvedColor = 'F1F5F9';
  else if (cls.includes('border-slate-200')) resolvedColor = 'E2E8F0';
  else if (cls.includes('border-slate-300')) resolvedColor = 'CBD5E1';
  else if (cls.includes('border-slate-600')) resolvedColor = '475569';
  else if (cls.includes('border-slate-700')) resolvedColor = '334155';
  else if (cls.includes('border-slate-800')) resolvedColor = '1E293B';
  else if (cls.includes('border-white')) resolvedColor = 'FFFFFF';
  else if (borderRgba && borderRgba.a > 0.1) {
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

  // 1. Check for text gradient classes (Return crisp vector highlight color)
  if (cls.includes('bg-clip-text') || cls.includes('text-transparent')) {
    const stops = extractTextGradientStops(el);
    if (stops && stops.length > 0) {
      if (isLightSlide && stops[0] === 'FFFFFF') {
        return stops[stops.length - 1] || '0F172A';
      }
      return stops[0];
    }
    return isLightSlide ? '1E3A8A' : 'FFFFFF';
  }

  // 2. Direct check if element or any ancestor explicitly specifies text color class
  const explicitTextEl = (el.matches('[class*="text-"]') ? el : el.closest('[class*="text-"]')) as HTMLElement | null;
  if (explicitTextEl) {
    const explicitCls = explicitTextEl.className;
    if (typeof explicitCls === 'string') {
      const match = explicitCls.match(/\btext-(?:\[#([0-9a-fA-F]{6})\]|([a-z]+-[0-9]+|white|black))\b/);
      if (match) {
        if (match[1]) return match[1].toUpperCase();
        if (match[2] === 'white') return 'FFFFFF';
        if (match[2] === 'black') return '000000';
        const resolved = parseTailwindColorToken(`text-${match[2]}`);
        if (resolved) return resolved;
      }
    }
  }

  // 3. Computed DOM Color with Contrast Safety Fallback
  const isInsideDarkContainer = (() => {
    let curr: HTMLElement | null = el.parentElement;
    while (curr && curr.tagName !== 'SECTION' && curr.tagName !== 'BODY') {
      const pCls = curr.className && typeof curr.className === 'string' ? curr.className : '';
      if (
        pCls.includes('text-white') ||
        pCls.includes('bg-slate-900') ||
        pCls.includes('bg-slate-950') ||
        pCls.includes('bg-black') ||
        pCls.includes('bg-gradient-to') ||
        /bg-(?:blue|indigo|emerald|amber|purple|cyan|teal|rose|violet|sky|slate|gray|zinc|neutral)-(?:500|600|700|800|900|950)/.test(pCls)
      ) {
        return true;
      }
      const bg = parseRgba(window.getComputedStyle(curr).backgroundColor);
      if (bg && bg.a > 0.3) {
        const lum = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
        if (lum < 0.62) return true;
      }
      curr = curr.parentElement;
    }
    return false;
  })();

  const parsed = parseRgba(style.color);
  if (parsed && parsed.a > 0.1) {
    const hex = parsed.hex;
    if (isInsideDarkContainer) {
      if (hex === '000000' || hex === '0F172A' || hex === '1E293B') {
        return 'FFFFFF';
      }
      return hex;
    }

    if (isLightSlide) {
      if (hex === 'FFFFFF' || hex === 'F8FAFC' || hex === 'F1F5F9') {
        return '0F172A';
      }
      return hex;
    } else {
      if (hex === '000000' || hex === '0F172A' || hex === '1E293B') {
        const isInsideWhiteCard = el.closest('.bg-white, .bg-slate-100, .bg-slate-50') !== null;
        if (isInsideWhiteCard) return '0F172A';
        return 'E2E8F0';
      }
      return hex;
    }
  }

  return isLightSlide ? (isInsideDarkContainer ? 'FFFFFF' : '1E293B') : 'FFFFFF';
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

  const slideBgInfos: SlideBackgroundInfo[] = [];
  const gradientTexts: Record<number, { lines: string[]; stops: string[] }[]> = {};

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
      slideBgInfos[i] = bgInfo;
      // Native solid color placeholder - 0 bytes image overhead
      slide.background = { color: bgInfo.c1.replace('#', '') };
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
        const aCls = a.className && typeof a.className === 'string' ? a.className : '';
        const bCls = b.className && typeof b.className === 'string' ? b.className : '';
        const aIsTrack = ra.height <= 4 || aCls.includes('h-0.5') || aCls.includes('h-[1px]') || aCls.includes('h-[2px]');
        const bIsTrack = rb.height <= 4 || bCls.includes('h-0.5') || bCls.includes('h-[1px]') || bCls.includes('h-[2px]');
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
        let sx = toPptX(rect.left);
        let sy = toPptY(rect.top);
        let sw = toPptW(rect.width);
        let sh = toPptH(rect.height);

        // Defensive clamping: ensure all shapes stay inside the 16:9 canvas (10.0 x 5.625 inches)
        if (sx + sw > 9.85) {
          if (sx < 9.85) {
            sw = Math.max(0.05, 9.85 - sx);
          } else {
            sx = 9.85 - sw;
          }
        }
        if (sy + sh > 5.55) {
          if (sy < 5.55) {
            sh = Math.max(0.05, 5.55 - sy);
          } else {
            sy = 5.55 - sh;
          }
        }

        if (sx >= -0.5 && sy >= -0.5 && sx <= 10.5 && sy <= 6.0 && sw > 0.01 && sh > 0.005) {
          const isCircle =
            (radius >= rect.height / 2 - 4 && Math.abs(rect.width - rect.height) < 14) ||
            (cls.includes('rounded-full') && Math.abs(rect.width - rect.height) < 14);
          const isEllipse =
            cls.includes('rounded-[100%]') ||
            (cls.includes('rounded-full') && !cls.includes('px-') && !cls.includes('py-') && rect.width > 100 && rect.height > 100) ||
            style.borderRadius.includes('50%');
          const isPill =
            cls.includes('rounded-full') &&
            rect.width > rect.height * 1.2 &&
            rect.height <= 52 &&
            !isEllipse;

          const shapeType = isCircle || isEllipse
            ? pptx.ShapeType.ellipse
            : radius > 2 || isPill || cls.includes('rounded-')
            ? pptx.ShapeType.roundRect
            : pptx.ShapeType.rect;

          const calcRectRadius = () => {
            if (isCircle || isEllipse) return undefined;
            if (isPill) return 0.5; // Only true rounded-full badges/pills
            if (cls.includes('rounded-none')) return 0;
            if (cls.includes('rounded-3xl')) return 0.08;
            if (cls.includes('rounded-2xl')) return 0.06;
            if (cls.includes('rounded-xl')) return 0.04;
            if (cls.includes('rounded-lg')) return 0.03;
            if (cls.includes('rounded-md')) return 0.02;
            if (cls.includes('rounded')) return 0.015;
            if (radius > 0) return Math.max(0.01, Math.min(0.08, radius / rect.height));
            return 0.03;
          };

          const isDashed = cls.includes('border-dashed') || style.borderStyle === 'dashed';
          const isDotted = cls.includes('border-dotted') || style.borderStyle === 'dotted';
          const lineConfig = borderColor
            ? {
                color: borderColor,
                width: 0.75,
                dashType: isDashed ? ('dash' as const) : isDotted ? ('sysDot' as const) : ('solid' as const),
              }
            : undefined;

          // 1. Draw top accent crown behind card (same size as card, shifted upward by 0.04 inches)
          if (topAccentColor && fillColor) {
            slide.addShape(shapeType, {
              x: sx,
              y: Math.max(0.04, sy - 0.04),
              w: sw,
              h: sh,
              rectRadius: calcRectRadius(),
              fill: { color: topAccentColor },
            });
          }

          // 2. Draw solid or semi-transparent vector card/pill with optional shadow on top
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
              rectRadius: calcRectRadius(),
              fill: fillColor
                ? {
                    color: fillColor,
                    transparency: fillTransparency,
                  }
                : undefined,
              line: lineConfig,
              shadow: shadowConfig,
            });
          }

          // 2. Draw 1-sided dividing line at bottom
          if (borderBottom) {
            slide.addShape(pptx.ShapeType.line, {
              x: sx,
              y: toPptY(rect.bottom),
              w: sw,
              h: 0,
              line: { color: borderBottom, width: 0.75 },
            });
          }

          // 3. Draw 1-sided dividing line at top
          if (borderTop) {
            slide.addShape(pptx.ShapeType.line, {
              x: sx,
              y: toPptY(rect.top),
              w: sw,
              h: 0,
              line: { color: borderTop, width: 0.75 },
            });
          }

          // 4. Draw callout left accent bar
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

        // Exclude connecting lines and dividers from Layer 2 progress fills
        const isConnectingLine =
          cls.includes('h-0.5') ||
          cls.includes('h-[1px]') ||
          cls.includes('h-[2px]') ||
          (cls.includes('top-1/2') && cls.includes('absolute')) ||
          cls.includes('-translate-y-1/2');

        return hasWidthPercent && (el.tagName === 'DIV' || el.tagName === 'SPAN') && r.height <= 25 && !isConnectingLine;
      });

      progressFills.forEach((fillEl) => {
        const rect = fillEl.getBoundingClientRect();
        const cls = fillEl.className && typeof fillEl.className === 'string' ? fillEl.className : '';
        const style = window.getComputedStyle(fillEl);
        const bgRgba = parseRgba(style.backgroundColor);

        let colorHex = '3B82F6';
        let fillTransparency: number | undefined = undefined;

        const alphaMatch = cls.match(/bg-[a-zA-Z0-9_#[\]-]+\/(\d+)/);
        if (alphaMatch) {
          const alphaPercent = parseInt(alphaMatch[1], 10);
          if (!isNaN(alphaPercent) && alphaPercent <= 100) {
            fillTransparency = Math.max(0, 100 - alphaPercent);
          }
        } else if (bgRgba && bgRgba.a < 0.95 && bgRgba.a > 0.01) {
          fillTransparency = Math.round((1 - bgRgba.a) * 100);
        }

        if (cls.includes('bg-blue-200')) colorHex = 'BFDBFE';
        else if (cls.includes('bg-slate-300')) colorHex = 'CBD5E1';
        else if (cls.includes('bg-slate-200')) colorHex = 'E2E8F0';
        else if (cls.includes('from-indigo') || cls.includes('bg-indigo')) colorHex = '6366F1';
        else if (cls.includes('from-cyan') || cls.includes('bg-cyan')) colorHex = '06B6D4';
        else if (cls.includes('from-emerald') || cls.includes('bg-emerald') || cls.includes('to-emerald')) colorHex = '059669';
        else if (cls.includes('from-amber') || cls.includes('bg-amber') || cls.includes('to-amber')) colorHex = 'D97706';
        else if (cls.includes('from-orange') || cls.includes('bg-orange')) colorHex = 'F97316';
        else if (cls.includes('from-purple') || cls.includes('bg-purple')) colorHex = 'A855F7';
        else if (cls.includes('from-blue') || cls.includes('bg-blue') || cls.includes('to-blue')) colorHex = '2563EB';
        else if (cls.includes('bg-slate-600')) colorHex = '475569';
        else if (cls.includes('bg-slate-700')) colorHex = '334155';
        else if (cls.includes('bg-slate-500')) colorHex = '64748B';
        else if (bgRgba && bgRgba.a > 0.05) {
          colorHex = bgRgba.hex;
        }

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
            fill: { color: colorHex, transparency: fillTransparency },
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
        const thList = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
        const trList = Array.from(table.querySelectorAll('tbody tr'));

        // Calculate column widths from actual DOM headers
        const colW = thList.map((th) => {
          const w = th.getBoundingClientRect().width;
          return Math.max(0.4, toPptW(w));
        });

        const headerRow = thList.map((th) => {
          const thEl = th as HTMLElement;
          const cls = thEl.className && typeof thEl.className === 'string' ? thEl.className : '';
          const colorParsed = getEffectiveTextColor(thEl, isLightSlide);
          const align = cls.includes('text-left')
            ? ('left' as const)
            : cls.includes('text-right')
            ? ('right' as const)
            : ('center' as const);

          const bgParsed = extractContainerFillAndBorder(thEl, isLightSlide);
          const headerFill = bgParsed.fill || (isLightSlide ? 'F1F5F9' : '1E293B');

          return {
            text: cleanText(thEl.textContent || ''),
            options: {
              fill: { color: headerFill },
              color: colorParsed,
              bold: true,
              fontFace: 'Microsoft YaHei',
              fontSize: 8.5,
              align,
              valign: 'middle' as const,
              margin: [2, 4, 2, 4] as [number, number, number, number],
            },
          };
        });

        const bodyRows = trList.map((tr, rIdx) => {
          const trEl = tr as HTMLElement;
          const trCls = trEl.className && typeof trEl.className === 'string' ? trEl.className : '';
          const trBg = trCls.includes('bg-') ? extractContainerFillAndBorder(trEl, isLightSlide).fill : null;

          return Array.from(trEl.querySelectorAll('td')).map((td) => {
            const tdEl = td as HTMLElement;
            const cls = tdEl.className && typeof tdEl.className === 'string' ? tdEl.className : '';
            const colorParsed = getEffectiveTextColor(tdEl, isLightSlide);
            const isBold =
              cls.includes('font-bold') ||
              cls.includes('font-semibold') ||
              tdEl.querySelector('strong, b') !== null ||
              parseInt(window.getComputedStyle(tdEl).fontWeight, 10) >= 600;

            const align = cls.includes('text-left')
              ? ('left' as const)
              : cls.includes('text-right')
              ? ('right' as const)
              : cls.includes('text-center')
              ? ('center' as const)
              : cleanText(tdEl.textContent || '').length <= 4
              ? ('center' as const)
              : ('left' as const);

            const tdBg = cls.includes('bg-') ? extractContainerFillAndBorder(tdEl, isLightSlide).fill : null;
            const cellFill = tdBg || trBg || (isLightSlide ? (rIdx % 2 === 0 ? 'FFFFFF' : 'F8FAFC') : (rIdx % 2 === 0 ? '141210' : '1C1917'));

            return {
              text: cleanText(tdEl.textContent || ''),
              options: {
                fill: { color: cellFill },
                color: colorParsed,
                bold: isBold,
                fontFace: 'Microsoft YaHei',
                fontSize: 8,
                align,
                valign: 'middle' as const,
                margin: [2, 4, 2, 4] as [number, number, number, number],
              },
            };
          });
        });

        if (headerRow.length > 0 || bodyRows.length > 0) {
          const tableData = headerRow.length > 0 ? [headerRow, ...bodyRows] : bodyRows;

          slide.addTable(tableData, {
            x: Math.max(0.1, toPptX(tRect.left)),
            y: Math.max(0.1, toPptY(tRect.top)),
            w: Math.min(9.8, toPptW(tRect.width)),
            h: Math.min(5.4, toPptH(tRect.height)),
            colW: colW.length > 0 ? colW : undefined,
            border: { type: 'solid', pt: 0.5, color: isLightSlide ? 'E2E8F0' : '334155' },
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
        let pptY = toPptY(rect.top);
        let pptH = toPptH(domH);

        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        const parentCls = el.parentElement?.className && typeof el.parentElement.className === 'string' ? el.parentElement.className : '';
        const style = window.getComputedStyle(el);

        const isCalloutOrBox =
          (cls.includes('bg-') || cls.includes('border') || cls.includes('rounded-')) &&
          (cls.includes('p-') || cls.includes('px-') || cls.includes('py-')) &&
          domH >= 24;

        const isBadgeOrPill =
          (cls.includes('rounded-full') ||
            cls.includes('rounded-md') ||
            cls.includes('rounded-lg') ||
            cls.includes('rounded') ||
            (cls.includes('px-') && cls.includes('py-'))) &&
          domW <= 320 &&
          domH <= 46 &&
          text.length <= 30;

        // Pill / badge labels MUST always be centered horizontally!
        const isCentered =
          isBadgeOrPill ||
          style.textAlign === 'center' ||
          cls.includes('text-center') ||
          cls.includes('justify-center') ||
          (parentCls.includes('text-center') &&
            !cls.includes('text-left') &&
            !cls.includes('text-right') &&
            !parentCls.includes('flex'));

        // Check if text is naturally multi-line (card body descriptions, paragraphs, long summaries, leading classes)
        const isSingleLineByDom = domH <= 24 && !text.includes('\n');
        const isMultiLine =
          !isSingleLineByDom &&
          (isParagraph ||
            text.includes('\n') ||
            domH >= 25 ||
            (text.length > 20 && domW < 380));

        if (isMultiLine) {
          // Constrain width to container's computed width with slight breathing room, ensure wrap is true
          pptW = Math.max(pptW * 1.02, 0.4);
          pptH = Math.max(pptH * (isCalloutOrBox ? 1.02 : 1.15), 0.28);
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
          } else if (isBadgeOrPill) {
            // Keep EXACT 1:1 geometry matching Layer 1 shape bounding box
            pptX = toPptX(rect.left);
            pptY = toPptY(rect.top);
            pptW = toPptW(domW);
            pptH = toPptH(domH);
          } else {
            pptW = Math.max(pptW * 1.05, text.length * 0.1, 0.3);
            if (isCentered) {
              pptX = toPptX(domCenterX) - pptW / 2;
            }
          }
        }

        // Defensive clamping: ensure all text boxes stay inside the 16:9 canvas
        if (pptX + pptW > 9.85) {
          if (pptX < 9.85) {
            pptW = Math.max(0.1, 9.85 - pptX);
          } else {
            pptX = 9.85 - pptW;
          }
        }
        if (pptY + pptH > 5.55) {
          if (pptY < 5.55) {
            pptH = Math.max(0.1, 5.55 - pptY);
          } else {
            pptY = 5.55 - pptH;
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
            y: Math.max(0.04, pptY),
            w: Math.min(9.8, pptW),
            h: pptH,
            fontSize: Math.round(fontSizePt * 10) / 10,
            color: textColor,
            bold: isBold,
            align: textAlign,
            fontFace: 'Microsoft YaHei',
            wrap: isMultiLine,
            shrinkText: true,
            valign: isHeading || isBadgeOrPill || isCalloutOrBox || !isMultiLine || domH < 75 ? 'middle' : 'top',
            margin: isCalloutOrBox ? [2, 6, 2, 6] : 0,
          });

          // Check if this text element has a gradient (Strictly bg-clip-text + text-transparent)
          const gradStops = extractTextGradientStops(el as HTMLElement);
          if (gradStops) {
            if (!gradientTexts[i]) gradientTexts[i] = [];
            const lines = text
              .split('\n')
              .map((l) => cleanText(l))
              .filter((l) => l.length > 0);
            gradientTexts[i].push({
              lines,
              stops: gradStops,
            });
          }

          // Mark element and all descendants as visited
          visitedElements.add(el);
          el.querySelectorAll('*').forEach((child) => visitedElements.add(child));
        }
      });
    }

    const titleMatch = slides[0]?.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
    const rawTitle = titleMatch ? cleanText(titleMatch[1]) : 'Presentation';
    const fileName = `${rawTitle.slice(0, 25).replace(/[\\/:*?"<>|]/g, '_')}_QuickGPT.pptx`;

    // Generate PPTX package buffer
    const rawBuffer = await pptx.write({ outputType: 'uint8array', compression: true });
    const zip = await JSZip.loadAsync(rawBuffer as Uint8Array);

    // Post-process each slide XML for 100% native vector gradient background & gradient text
    for (let sIdx = 0; sIdx < slides.length; sIdx++) {
      const slidePath = `ppt/slides/slide${sIdx + 1}.xml`;
      const slideFile = zip.file(slidePath);
      if (!slideFile) continue;

      let xml = await slideFile.async('string');
      const bg = slideBgInfos[sIdx];

      // 1. Inject Native DrawingML Gradient Background (0 bytes image overhead)
      if (bg && !bg.isSolid) {
        const s1 = bg.c1.replace('#', '');
        const s2 = bg.c2.replace('#', '');
        const s3 = bg.c3.replace('#', '');
        const ang = bg.angleXml || 3240000;
        const bgXml = `<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${s1}"/></a:gs><a:gs pos="50000"><a:srgbClr val="${s2}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${s3}"/></a:gs></a:gsLst><a:lin ang="${ang}"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`;

        if (xml.includes('<p:bg>')) {
          xml = xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bgXml);
        } else {
          xml = xml.replace('<p:spTree>', bgXml + '<p:spTree>');
        }
      }

      // 2. Inject Native DrawingML Gradient Text for gradient titles/phrases
      const gTexts = gradientTexts[sIdx] || [];
      for (const gt of gTexts) {
        if (!gt.stops || gt.stops.length === 0 || !gt.lines || gt.lines.length === 0) continue;
        const stops = gt.stops;
        const gsListXml =
          stops.length === 2
            ? `<a:gs pos="0"><a:srgbClr val="${stops[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${stops[1]}"/></a:gs>`
            : `<a:gs pos="0"><a:srgbClr val="${stops[0]}"/></a:gs><a:gs pos="50000"><a:srgbClr val="${stops[1]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${stops[2]}"/></a:gs>`;
        const gradFillXml = `<a:gradFill><a:gsLst>${gsListXml}</a:gsLst><a:lin ang="0"/></a:gradFill>`;

        for (const line of gt.lines) {
          if (!line || line.length < 2) continue;
          const rRegex = /<a:r\b[^>]*>[\s\S]*?<\/a:r>/g;
          xml = xml.replace(rRegex, (rBlock) => {
            const tMatch = rBlock.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/);
            if (!tMatch) return rBlock;
            const tText = tMatch[1].trim();
            if (tText.includes(line) || line.includes(tText)) {
              return rBlock.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, gradFillXml);
            }
            return rBlock;
          });
        }
      }

      zip.file(slidePath, xml);
    }

    // Generate final compressed PPTX Blob
    const finalBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      compression: 'DEFLATE',
    });

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    .slide-wrapper { width: 960px; height: 540px; transform-origin: center center; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--scale, 1)); transition: transform 0.15s ease-out; }
    .slide { width: 960px !important; height: 540px !important; }
    
    /* Fullscreen Mode Overrides */
    body.is-fullscreen #topHeader,
    body.is-fullscreen #bottomFooter {
      display: none !important;
    }
    body.is-fullscreen #exitFullscreenBtn {
      display: flex !important;
    }
    body.is-fullscreen #deck {
      border-radius: 0 !important;
      box-shadow: none !important;
    }
  </style>
</head>
<body class="flex flex-col h-screen w-screen justify-between select-none bg-slate-950">
  <!-- Top Navigation Header -->
  <header id="topHeader" class="p-3 flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 bg-slate-900/90 z-20">
    <div class="flex items-center gap-2 min-w-0">
      <span class="font-bold text-slate-200 truncate max-w-md">${title}</span>
    </div>
    <div class="flex items-center gap-2">
      <button id="prevBtn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded text-white cursor-pointer transition flex items-center gap-1">
        <span>←</span> 上一页
      </button>
      <span id="pageIndicator" class="px-2.5 py-1 text-slate-300 font-mono font-medium">1 / ${slides.length}</span>
      <button id="nextBtn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded text-white cursor-pointer transition flex items-center gap-1">
        下一页 <span>→</span>
      </button>
      <button id="fullscreenBtn" class="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 active:scale-95 rounded text-white cursor-pointer font-medium flex items-center gap-1.5 transition shadow-sm">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        全屏放映
      </button>
    </div>
  </header>

  <!-- Main Slide Presentation Viewport -->
  <main class="flex-1 relative overflow-hidden flex items-center justify-center w-full h-full">
    <div id="deck" class="slide-wrapper shadow-2xl rounded-2xl overflow-hidden">
      ${slides.map((s, idx) => `<div class="slide-page ${idx === 0 ? 'block' : 'hidden'}" data-index="${idx}">${s}</div>`).join('\n')}
    </div>
  </main>

  <!-- Bottom Helper Footer -->
  <footer id="bottomFooter" class="p-2 text-center text-[11px] text-slate-500 bg-slate-900/60 border-t border-slate-800 z-20">
    使用键盘 ← / → 或空格键翻页 · 按 F 键或点击全屏按钮开启无干扰放映
  </footer>

  <!-- Floating Exit Fullscreen Button (Semi-transparent X in bottom right) -->
  <button id="exitFullscreenBtn" class="fixed bottom-5 right-5 z-50 hidden opacity-40 hover:opacity-100 bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md border border-white/20 p-2.5 rounded-full cursor-pointer shadow-2xl transition-all duration-200 hover:scale-105 group" title="退出全屏 (ESC / F)">
    <svg class="w-5 h-5 text-slate-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>

  <script>
    let current = 0;
    const total = ${slides.length};
    const pages = document.querySelectorAll('.slide-page');
    const indicator = document.getElementById('pageIndicator');
    const deck = document.getElementById('deck');

    function isFsActive() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function updateScale() {
      const fs = isFsActive();
      document.body.classList.toggle('is-fullscreen', fs);

      let w, h;
      if (fs) {
        w = window.innerWidth;
        h = window.innerHeight;
      } else {
        w = window.innerWidth - 32;
        h = window.innerHeight - 90;
      }

      const scale = Math.min(w / 960, h / 540);
      deck.style.setProperty('--scale', scale);
    }

    window.addEventListener('resize', updateScale);
    document.addEventListener('fullscreenchange', updateScale);
    document.addEventListener('webkitfullscreenchange', updateScale);
    document.addEventListener('mozfullscreenchange', updateScale);
    document.addEventListener('MSFullscreenChange', updateScale);

    function showPage(idx) {
      if (idx < 0 || idx >= total) return;
      current = idx;
      pages.forEach((p, i) => {
        p.classList.toggle('hidden', i !== current);
        p.classList.toggle('block', i === current);
      });
      indicator.textContent = (current + 1) + ' / ' + total;
    }

    function toggleFullscreen() {
      if (!isFsActive()) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }

    document.getElementById('prevBtn').onclick = () => showPage(current - 1);
    document.getElementById('nextBtn').onclick = () => showPage(current + 1);
    document.getElementById('fullscreenBtn').onclick = toggleFullscreen;
    document.getElementById('exitFullscreenBtn').onclick = toggleFullscreen;

    // Keyboard Navigation (Arrow Keys Left/Right/Up/Down, Space, Enter, PageUp/Down)
    window.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
        showPage(current + 1);
      }
      if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        showPage(current - 1);
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
      if (e.key === 'Home') {
        showPage(0);
      }
      if (e.key === 'End') {
        showPage(total - 1);
      }
    });

    // Mouse Wheel / Trackpad Scroll Navigation (with 350ms cooldown)
    let isWheelThrottled = false;
    window.addEventListener('wheel', (e) => {
      if (isWheelThrottled) return;
      if (Math.abs(e.deltaY) < 20) return;
      
      if (e.deltaY > 0) {
        showPage(current + 1);
      } else {
        showPage(current - 1);
      }
      
      isWheelThrottled = true;
      setTimeout(() => {
        isWheelThrottled = false;
      }, 350);
    }, { passive: true });

    // Mouse Click to Advance in Presentation Viewport
    const mainViewport = document.querySelector('main');
    if (mainViewport) {
      mainViewport.addEventListener('click', (e) => {
        // Don't trigger if user clicked on button, link, input, or exit button
        if (e.target.closest('button, a, input, textarea, select, #exitFullscreenBtn')) return;
        
        const rect = mainViewport.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        // If clicking left 25%, go back; otherwise advance next
        if (clickX < rect.width * 0.25) {
          showPage(current - 1);
        } else {
          showPage(current + 1);
        }
      });
    }

    updateScale();
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

  // Auto resize canvas scale to maintain strict 16:9 without any clipping
  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;

    const computedStyle = window.getComputedStyle(el);
    const padX = (parseFloat(computedStyle.paddingLeft) || 12) + (parseFloat(computedStyle.paddingRight) || 12);
    const padY = (parseFloat(computedStyle.paddingTop) || 12) + (parseFloat(computedStyle.paddingBottom) || 12);

    const availW = Math.max(60, rect.width - padX);
    const availH = Math.max(40, rect.height - padY);

    const next = Math.max(0.05, Math.min(availW / 960, availH / 540));
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

  // Fullscreen keyboard, wheel, and click controls
  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(total - 1, i + 1));
      }
    };

    let isWheelThrottled = false;
    const onWheel = (e: WheelEvent) => {
      if (isWheelThrottled) return;
      if (Math.abs(e.deltaY) < 20) return;
      if (e.deltaY > 0) {
        setCurrentIndex((i) => Math.min(total - 1, i + 1));
      } else {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
      isWheelThrottled = true;
      setTimeout(() => {
        isWheelThrottled = false;
      }, 350);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
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
            isFullscreen ? 'flex-1 p-4 cursor-pointer' : 'h-[360px] p-3 sm:h-[460px]'
          }`}
          onClick={(e) => {
            if (!isFullscreen) return;
            if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const clickX = e.clientX - rect.left;
            if (clickX < rect.width * 0.25) {
              setCurrentIndex((idx) => Math.max(0, idx - 1));
            } else {
              setCurrentIndex((idx) => Math.min(total - 1, idx + 1));
            }
          }}
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
            className="relative shrink-0 overflow-hidden rounded-xl shadow-2xl border border-slate-800/80 bg-slate-950 select-none"
            style={{ width: Math.round(960 * scale), height: Math.round(540 * scale) }}
          >
            <div
              style={{
                width: 960,
                height: 540,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className="not-prose absolute left-0 top-0 overflow-hidden [&_.slide]:w-[960px]! [&_.slide]:h-[540px]!"
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
