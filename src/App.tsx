import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Settings as SettingsIcon, History, Sparkles, Cpu, Target } from 'lucide-react';
import { useGameStore } from './stores/gameStore';
import { GamePage } from './components/game/GamePage';
import { AnalysisPage } from './components/analysis/AnalysisPage';
import { SettingsPage } from './components/settings/SettingsPage';

type Page = 'home' | 'game' | 'analysis' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { initializeGame, isGameStarted } = useGameStore();

  const handleStartGame = () => {
    if (!isGameStarted) {
      initializeGame();
    }
    setCurrentPage('game');
  };

  if (currentPage === 'game') {
    return <GamePage onBack={() => setCurrentPage('home')} />;
  }

  if (currentPage === 'analysis') {
    return <AnalysisPage onBack={() => setCurrentPage('home')} />;
  }

  if (currentPage === 'settings') {
    return <SettingsPage onBack={() => setCurrentPage('home')} />;
  }

  // Home Page - 科技感重构
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* 背景装饰：网格 + 光晕 */}
      <div className="pointer-events-none absolute inset-0">
        {/* 网格 */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          }}
        />
        {/* 光晕 */}
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-10 left-0 h-[360px] w-[360px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050816]/70 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-fuchsia-500 shadow-[0_0_24px_-4px_rgba(56,189,248,0.8)]">
              <span className="text-lg">🃏</span>
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
              </span>
            </div>
            <div className="leading-tight">
              <h1 className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-lg font-bold tracking-wide text-transparent">
                GTO 训练
              </h1>
              <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/60">
                Poker · Training
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage('analysis')}
              className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all hover:border-cyan-400/50 hover:text-cyan-300 sm:flex"
            >
              <History className="h-3.5 w-3.5" />
              记录
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all hover:border-cyan-400/50 hover:text-cyan-300 sm:flex"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              设置
            </button>
            <button
              onClick={handleStartGame}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-1.5 text-xs font-semibold text-white shadow-[0_0_18px_-4px_rgba(56,189,248,0.9)] transition-all hover:shadow-[0_0_24px_-2px_rgba(232,121,249,0.9)]"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              开局
            </button>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-16 pt-28">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-4 py-1.5 text-xs text-cyan-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="tracking-wider">AI · GTO · Real-time</span>
            <span className="text-fuchsia-300">✨</span>
          </div>

          <h2 className="mb-4 text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
            <span className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-transparent">
              极致 GTO
            </span>
            <span className="ml-2 inline-block">🎯</span>
          </h2>
          <p className="mx-auto max-w-md text-sm text-gray-400 md:text-base">
            智能对手 · 即时策略 · 决策进化
          </p>
        </motion.div>

        {/* 主 CTA 面板 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative w-full max-w-3xl"
        >
          {/* 发光边框 */}
          <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-cyan-500/60 via-sky-500/40 to-fuchsia-500/60 opacity-70 blur-[2px]" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1f]/80 p-8 backdrop-blur-xl">
            {/* 内部装饰点 */}
            <div className="pointer-events-none absolute right-6 top-6 flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
              <span className="h-2 w-2 rounded-full bg-fuchsia-400/70 shadow-[0_0_8px_rgba(232,121,249,0.9)]" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* 开始游戏 - 主按钮 */}
              <button
                onClick={handleStartGame}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-500 to-fuchsia-500 p-[1.5px] transition-all hover:shadow-[0_0_40px_-8px_rgba(56,189,248,0.8)]"
              >
                <div className="relative flex h-full flex-col items-start gap-3 rounded-2xl bg-[#0a0f1f] p-6 transition-all group-hover:bg-[#0d1428]">
                  <div className="flex w-full items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-400/20 text-2xl ring-1 ring-cyan-400/40">
                      🎮
                    </div>
                    <Play className="h-5 w-5 fill-cyan-300 text-cyan-300 transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold text-white">开始训练</div>
                    <div className="mt-1 text-xs text-gray-400">
                      进入牌桌，与 AI 对手实战
                    </div>
                  </div>
                </div>
              </button>

              {/* 设置 - 次按钮 */}
              <button
                onClick={() => setCurrentPage('settings')}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition-all hover:border-fuchsia-400/50 hover:bg-white/[0.07]"
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-400/20 to-cyan-400/20 text-2xl ring-1 ring-fuchsia-400/30">
                    ⚙️
                  </div>
                  <SettingsIcon className="h-5 w-5 text-fuchsia-300 transition-transform group-hover:rotate-90" />
                </div>
                <div className="mt-3">
                  <div className="text-xl font-bold text-white">牌桌配置</div>
                  <div className="mt-1 text-xs text-gray-400">
                    人数、盲注、AI 难度
                  </div>
                </div>
              </button>
            </div>

            {/* 底部小指标条 - 增加科技感 */}
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/5 pt-5">
              <Stat icon={<Cpu className="h-3.5 w-3.5" />} label="AI 引擎" value="4 档" />
              <Stat icon={<Target className="h-3.5 w-3.5" />} label="GTO 求解" value="实时" />
              <Stat icon={<span className="text-sm">🎲</span>} label="牌桌" value="2–9 人" />
            </div>
          </div>
        </motion.div>

        {/* 底部提示 */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center text-[11px] tracking-widest text-gray-500"
        >
          <span className="mr-2 inline-block h-1 w-1 rounded-full bg-cyan-400 align-middle" />
          Powered by GTO Solver
          <span className="ml-2 inline-block h-1 w-1 rounded-full bg-fuchsia-400 align-middle" />
        </motion.p>
      </main>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400/20 to-fuchsia-400/20 text-cyan-300">
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          {label}
        </div>
        <div className="text-xs font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

export default App;
