# News Viber

面向新闻、对话与自动化产出的桌面 AI 情报工作台。

[English](./README.md) · [Releases](https://github.com/shipengtaov/newsviber/releases) · [Issues](https://github.com/shipengtaov/newsviber/issues/new)

## 概览

News Viber 把来源管理、范围化 AI 对话和自动化产出放进同一个桌面工作区。它适合那些希望把“收集信号、提出问题、沉淀结论”串成一个更紧凑工作流的人。

核心能力：

- RSS / Atom 来源
- 范围化 AI 对话
- 基于新闻自动化生成期望产出
- 带本地存储的桌面应用
- 可切换的 AI Provider 配置

## 为什么用 News Viber

### Collect

把多个 RSS / Atom 来源集中管理，按计划抓取更新，并把文章保存在本地归档中，方便后续检索和复盘。采集层尽量简单，让你更快进入分析阶段。

### Ask

通过跨来源对话、保存好的来源范围以及时间窗口，对同一主题做对比、追踪持续事件，或者在已有线程里继续提问，而不是每次重新整理上下文。

### Create

把已收集的文章进一步转成可复用的产出工作流。你可以先定义想要的结果，再让项目持续检查范围内的新新闻，并自动生成报告、摘要、想法或任何你期望的产出。

### Configure

在同一个设置界面切换 provider、模型和网关入口，并在应用内统一管理更新、清理策略和语言偏好，而不是依赖零散脚本。

## 界面预览

<table>
  <tr>
    <td width="50%">
      <img src="../newsviber-website/assets/news-overview.png" alt="News overview" />
      <p><strong>新闻总览</strong><br/>在同一工作区快速查看活跃来源、未读数量和历史文章。</p>
    </td>
    <td width="50%">
      <img src="../newsviber-website/assets/cross-source-chat.png" alt="Cross-source chat" />
      <p><strong>跨来源对话</strong><br/>基于保存的范围和时间过滤器，对多个来源进行比较式问答。</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="../newsviber-website/assets/creative-space.png" alt="Automated outputs from news" />
      <p><strong>自动化产出</strong><br/>把范围内的新闻自动转成报告、摘要、想法或任何期望的结果。</p>
    </td>
    <td width="50%">
      <img src="../newsviber-website/assets/settings.png" alt="Provider settings" />
      <p><strong>Provider 设置</strong><br/>集中管理 AI provider、模型、更新与数据清理。</p>
    </td>
  </tr>
</table>

## 功能特性

- 新闻总览页面，支持来源过滤、未读统计、搜索和本地文章存储
- RSS / Atom 来源管理，支持手动刷新和定时抓取
- 跨来源 AI 对话，支持复用线程范围与时间范围
- 产出项目系统，可基于范围内新闻自动化生成任何期望的产出
- 统一的 AI provider 配置页，可接入托管模型、网关、本地模型和自定义接口
- 基于 Tauri updater 的应用内更新检查
- 本地数据清理能力，用于控制文章存储体积
- 多语言界面，当前包含英文、简体中文、繁体中文、日文、法文、德文、意大利文

## 下载

最新桌面版本可在 [GitHub Releases](https://github.com/shipengtaov/newsviber/releases) 下载。

当前发布目标：

- macOS Apple Silicon
- macOS Intel
- Windows x64

当前发布流程不包含 Linux 打包。

## 从源码运行

### 前置条件

- Node.js 和 npm
- Rust 工具链
- 你所在平台对应的 Tauri 构建依赖

### 安装依赖

```bash
npm install
```

### 启动桌面开发环境

```bash
npm run tauri dev
```

### 运行测试

```bash
npm run test
```

### 构建前端产物

```bash
npm run build
```

## AI Providers

News Viber 当前内置了这些 provider 配置：

- 托管模型：OpenAI、Anthropic (Claude)、Google (Gemini)、DeepSeek、Aliyun (Qwen)、Moonshot (Kimi)、Zhipu (GLM)、MiniMax
- 网关与兼容接口：OpenRouter、SiliconFlow、Vercel AI Gateway、Azure OpenAI
- 本地与自定义接口：Ollama、Custom

这些 provider 都可以在同一个设置界面中切换和配置。

## 技术栈

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust
- 通过 Tauri SQL plugin 使用 SQLite
- Vercel AI SDK 及兼容 provider 集成

## License

[Apache License 2.0](./LICENSE)
