import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';
import { SlideDeckViewer } from './SlideDeckViewer.js';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Preprocesses markdown content:
 * 1. Strips out internal UI tool tokens (e.g. genui{...}) leaking from models
 * 2. Normalizes LaTeX formula formats (\\[...\\], \\[...\\], \\(...\\), \\(...\\)) into standard $$...$$ and $...$
 *    WITHOUT breaking standard markdown brackets like links [text](url) or footnotes [1].
 * 3. Formats tables with clean newline boundaries so remark-gfm parses them flawlessly.
 */
function normalizeMarkdownContent(content: string): string {
  if (!content) return '';

  let processed = content;

  // 1. Strip genui artifact tags from certain models (e.g. genui{"learning_viz":...})
  processed = processed.replace(/genui\s*\{[\s\S]*?\}\s*/gi, '');

  // 2. Strip raw tool_call tags if leaked
  processed = processed.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');

  // 3. Convert explicit LaTeX inline: \( ... \) or \\( ... \\) -> $...$ (Must have leading backslash)
  processed = processed.replace(/(?:\\\\|\\)\(([\s\S]*?)(?:\\\\|\\)\)/g, (_, eq) => {
    return `$${eq.trim()}$`;
  });

  // 4. Convert explicit LaTeX block/inline: \[ ... \] or \\[ ... \\] (Must have leading backslash)
  // - If it spans multiple lines or contains complex math -> block equation $$...$$
  // - If it is a short single-line variable -> inline $...$
  processed = processed.replace(/(?:\\\\|\\)\[([\s\S]*?)(?:\\\\|\\)\]/g, (match, eq) => {
    const trimmed = eq.trim();
    if (trimmed.includes('\n') || match.startsWith('\n') || match.endsWith('\n')) {
      return `\n\n$$\n${trimmed}\n$$\n\n`;
    }
    if (trimmed.includes('\\begin') || trimmed.includes('\\tag') || trimmed.length > 70) {
      return `\n\n$$\n${trimmed}\n$$\n\n`;
    }
    return `$${trimmed}$`;
  });

  // 5. If inline text has $$...$$ without newlines on either side, convert to $...$
  processed = processed.replace(/([^\n\r])\s*\$\$([^\n\r]+?)\$\$\s*([^\n\r])/g, '$1 $$2 $3');

  return processed;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 text-[14.5px] leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeKatex, { output: 'html', throwOnError: false }],
          rehypeHighlight,
        ]}
        components={{
          pre({ node, children, ...props }: any) {
            // If the pre contains a SlideDeckViewer, don't wrap it in a prose <pre>
            return <div className="my-3 not-prose w-full overflow-visible">{children}</div>;
          },
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = (match ? match[1] : '').toLowerCase();
            const codeString = String(children).replace(/\n$/, '');

            // Detect PPT / Presentation Slide Deck format
            if (!inline && ['ppt', 'pptx', 'slide', 'slides', 'presentation', 'marp'].includes(language)) {
              return <SlideDeckViewer rawCode={codeString} />;
            }

            if (!inline && (match || codeString.includes('\n'))) {
              return <CodeBlock language={language} code={codeString} />;
            }

            return (
              <code
                className="px-1.5 py-0.5 mx-0.5 text-[13px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded font-mono border border-slate-200/60 dark:border-slate-700"
                {...props}
              >
                {children}
              </code>
            );
          },
          img({ node, ...props }) {
            return (
              <img
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-md max-h-96 my-3 object-contain"
                loading="lazy"
                {...props}
              />
            );
          },
          table({ node, ...props }) {
            return (
              <div className="my-4 overflow-x-auto rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <table
                  className="w-full text-left text-sm border-collapse divide-y divide-slate-200 dark:divide-slate-800 m-0!"
                  {...props}
                />
              </div>
            );
          },
          thead({ node, ...props }) {
            return (
              <thead
                className="bg-slate-50/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-800"
                {...props}
              />
            );
          },
          tbody({ node, ...props }) {
            return (
              <tbody
                className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900"
                {...props}
              />
            );
          },
          tr({ node, ...props }) {
            return (
              <tr
                className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                {...props}
              />
            );
          },
          th({ node, ...props }) {
            return (
              <th
                className="px-4 py-3 text-xs font-semibold tracking-wider text-slate-700 dark:text-slate-200 whitespace-nowrap"
                {...props}
              />
            );
          },
          td({ node, ...props }) {
            return (
              <td
                className="px-4 py-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                {...props}
              />
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-800 bg-[#1e1e24] shadow-md">
      {/* Code block header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#18181b] text-slate-400 text-xs font-mono border-b border-slate-800">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors py-0.5 px-2 rounded bg-slate-800/80 hover:bg-slate-700"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans">复制</span>
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <div className="p-3.5 overflow-x-auto text-[13px] font-mono leading-normal text-slate-100">
        <pre className="!m-0 !p-0 !bg-transparent">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
