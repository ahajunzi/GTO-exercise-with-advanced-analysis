# 🪙 德州扑克 GTO 训练器 (Texas Hold'em GTO Trainer)

> 一款基于 **博弈论最优解 (Game Theory Optimal, GTO)** 的德州扑克训练与复盘平台，帮助玩家通过 AI 对战、实时策略建议和数据分析，系统化提升扑克决策能力。

![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css)

---

## ✨ 功能特性

- 🎮 **完整的德州扑克引擎**：支持 2–9 人桌，涵盖 Preflop / Flop / Turn / River 四条街道的完整流程
- 🤖 **多难度智能 AI**：内置 Easy / Medium / Hard / Expert 四档难度，模拟 TAG / LAG / TAP / LAP 四种真实打法风格
- 📐 **GTO 求解器**：基于位置的翻前开牌范围表 + 实时 EV 计算，为每个决策点提供 GTO 建议
- 🃏 **手牌评估器**：支持所有牌型识别（同花顺 / 四条 / 葫芦 / 同花 / 顺子 / 三条 / 两对 / 对子 / 高牌），并检测同花听牌、顺子听牌、内听等 Draw 场景
- 📊 **数据统计与复盘**：追踪 VPIP、PFR、Aggression Factor 等核心指标，支持逐手回放分析
- 💾 **本地数据持久化**：使用 IndexedDB (Dexie.js) 存储历史手牌与统计数据，无需后端
- 🎨 **现代化 UI**：Tailwind CSS + Framer Motion 打造流畅的动画与响应式布局

---

## 📸 应用截图

| 首页 | 游戏对局 |
| :---: | :---: |
| ![Home](public/screenshots/home.png) | ![Game](public/screenshots/game.png) |

| 复盘分析 | 游戏设置 |
| :---: | :---: |
| ![Analysis](public/screenshots/analysis.png) | ![Settings](public/screenshots/settings.png) |

---

## 🛠️ 技术栈

| 分类 | 技术 |
| --- | --- |
| **前端框架** | React 18 + TypeScript |
| **构建工具** | Vite 5 |
| **状态管理** | Zustand |
| **样式方案** | Tailwind CSS + tailwind-merge + clsx |
| **动画库** | Framer Motion |
| **数据可视化** | Recharts |
| **本地存储** | Dexie.js (IndexedDB) |
| **图标** | Lucide React + React Icons |
| **代码规范** | ESLint + typescript-eslint |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm / pnpm / yarn 任一包管理器

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

浏览器访问 [http://localhost:5173](http://localhost:5173) 即可开始体验。

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

### 代码检查

```bash
npm run lint
```

---

## 📁 项目结构

```
GTO-exercise-with-advanced-analysis/
├── public/                     # 静态资源
│   └── screenshots/            # 应用截图
├── src/
│   ├── App.tsx                 # 应用主入口 & 路由
│   ├── main.tsx                # React 挂载入口
│   ├── index.css               # 全局样式
│   ├── components/             # UI 组件
│   │   ├── analysis/           # 复盘分析页 (AnalysisPage、StatsOverview、HandHistoryList)
│   │   ├── common/             # 通用组件 (PokerCard、PlayerSeat)
│   │   ├── game/               # 游戏对局相关 (GamePage、PokerTable、ActionPanel、GTOAssistant …)
│   │   └── settings/           # 游戏设置页
│   ├── engine/                 # 核心引擎
│   │   ├── game-logic/         # 扑克游戏流程引擎 (GameEngine)
│   │   ├── ai/                 # AI 决策引擎 (AIEngine、PreflopRanges)
│   │   └── gto/                # GTO 求解器 & 对手建模 (GTOSolver、OpponentModel)
│   ├── stores/                 # Zustand 全局状态
│   ├── services/               # 数据服务 (database、statsService)
│   ├── utils/                  # 工具函数 (deck、handEvaluator)
│   ├── constants/              # 常量定义
│   └── types/                  # TypeScript 类型定义
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── eslint.config.js
```

---

## 📜 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 运行 ESLint 检查 |

---

## 🎯 核心模块说明

- **`engine/game-logic/GameEngine.ts`**：驱动整个扑克对局，处理发牌、下注轮次、边池、摊牌与胜负判定。
- **`engine/ai/AIEngine.ts`**：AI 决策核心，根据难度、风格与手牌强度选择 Fold / Check / Call / Bet / Raise。
- **`engine/gto/GTOSolver.ts`**：GTO 求解器，结合位置、底池赔率、翻前范围表和 `OpponentModel` 输出策略建议与 EV。
- **`utils/handEvaluator.ts`**：手牌评估器，实现所有牌型比较及听牌识别。
- **`services/statsService.ts`**：统计服务，实时计算 VPIP / PFR / AF 等玩家扑克指标。

---

## 🤝 贡献指南

欢迎提交 Issue 与 Pull Request，一起完善这个项目！

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

感谢所有为扑克博弈论研究与开源社区做出贡献的开发者与研究者。

Happy Grinding! 🃏
