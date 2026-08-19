import assert from 'node:assert/strict';
import { buildSlideDeck, COLOR_THEMES, completedPptMarkdown, DEFAULT_DECK_STYLE, getDeckStyle, getSlidePlan, getThemePalette, slideItems } from './slideDeck.js';

assert.equal(COLOR_THEMES.length, 10);
assert.notDeepEqual(getThemePalette(COLOR_THEMES[0], true), getThemePalette(COLOR_THEMES[1], true));
assert.notEqual(getThemePalette(COLOR_THEMES[0], true)[1], getThemePalette(COLOR_THEMES[1], true)[1]);
assert.deepEqual(getDeckStyle('<!-- theme: purple -->\n<!-- color-mode: monochrome -->'), { themeId: 'purple', colorful: false });
assert.deepEqual(getDeckStyle('## 未声明主题'), DEFAULT_DECK_STYLE);
const styledCover = buildSlideDeck('<!-- theme: emerald -->\n<!-- color-mode: colorful -->\n<!-- layout: cover -->\n# 苹果营养素深度解析');
assert.equal(styledCover[0]?.title, '苹果营养素深度解析');
assert.equal(completedPptMarkdown('## 第一页\n---\n## 未完成第二页'), '## 第一页');
assert.equal(completedPptMarkdown('## 尚未结束'), '');

const mismatchedGrid = `<!-- layout: grid2 -->
## 四大挑战
### 不应因 layout 声明错误而丢失内容
### 挑战一
- 第一条
### 挑战二
- 第二条
### 挑战三
- 第三条
### 挑战四
- 第四条`;

const gridSlide = buildSlideDeck(mismatchedGrid)[0];
assert.equal(gridSlide.items.length, 4);
assert.deepEqual(gridSlide.items.map((item) => item.title), ['挑战一', '挑战二', '挑战三', '挑战四']);
assert.equal(getSlidePlan(gridSlide).columns, 2);
assert.equal(getSlidePlan(gridSlide).rows, 2);
assert.equal(getSlidePlan(gridSlide).variant, 'matrix');

const longTable = `<!-- layout: table -->
## 七行表格
| 项目 | 描述 |
| --- | --- |
| 1 | A |
| 2 | B |
| 3 | C |
| 4 | D |
| 5 | E |
| 6 | F |
| 7 | G |`;

const tableSlides = buildSlideDeck(longTable);
assert.equal(tableSlides.length, 2);
assert.equal(tableSlides.reduce((total, slide) => total + (slide.table?.rows.length || 0), 0), 7);

const nineCards = `## 九宫格
${Array.from({ length: 9 }, (_, index) => `- **要点${index + 1}**：内容${index + 1}`).join('\n')}`;
const nineSlide = buildSlideDeck(nineCards)[0];
assert.equal(nineSlide.items.length, 9);
assert.deepEqual(getSlidePlan(nineSlide), { kind: 'cards', columns: 3, rows: 3, variant: 'matrix' });

const fiveCards = `## 五个观察
${Array.from({ length: 5 }, (_, index) => `- **观察${index + 1}**：内容${index + 1}`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(fiveCards)[0]), { kind: 'cards', columns: 2, rows: 3, variant: 'masonry' });

const denseFiveCards = `## 五大海滩一览
${Array.from({ length: 5 }, (_, index) => `- **海滩${index + 1}**：海滩特色与度假体验说明，月均客流量${index + 1}万\n  - 水质评分 8.0 / 10\n  - 日落评分 9.0 / 10\n  - 冲浪指数 7.0 / 10`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(denseFiveCards)[0]), { kind: 'cards', columns: 2, rows: 3, variant: 'masonry' });

const explicitFiveUp = `<!-- layout: grid5 -->
## 五大海滩一览
${Array.from({ length: 5 }, (_, index) => `### 海滩${index + 1}\n冲浪与日落体验，月均客流量${index + 1}万\n- 水质评分 8.0 / 10\n- 日落评分 9.0 / 10\n- 冲浪指数 7.0 / 10`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(explicitFiveUp)[0]), { kind: 'cards', columns: 5, rows: 1, variant: 'pillars' });

