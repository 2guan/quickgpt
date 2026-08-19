import assert from 'node:assert/strict';
import { buildSlideDeck, COLOR_THEMES, completedPptMarkdown, DEFAULT_DECK_STYLE, getDeckStyle, getSlidePlan, getThemePalette, itemText, slideItems } from './slideDeck.js';

assert.equal(COLOR_THEMES.length, 10);
assert.notDeepEqual(getThemePalette(COLOR_THEMES[0], true), getThemePalette(COLOR_THEMES[1], true));
assert.notEqual(getThemePalette(COLOR_THEMES[0], true)[1], getThemePalette(COLOR_THEMES[1], true)[1]);
assert.deepEqual(getDeckStyle('<!-- theme: purple -->\n<!-- color-mode: monochrome -->'), { themeId: 'purple', colorful: false });
assert.deepEqual(getDeckStyle('## 未声明主题'), DEFAULT_DECK_STYLE);
const styledCover = buildSlideDeck('<!-- theme: emerald -->\n<!-- color-mode: colorful -->\n<!-- layout: cover -->\n# 苹果营养素深度解析');
assert.equal(styledCover[0]?.title, '苹果营养素深度解析');
assert.equal(completedPptMarkdown('## 第一页\n---\n## 未完成第二页'), '## 第一页');
assert.equal(completedPptMarkdown('## 尚未结束'), '');

const inlineRules = buildSlideDeck(`<!-- layout: spotlight -->
## 三个阶段
### 演进路径
---
### 阶段一
- 起点
### 阶段二
- 发展
### 阶段三
- 交付
---
<!-- layout: grid2 -->
## 下一页
- **A**：内容
- **B**：内容`);
assert.equal(inlineRules.length, 2);
assert.deepEqual(inlineRules[0]?.items.map((item) => item.title), ['阶段一', '阶段二', '阶段三']);

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
assert.deepEqual(getSlidePlan(buildSlideDeck(fiveCards)[0]), { kind: 'cards', columns: 3, rows: 2, variant: 'matrix' });

const denseFiveCards = `## 五大海滩一览
${Array.from({ length: 5 }, (_, index) => `- **海滩${index + 1}**：海滩特色与度假体验说明，月均客流量${index + 1}万\n  - 水质评分 8.0 / 10\n  - 日落评分 9.0 / 10\n  - 冲浪指数 7.0 / 10`).join('\n')}`;
assert.deepEqual(getSlidePlan(buildSlideDeck(denseFiveCards)[0]), { kind: 'cards', columns: 2, rows: 3, variant: 'rail' });

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

const balancedSpotlight = buildSlideDeck(`<!-- layout: spotlight -->
<!-- layout-variant: balanced -->
## 四项上下文约束
${Array.from({ length: 4 }, (_, index) => `- **约束${index + 1}**：说明`).join('\n')}`)[0];
assert.deepEqual(getSlidePlan(balancedSpotlight), { kind: 'cards', columns: 2, rows: 2, variant: 'matrix' });

const valueParagraph = buildSlideDeck(`<!-- layout: grid2 -->
## PAMS
### 核心价值
构建问题闭环网络
### 关键能力
- 在线执行`)[0];
assert.equal(valueParagraph.items[0]?.title, '核心价值');

const nestedCards = buildSlideDeck(`<!-- layout: grid2 -->
## 上下文工程
### 核心理念
将想法转为结构化需求
### 四大核心要素
#### 明确角色矩阵
定义用户角色与权限
#### 细化业务场景
绘制状态流转
#### 锁定审计规则
规定日志存储`)[0];
assert.equal(nestedCards.items[1]?.children?.length, 3);
assert.deepEqual(nestedCards.items[1]?.children?.map((item) => item.title), ['明确角色矩阵', '细化业务场景', '锁定审计规则']);
assert.match(itemText(nestedCards.items[1]!), /定义用户角色与权限/);

const quoteWithChallenge = buildSlideDeck(`<!-- layout: quote -->
## 行动结语
### 核心结语
**主结论不能被覆盖**
> 课后挑战：立刻开始实践`)[0];
assert.equal(quoteWithChallenge.quoteText, '**主结论不能被覆盖**');
assert.equal(quoteWithChallenge.notes, '课后挑战：立刻开始实践');

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

const groupedQuotes = buildSlideDeck(`<!-- layout: quote -->
## 旅行建议
> **家庭度假**
> 选择平缓浅滩

> **冲浪爱好者**
> 选择世界级浪点

> **最佳季节**
> 4 月至 10 月`)[0];
assert.deepEqual(groupedQuotes.quoteBlocks, ['**家庭度假**\n选择平缓浅滩', '**冲浪爱好者**\n选择世界级浪点', '**最佳季节**\n4 月至 10 月']);

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

