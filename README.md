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

<table>
  <tr>
    <td align="center">
      <b>🏠 首页 · Home</b><br/>
      <img src="https://placehold.co/600x360/1e293b/ffffff/png?text=%F0%9F%8F%A0+Home+Page%0A%0AGTO+Trainer+Landing" alt="Home Page" width="100%"/>
      <sub>项目介绍、快速开始与最近对局入口</sub>
    </td>
    <td align="center">
      <b>🎮 游戏对局 · Game Table</b><br/>
      <img src="https://placehold.co/600x360/065f46/ffffff/png?text=%F0%9F%83%8F+Poker+Table%0A%0A9-Max+%7C+AI+Opponents" alt="Game Table" width="100%"/>
      <sub>9-max 牌桌、玩家席位、公共牌与下注面板</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>📐 GTO 助手 · GTO Assistant</b><br/>
      <img src="https://placehold.co/600x360/7c2d12/ffffff/png?text=%F0%9F%93%90+GTO+Assistant%0A%0AEV+%7C+Pot+Odds+%7C+Range" alt="GTO Assistant" width="100%"/>
      <sub>实时策略建议、EV 计算与底池赔率分析</sub>
    </td>
    <td align="center">
      <b>📊 复盘分析 · Analysis</b><br/>
      <img src="https://placehold.co/600x360/1e3a8a/ffffff/png?text=%F0%9F%93%8A+Analysis%0A%0AVPIP+%7C+PFR+%7C+AF" alt="Analysis" width="100%"/>
      <sub>VPIP / PFR / AF 等核心指标与手牌回放</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>⚙️ 游戏设置 · Settings</b><br/>
      <img src="https://placehold.co/600x360/581c87/ffffff/png?text=%E2%9A%99%EF%B8%8F+Settings%0A%0APlayers+%7C+Blinds+%7C+AI" alt="Settings" width="100%"/>
      <sub>玩家人数、盲注、初始筹码与 AI 难度配置</sub>
    </td>
    <td align="center">
      <b>🃏 手牌评估 · Hand Evaluator</b><br/>
      <img src="https://placehold.co/600x360/9f1239/ffffff/png?text=%F0%9F%83%8F+Hand+Evaluator%0A%0AFlush+%7C+Straight+%7C+Draws" alt="Hand Evaluator" width="100%"/>
      <sub>牌型识别与听牌（Flush / Straight / Gutshot）检测</sub>
    </td>
  </tr>
</table>

> 💡 上图为界面示意占位图；正式截图可在运行 `npm start` 后自行截取替换。

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm / pnpm / yarn 任一包管理器

### 安装依赖

```bash
npm install
```

### 启动项目

```bash
npm start
```

浏览器访问 [http://localhost:5173](http://localhost:5173) 即可开始体验。

---

## 📁 项目结构

```
GTO-exercise-with-advanced-analysis/
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
