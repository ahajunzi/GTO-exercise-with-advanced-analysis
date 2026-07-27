import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StoredGame, StoredDecisionRecord } from '../../services/database';
import { ACTION_NAMES, SUIT_SYMBOLS, SUIT_COLORS } from '../../constants';
import { Card, HandHistory } from '../../types';

interface GameDetailModalProps {
  game: StoredGame;
  onClose: () => void;
}

const PHASE_NAMES: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌'
};

function renderCard(card: Card, key: number) {
  return (
    <span
      key={key}
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-white text-xs font-bold shadow-sm mr-1"
      style={{ color: SUIT_COLORS[card.suit] }}
    >
      {card.rank}{SUIT_SYMBOLS[card.suit]}
    </span>
  );
}

/** 单手决策复盘子模块（内嵌到详情里） */
function HandDecisionsSection({ decisions }: { decisions: StoredDecisionRecord[] }) {
  if (!decisions || decisions.length === 0) {
    return (
      <div className="text-xs text-text-muted italic p-3 bg-white/5 rounded-lg">
        该手没有决策复盘数据（可能是较早对局，或此手你未参与决策）
      </div>
    );
  }

  const avgQuality = decisions.reduce((s, d) => s + d.quality, 0) / decisions.length;
  const totalLoss = decisions.reduce((s, d) => s + d.evLoss, 0);
  const bestDecisions = decisions.filter(d => d.quality >= 0.9).length;
  const mistakes = decisions.filter(d => d.quality < 0.5).length;

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
    <div className="space-y-3">
      {/* 评分概览 */}
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl font-black ${gradeColor} bg-white/5`}>
          {grade}
        </div>
        <div className="text-xs text-text-muted">
          <div>{decisions.length} 次决策 · 平均质量 <span className={gradeColor + ' font-bold'}>{Math.round(avgQuality * 100)}%</span></div>
          <div className="mt-1">优秀 {bestDecisions} · 失误 {mistakes} · 累计 EV 损失 {Math.round(totalLoss)}</div>
        </div>
      </div>

      {/* 决策明细 */}
      <div className="space-y-2">
        {decisions.map((d, i) => {
          const qPct = Math.round(d.quality * 100);
          const color = d.quality >= 0.85 ? 'primary' : d.quality >= 0.5 ? 'warning' : 'error';
          return (
            <div
              key={i}
              className={`p-2.5 rounded-lg border bg-background/50 border-${color}/30`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-5 text-right">#{i + 1}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-text-muted">
                    {PHASE_NAMES[d.phase] || d.phase}
                  </span>
                  <span className="font-semibold">
                    {ACTION_NAMES[d.action as keyof typeof ACTION_NAMES]}
                    {d.amount > 0 ? ` $${d.amount}` : ''}
                  </span>
                </div>
                <span className={`text-xs font-bold text-${color}`}>{qPct}%</span>
              </div>
              <div className={`text-[10px] text-${color} mb-0.5`}>{d.feedback}</div>
              {d.suggestion && (
                <div className="text-[10px] text-text-muted leading-snug">
                  建议：{d.suggestion}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 单手基础信息子模块（板牌 + 赢家 + 动作时间线） */
function HandBasicInfoSection({ hand }: { hand: HandHistory }) {
  return (
    <div className="space-y-3">
      {/* 公共牌 */}
      <div>
        <div className="text-[11px] text-text-muted mb-1">公共牌</div>
        <div className="flex items-center flex-wrap">
          {hand.board.length === 0
            ? <span className="text-xs text-text-muted italic">（未翻牌）</span>
            : hand.board.map((c, i) => renderCard(c, i))
          }
        </div>
      </div>

      {/* 赢家 */}
      <div>
        <div className="text-[11px] text-text-muted mb-1">赢家</div>
        {hand.winners.length === 0 ? (
          <span className="text-xs text-text-muted italic">无</span>
        ) : (
          <div className="space-y-1">
            {hand.winners.map((w, i) => {
              const player = hand.players.find(p => p.id === w.playerId);
              return (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className="text-primary">🏆</span>
                  <span className="font-semibold">{player?.name || w.playerId}</span>
                  <span className="text-warning">+${w.amount}</span>
                  <span className="text-text-muted">({w.hand})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 动作时间线 */}
      <div>
        <div className="text-[11px] text-text-muted mb-1">动作时间线（{hand.actions.length} 次）</div>
        <div className="max-h-40 overflow-y-auto bg-background/40 rounded-lg p-2 border border-white/5">
          {hand.actions.length === 0 ? (
            <span className="text-xs text-text-muted italic">无动作记录</span>
          ) : (
            <div className="space-y-1">
              {hand.actions.map((a, i) => {
                const player = hand.players.find(p => p.id === a.playerId);
                return (
                  <div key={i} className="text-[11px] flex items-center gap-2">
                    <span className="text-text-muted w-6 text-right">#{i + 1}</span>
                    <span className="px-1.5 rounded bg-white/5 text-[10px] text-text-muted">
                      {PHASE_NAMES[a.phase] || a.phase}
                    </span>
                    <span className="w-16 truncate">{player?.name || a.playerId}</span>
                    <span className="font-semibold">
                      {ACTION_NAMES[a.action.type as keyof typeof ACTION_NAMES]}
                    </span>
                    {a.action.amount > 0 && (
                      <span className="text-warning">${a.action.amount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const [expandedHandIdx, setExpandedHandIdx] = useState<number | null>(
    game.history.length > 0 ? 0 : null // 默认展开第一手
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

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
          className="bg-gradient-to-br from-background-dark to-background rounded-2xl border border-white/10 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-xl font-bold">对局详情</h2>
              <p className="text-xs text-text-muted mt-1">
                {formatDate(game.timestamp)} · {game.config.playerCount}人桌 · 盲注 ${game.config.smallBlind}/${game.config.bigBlind} · 共 {game.history.length} 手
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary hover:bg-primary-600 rounded-lg font-semibold text-sm transition-colors"
            >
              关闭 ✕
            </button>
          </div>

          {/* Body：每手一个可折叠卡片 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {game.history.length === 0 ? (
              <div className="text-center py-12 text-text-muted">该对局没有手牌记录</div>
            ) : (
              game.history.map((hand, idx) => {
                const isExpanded = expandedHandIdx === idx;
                const decisions = game.decisions?.[hand.id] || [];
                const hasDecisions = decisions.length > 0;

                return (
                  <div
                    key={hand.id}
                    className="bg-background-dark/50 rounded-xl border border-white/10 overflow-hidden"
                  >
                    {/* 折叠头 */}
                    <button
                      onClick={() => setExpandedHandIdx(isExpanded ? null : idx)}
                      className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                        <span className="font-semibold text-sm">第 {idx + 1} 手</span>
                        <span className="text-xs text-text-muted">
                          {formatDate(hand.timestamp)}
                        </span>
                        {hasDecisions && (
                          <span className="px-2 py-0.5 rounded bg-info/20 text-info text-[10px] font-semibold">
                            📊 有复盘（{decisions.length}）
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {hand.board.slice(0, 5).map((c, i) => renderCard(c, i))}
                      </div>
                    </button>

                    {/* 折叠体 */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-white/10"
                      >
                        <div className="grid md:grid-cols-2 gap-4 p-4">
                          {/* 左：基础信息 */}
                          <div>
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <span>🃏</span> 手牌信息
                            </h4>
                            <HandBasicInfoSection hand={hand} />
                          </div>

                          {/* 右：决策复盘 */}
                          <div>
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <span>📈</span> 决策复盘
                            </h4>
                            <HandDecisionsSection decisions={decisions} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-info/10 border-t border-info/20 text-[11px] text-text-muted leading-relaxed flex-shrink-0">
            💡 决策评分基于 GTO 最优策略。较早的对局可能无复盘数据 —— 新对局会自动记录。
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