const numberedTimeline = buildSlideDeck(`<!-- layout: timeline -->
## 多 AI 协同矩阵与敏捷闭环工作流
### 5步打造虚拟开发团队
1. ### 意图表达
   - 使用 DeepSeek 作为首席业务架构师
2. ### 架构扩充
   - 使用 Google Stitch 作为 UI 原型师
3. ### 代码生成
   - 使用 Codex/Claude 作为主力全栈工程师
4. ### 本地调试
   - 本地运行并测试功能
5. ### 定向补充
   - 使用 OpenClaw 作为重构专家`)[0];
assert.deepEqual(numberedTimeline.items.map((item) => item.title), ['意图表达', '架构扩充', '代码生成', '本地调试', '定向补充']);
assert.deepEqual(numberedTimeline.items.map((item) => item.bullets?.[0]), [
  '使用 DeepSeek 作为首席业务架构师',
  '使用 Google Stitch 作为 UI 原型师',
  '使用 Codex/Claude 作为主力全栈工程师',
  '本地运行并测试功能',
  '使用 OpenClaw 作为重构专家',
]);

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

const denseCard = buildSlideDeck(`## 高密度卡片
- **完整性**：说明
  - 要点 1
  - 要点 2
  - 要点 3
  - 要点 4
  - 要点 5
  - 要点 6`);
assert.equal(denseCard[0]?.items.length, 2);
assert.deepEqual(denseCard[0]?.items.flatMap((item) => item.bullets || []), ['要点 1', '要点 2', '要点 3', '要点 4', '要点 5', '要点 6']);

const chartWithFiveInsights = buildSlideDeck(`<!-- layout: chart-right -->
<!-- chart: column -->
## 五项图表洞察
${Array.from({ length: 5 }, (_, index) => `- **洞察 ${index + 1}**：完整保留`).join('\n')}
| 月份 | 数值 |
| --- | ---: |
| 1 月 | 10 |
| 2 月 | 20 |`);
assert.equal(chartWithFiveInsights.length, 2);
assert.equal(chartWithFiveInsights.reduce((total, slide) => total + slideItems(slide).length, 0), 5);

const hubSlide = buildSlideDeck(`<!-- layout: hub -->
## 企业级测试方法
### 流程化标准化
- **统一标准**：明确分析设计口径
- **专业共享**：沉淀可复用资产
- **有序协同**：建立协同机制
- **快速有效**：形成分析闭环`)[0];
assert.equal(getSlidePlan(hubSlide).kind, 'hub');

const challengeSlide = buildSlideDeck(`<!-- layout: challenge-solution -->
## 难点与方案
### 认知差距
#### 难点
标准与习惯存在断层
#### 解决方案
逐项对比并组织答疑
### 职责边界
#### 难点
多方职责交叉
#### 解决方案
建立角色矩阵`)[0];
assert.equal(getSlidePlan(challengeSlide).kind, 'challenge');
assert.deepEqual(challengeSlide.items[0]?.children?.map((item) => item.title), ['难点', '解决方案']);

const chartGridSlide = buildSlideDeck(`<!-- layout: chart-grid -->
<!-- chart: column -->
## 四维质量分析
| 周期 | 缺陷密度 | 执行效率 | 修复效率 | 重现率 |
| --- | ---: | ---: | ---: | ---: |
| 一期 | 15.1 | 958 | 81 | 15.8 |
| 二期 | 6.9 | 1495 | 66 | 17 |`)[0];
assert.equal(getSlidePlan(chartGridSlide).kind, 'chartGrid');
assert.equal(chartGridSlide.chart?.series.length, 4);

const dashboardSlide = buildSlideDeck(`<!-- layout: dashboard -->
<!-- chart: bar -->
## 问题经营总览
- **问题总数**：182
- **已解决**：155
| 类型 | 金科问题 | 农信问题 |
| --- | ---: | ---: |
| 应用配置 | 57 | 37 |
| 程序代码 | 14 | 13 |`)[0];
assert.equal(getSlidePlan(dashboardSlide).kind, 'dashboard');

assert.equal(getSlidePlan(buildSlideDeck(`<!-- layout: spotlight -->
## 技术栈拆解
- **总览一**：说明
- **总览二**：说明
- **总览三**：说明
- **模块一**：详情
- **模块二**：详情`)[0]).kind, 'spotlight');

console.log('slideDeck tests passed');
