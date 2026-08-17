# QuickGPT - 现代化多模型智能对话与聚合管理系统

基于 Node.js (内置 `node:sqlite` WAL 模式)、Fastify、React 19、Tailwind CSS 与 Vite 6 构建的高性能 AI 多模型聚合、实时审计与控制台系统。

---

## 🌟 核心特性

- **现代响应式 UI**：对标 ChatGPT 官方设计美学，支持深色/亮色无缝切换，桌面与移动端自适应。
- **多模型并行生成**：支持 1~4 个模型同屏并发流式对比回答；文本模型与生图模型智能分组与互斥选择。
- **多渠道优先级调度与多路故障转移 (Failover)**：渠道支持权重优先级调度，模型调用失败时毫秒级自动无缝尝试下一优先级可用渠道。
- **Any2API 级管理可观测性**：
  - 📊 **日志统计大屏**：KPI 汇总、Token/请求时间趋势图、Top 10 模型热度榜、渠道负载健康分析、用户活跃排行与 HTTP 状态码分布；
  - ⏱️ **实时审计日志**：支持全字段关键词搜索、多维过滤（模型/渠道/用户/状态/日期）、列头双向排序、5s 自动刷新、CSV 导出与完整追踪详情抽屉；
  - 🎨 **图片与多媒体日志**：画廊/列表双视图、磁盘占用统计、全屏高清灯箱预览、Prompt 复制与物理删除。
- **灵活站点品牌定制**：后台可视化上传或指定 Logo（支持 GIF 动图与 PNG 透明通道）、实时自定义站点标题、站点副标题、控制台副标题与页脚。
- **文档即时解析与多模态**：支持 `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.xlsx` 及各类图片上传解析。
- **KaTeX 数学公式与思维链 Markdown**：支持行内/块级 LaTeX 公式渲染，推理思维链 (Reasoning Process) 折叠与 Markdown 格式完美呈现。
- **极简部署与轻量高效**：单容器一体化静态托管，开箱即用，资源消耗极低。

---

## 🚀 快速启动

### 方式一：Docker Compose 一键启动（推荐）

通过 `docker-compose.yml` 运行服务（**优先自动拉取 GitHub 官方预构建镜像，若无法拉取则自动本地 build**）：

```yaml
services:
  quickgpt:
    image: ghcr.io/2guan/quickgpt:latest
    build:
      context: .
      dockerfile: Dockerfile
    pull_policy: missing
    container_name: quickgpt
    restart: unless-stopped
    ports:
      - "3200:3200"
    environment:
      - PORT=3200
      - HOST=0.0.0.0
      - DATA_DIR=/data
      - JWT_SECRET=quickgpt-production-secret-key-2026
      - DEFAULT_ADMIN_USERNAME=admin
      - DEFAULT_ADMIN_PASSWORD=admin2026
    volumes:
      - ./data:/data
```

只需在项目根目录下执行：

```bash
docker compose up -d
```

启动完成后在浏览器中访问：`http://localhost:3200`
- **默认管理员账号**：`admin`
- **默认管理员密码**：`admin2026`

> 数据文件（SQLite 数据库与上传的图片/文件）均持久化存储在挂载目录 `./data` 下。

---

### 方式二：本地运行与开发

#### 1. 安装依赖
```bash
npm install
```

#### 2. 生产打包与启动
```bash
npm run build
PORT=3200 node apps/api/dist/index.js
```

---

## 📦 GitHub 自动化镜像构建

本项目已集成 GitHub Actions 自动化 CI/CD 工作流（`.github/workflows/docker-publish.yml`）：
- 每次推送至 `main` 分支或打 Release Tag 时，GitHub Actions 会自动多架构编译（`linux/amd64`, `linux/arm64`）并发布镜像至：
  **`ghcr.io/2guan/quickgpt:latest`**