const twoColumnSix = `<!-- layout: grid6 -->
<!-- layout-variant: two-column -->
## 六项能力
${Array.from({ length: 6 }, (_, index) => `- **能力${index + 1}**：说明`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(twoColumnSix)[0]), { kind: 'cards', columns: 2, rows: 3, variant: 'rail' });

const horizontalFour = `<!-- layout: grid4 -->
<!-- layout-variant: horizontal -->
## 四项原则
${Array.from({ length: 4 }, (_, index) => `- **原则${index + 1}**：说明`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(horizontalFour)[0]), { kind: 'cards', columns: 4, rows: 1, variant: 'pillars' });

const detailedPillars = `## 三项深度能力
${Array.from({ length: 3 }, (_, index) => `- **能力${index + 1}**：${'用于描述实施细节与业务边界的完整说明。'.repeat(6)}`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(detailedPillars)[0]), { kind: 'cards', columns: 1, rows: 3, variant: 'stacked' });

const quoteWithScenes = `<!-- layout: quote -->
## 健康提示
### 快乐零食也要适量
> **核心原则**：选择无糖配方，控制食用频率。
**推荐场景**：餐后清新 · 会议提神
**避免场景**：空腹食用 · 睡前咀嚼`;
const quoteSlide = buildSlideDeck(quoteWithScenes)[0];
assert.equal(quoteSlide.quoteText, '**核心原则**：选择无糖配方，控制食用频率。');
assert.deepEqual(quoteSlide.items.map((item) => item.title), ['推荐场景', '避免场景']);

const partialTimeline = `---
<!-- layout: timeline -->
## 附录：从零开始的 Vibe Coding 实践路径
### 四步上手指南，逐步建立 AI 辅助开发能力
### 第一步：选好一个真实痛点`;
const partialTimelineSlide = buildSlideDeck(partialTimeline)[0];
assert.equal(partialTimelineSlide.title, '附录：从零开始的 Vibe Coding 实践路径');
assert.equal(partialTimelineSlide.subtitle, '四步上手指南，逐步建立 AI 辅助开发能力');
assert.deepEqual(partialTimelineSlide.items.map((item) => item.title), ['第一步：选好一个真实痛点']);
assert.equal(getSlidePlan(partialTimelineSlide).kind, 'timeline');

const chartSlide = buildSlideDeck(`<!-- layout: chart-right -->
<!-- chart: area -->
<!-- chart-title: 用户增长趋势 -->
## 增长表现与关键动作
### 数据变化与运营策略同步呈现
- **增长驱动**：优化新用户激活路径
- **经营重点**：提高高价值用户留存
| 月份 | 新增用户 | 活跃用户 |
| --- | ---: | ---: |
| 1 月 | 42 | 30 |
| 2 月 | 58 | 43 |
| 3 月 | 76 | 61 |`)[0];
assert.equal(getSlidePlan(chartSlide).kind, 'chart');
assert.equal(chartSlide.chart?.type, 'area');
assert.deepEqual(chartSlide.chart?.categories, ['1 月', '2 月', '3 月']);
assert.deepEqual(chartSlide.chart?.series[0].values, [42, 58, 76]);

const fourInsightChart = buildSlideDeck(`<!-- layout: chart-right -->
<!-- chart: column -->
## 海滩全景速览
- **Nusa Dua**：综合评分最高
- **Uluwatu**：冲浪与景观领先
- **Kuta**：人气最旺
- **Sanur**：水上活动丰富
| 海滩 | 评分 |
| --- | ---: |
| A | 8 |
| B | 9 |`)[0];
assert.equal(slideItems(fourInsightChart).length, 4);

assert.equal(getSlidePlan(buildSlideDeck(`<!-- layout: spotlight -->
## 技术栈拆解
- **总览一**：说明
- **总览二**：说明
- **总览三**：说明
- **模块一**：详情
- **模块二**：详情`)[0]).kind, 'spotlight');

console.log('slideDeck tests passed');
