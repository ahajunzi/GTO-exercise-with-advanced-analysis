import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DecisionRecord } from '../../stores/gameStore';
import { ACTION_NAMES } from '../../constants';

interface HandReviewModalProps {
  decisions: DecisionRecord[];
  onClose: () => void;
}

const PHASE_NAMES: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌'
};

export function HandReviewModal({ decisions, onClose }: HandReviewModalProps) {
  if (decisions.length === 0) return null;

  const avgQuality = decisions.reduce((s, d) => s + d.quality, 0) / decisions.length;
  const totalLoss = decisions.reduce((s, d) => s + d.evLoss, 0);
  const bestDecisions = decisions.filter(d => d.quality >= 0.9).length;
  const mistakes = decisions.filter(d => d.quality < 0.5).length;

  const chartData = decisions.map((d, i) => ({
    step: i + 1,
    quality: Math.round(d.quality * 100),
    label: `${PHASE_NAMES[d.phase] || d.phase} · ${ACTION_NAMES[d.action as keyof typeof ACTION_NAMES]}`,
  }));

  const gradeColor =
    avgQuality >= 0.85 ? 'text-primary'
    : avgQuality >= 0.65 ? 'text-warning'
    : 'text-error';

  const grade =
    avgQuality >= 0.9 ? 'S'
    : avgQuality >= 0.8 ? 'A'
    : avgQuality >= 0.65 ? 'B'
    : avgQuality >= 0.5 ? 'C'
    : 'D';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-br from-background-dark to-background rounded-2xl border border-white/10 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-black ${gradeColor} bg-white/5`}>
                {grade}
              </div>
              <div>
                <h2 className="text-xl font-bold">本手决策复盘</h2>
                <p className="text-xs text-text-muted mt-1">
                  {decisions.length} 次决策 · 平均质量 <span className={gradeColor}>{Math.round(avgQuality * 100)}%</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary hover:bg-primary-600 rounded-lg font-semibold text-sm transition-colors"
            >
              关闭 ✕
            </button>
          </div>

          {/* 概览卡片 */}
          <div className="grid grid-cols-3 gap-3 p-6">
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{bestDecisions}</div>
              <div className="text-[11px] text-text-muted mt-1">优秀决策</div>
            </div>
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-center">
              <div className="text-2xl font-bold text-warning">{Math.round(totalLoss)}</div>
              <div className="text-[11px] text-text-muted mt-1">累计 EV 损失</div>
            </div>
            <div className={`p-3 rounded-lg text-center border ${mistakes > 0 ? 'bg-error/10 border-error/20' : 'bg-white/5 border-white/10'}`}>
              <div className={`text-2xl font-bold ${mistakes > 0 ? 'text-error' : 'text-text-muted'}`}>{mistakes}</div>
              <div className="text-[11px] text-text-muted mt-1">明显失误</div>
            </div>
          </div>

          {/* 决策评分曲线 */}
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-info">📈</span> 决策评分曲线
            </h3>
            <div className="bg-background/50 rounded-lg p-3 border border-white/5">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="step" stroke="#94A3B8" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#94A3B8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => `第 ${v} 次决策`}
                    formatter={(val: number, _n, item: any) => [`${val}% - ${item.payload.label}`, '质量']}
                  />
                  <ReferenceLine y={90} stroke="#10B981" strokeDasharray="3 3" label={{ value: '优秀', position: 'right', fill: '#10B981', fontSize: 10 }} />
                  <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '失误', position: 'right', fill: '#EF4444', fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="quality"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#3B82F6' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 决策明细 */}
          <div className="px-6 pb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-info">📋</span> 决策明细
            </h3>
            <div className="space-y-2">
              {decisions.map((d, i) => {
                const qPct = Math.round(d.quality * 100);
                const color = d.quality >= 0.85 ? 'primary' : d.quality >= 0.5 ? 'warning' : 'error';
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`p-3 rounded-lg border bg-background/50 border-${color}/30`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-muted w-6 text-right">#{i + 1}</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[11px] text-text-muted">
                          {PHASE_NAMES[d.phase] || d.phase}
                        </span>
                        <span className="font-semibold">
                          {ACTION_NAMES[d.action as keyof typeof ACTION_NAMES]}
                          {d.amount > 0 ? ` $${d.amount}` : ''}
                        </span>
                      </div>
                      <span className={`text-sm font-bold text-${color}`}>{qPct}%</span>
                    </div>
                    <div className={`text-[11px] text-${color} mb-0.5`}>{d.feedback}</div>
                    {d.suggestion && (
                      <div className="text-[11px] text-text-muted leading-snug">
                        建议：{d.suggestion}
                      </div>
                    )}
                    {d.handSnapshot && (
                      <div className="text-[10px] text-text-muted mt-1 flex gap-3">
                        <span>底池 ${Math.round(d.handSnapshot.pot)}</span>
                        {d.handSnapshot.toCall > 0 && <span>需跟 ${Math.round(d.handSnapshot.toCall)}</span>}
                        <span>权益 {Math.round(d.handSnapshot.equity * 100)}%</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="p-4 bg-info/10 border-t border-info/20 text-[11px] text-text-muted leading-relaxed">
            💡 评分基于 GTO 最优策略的 EV loss 计算。混合策略中的合理选项即使不是最优也会给到 ≥75%。
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
