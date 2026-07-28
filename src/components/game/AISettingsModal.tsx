import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import {
  AI_STYLES,
  AIStyle,
  AIStyleOverride,
  DEFAULT_STYLE_WEIGHTS,
  STYLE_PRESETS,
  getStyleDisplayName,
} from '../../types/aiStyle';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STYLE_KEYS: AIStyle[] = ['TAG', 'LAG', 'TAP', 'LAP'];

export function AISettingsModal({ open, onClose }: Props) {
  const gameState = useGameStore(s => s.gameState);
  const aiStyleWeights = useGameStore(s => s.aiStyleWeights);
  const aiStyleOverrides = useGameStore(s => s.aiStyleOverrides);
  const setAiStyleWeights = useGameStore(s => s.setAiStyleWeights);
  const setAiStyleOverride = useGameStore(s => s.setAiStyleOverride);
  const applyAiStyleConfig = useGameStore(s => s.applyAiStyleConfig);
  const resetAiStyleConfig = useGameStore(s => s.resetAiStyleConfig);

  const [tab, setTab] = useState<'preset' | 'perSeat'>('preset');
  const [toast, setToast] = useState<string | null>(null);

  if (!open) return null;

  const aiPlayers = gameState
    ? gameState.players
        .map((p, i) => ({ index: i, name: p.name, type: p.type, style: p.aiStyle }))
        .filter(p => p.type === 'ai')
    : [];

  const totalWeight = STYLE_KEYS.reduce((s, k) => s + aiStyleWeights[k], 0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleApply = (immediate: boolean) => {
    applyAiStyleConfig({ immediate });
    showToast(immediate ? '✓ 已立即应用到本手' : '✓ 已保存，下一手生效');
  };

  const handleReset = () => {
    resetAiStyleConfig();
    showToast('已重置为默认');
  };

  const handlePresetPick = (key: string) => {
    const preset = STYLE_PRESETS[key];
    if (!preset) return;
    setAiStyleWeights(preset.weights);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-background-darker via-background-dark to-background shadow-2xl flex flex-col"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <div>
              <div className="text-lg font-black tracking-wider">⚙️ AI 风格设置</div>
              <div className="text-xs text-text-muted mt-0.5">
                控制对手的打牌风格：紧凶 / 松凶 / 紧弱 / 松弱
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-5 pt-3 gap-2 border-b border-white/5">
            <button
              onClick={() => setTab('preset')}
              className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition ${
                tab === 'preset'
                  ? 'bg-white/10 text-white border-b-2 border-primary'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              🎛️ 整桌预设
            </button>
            <button
              onClick={() => setTab('perSeat')}
              className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition ${
                tab === 'perSeat'
                  ? 'bg-white/10 text-white border-b-2 border-primary'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              🎯 逐座位指定
            </button>
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === 'preset' ? (
              <>
                {/* 预设方案卡片 */}
                <div className="mb-4">
                  <div className="text-xs text-text-muted font-semibold mb-2 tracking-wider">
                    一键预设方案
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => handlePresetPick(key)}
                        className="text-left p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary transition"
                      >
                        <div className="text-sm font-bold text-white mb-0.5">
                          {preset.name}
                        </div>
                        <div className="text-[10px] text-text-muted leading-tight">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义权重滑块 */}
                <div>
                  <div className="text-xs text-text-muted font-semibold mb-2 tracking-wider">
                    自定义权重（值越大，越易出现）
                  </div>
                  <div className="space-y-2">
                    {STYLE_KEYS.map((k) => {
                      const cfg = AI_STYLES[k];
                      const weight = aiStyleWeights[k];
                      const pct =
                        totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
                      return (
                        <div
                          key={k}
                          className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5"
                        >
                          <div className="w-20 shrink-0">
                            <div className="text-sm font-bold">
                              {getStyleDisplayName(k)}
                            </div>
                            <div className="text-[10px] text-text-muted truncate">
                              {cfg.description}
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={10}
                            step={1}
                            value={weight}
                            onChange={(e) =>
                              setAiStyleWeights({
                                ...aiStyleWeights,
                                [k]: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-primary"
                          />
                          <div className="w-16 text-right shrink-0">
                            <div className="text-sm font-mono font-bold text-primary">
                              {weight}
                            </div>
                            <div className="text-[10px] text-text-muted">
                              {pct}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {totalWeight === 0 && (
                    <div className="mt-2 text-[11px] text-warning">
                      ⚠ 所有权重都为 0 时会回退到默认分布
                    </div>
                  )}
                </div>
              </>
            ) : (
              // 逐座位指定
              <div>
                <div className="text-xs text-text-muted font-semibold mb-2 tracking-wider">
                  为每个 AI 座位单独锁定风格（选择"随机"则按整桌权重抽取）
                </div>
                {aiPlayers.length === 0 ? (
                  <div className="text-center py-8 text-text-muted text-sm">
                    还没有游戏在进行，无法配置具体座位
                  </div>
                ) : (
                  <div className="space-y-2">
                    {aiPlayers.map((p) => {
                      const override: AIStyleOverride =
                        aiStyleOverrides[p.index] ?? 'random';
                      return (
                        <div
                          key={p.index}
                          className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5"
                        >
                          <div className="w-24 shrink-0">
                            <div className="text-sm font-bold">{p.name}</div>
                            <div className="text-[10px] text-text-muted">
                              当前：{p.style ? getStyleDisplayName(p.style) : '未分配'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {(['random', ...STYLE_KEYS] as AIStyleOverride[]).map(
                              (opt) => {
                                const isActive = override === opt;
                                const label =
                                  opt === 'random'
                                    ? '🎲 随机'
                                    : getStyleDisplayName(opt as AIStyle);
                                return (
                                  <button
                                    key={opt}
                                    onClick={() =>
                                      setAiStyleOverride(p.index, opt)
                                    }
                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition border ${
                                      isActive
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white/5 text-text-muted border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部按钮栏 */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/10 bg-black/20">
            <button
              onClick={handleReset}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-text-muted"
            >
              重置为默认
            </button>
            <div className="flex items-center gap-2">
              {toast && (
                <span className="text-xs text-success font-semibold">{toast}</span>
              )}
              <button
                onClick={() => handleApply(false)}
                className="px-3 py-2 text-sm font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                下一手生效
              </button>
              <button
                onClick={() => handleApply(true)}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-lg"
              >
                立即应用
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
