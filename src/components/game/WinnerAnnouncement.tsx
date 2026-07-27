import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Player, HandEvaluation } from '../../types';
import { PokerCard } from '../common/PokerCard';

interface ShowdownResult {
  player: Player;
  hand: HandEvaluation;
  winAmount: number;
  isWinner: boolean;
}

interface WinnerAnnouncementProps {
  results: ShowdownResult[];
  /** 显示时长(ms)，之后进入紧凑模式（顶部小徽章），不遮挡后续操作 */
  duration?: number;
}

/**
 * 胜利大公告：屏幕中央大字显示获胜者
 *  阶段1 (0 ~ duration): 全屏遮罩 + 大公告 + 金光粒子
 *  阶段2 (> duration): 淡出遮罩，只保留顶部一条紧凑的胜利条幅
 */
export function WinnerAnnouncement({ results, duration = 2600 }: WinnerAnnouncementProps) {
  const [expanded, setExpanded] = useState(true);
  const winners = results.filter(r => r.isWinner);
  const totalWinnings = winners.reduce((sum, w) => sum + w.winAmount, 0);
  const isTie = winners.length > 1;
  const isHumanWinner = winners.some(w => w.player.type === 'human');

  useEffect(() => {
    const t = setTimeout(() => setExpanded(false), duration);
    return () => clearTimeout(t);
  }, [duration]);

  const titleText = isTie
    ? '⚖️ 平局！'
    : isHumanWinner
      ? '🎉 你赢了！'
      : `${winners[0]?.player.name} 获胜`;

  const subtitleColor = isHumanWinner ? 'from-yellow-300 via-amber-400 to-orange-500' : 'from-primary via-primary-600 to-info';

  return (
    <AnimatePresence mode="wait">
      {expanded ? (
        // ========================= 阶段 1：大公告 =========================
        <motion.div
          key="expanded"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center"
        >
          {/* 背景聚光灯 */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 3, opacity: 0.6 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className={`absolute w-96 h-96 rounded-full blur-3xl ${
              isHumanWinner ? 'bg-yellow-500/40' : 'bg-primary/40'
            }`}
          />

          {/* 金色粒子（简单方案：多个 span 做发散动画） */}
          {isHumanWinner && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => {
                const angle = (i / 24) * Math.PI * 2;
                const distance = 260 + Math.random() * 200;
                const x = Math.cos(angle) * distance;
                const y = Math.sin(angle) * distance;
                return (
                  <motion.span
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                    animate={{ x, y, opacity: 0, scale: 1.2 }}
                    transition={{ duration: 1.4, ease: 'easeOut', delay: 0.15 }}
                    className="absolute w-2 h-2 rounded-full bg-yellow-300 shadow-[0_0_10px_2px_rgba(250,204,21,0.9)]"
                  />
                );
              })}
            </div>
          )}

          {/* 主卡片 */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -40 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.1 }}
            className="relative flex flex-col items-center gap-4 px-10 py-8 rounded-3xl bg-gradient-to-br from-background-dark/95 via-background/95 to-background-dark/95 border-2 border-yellow-500/40 shadow-[0_0_60px_10px_rgba(234,179,8,0.35)]"
          >
            {/* 冠军图标 */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 8, delay: 0.25 }}
              className="text-7xl drop-shadow-[0_0_20px_rgba(250,204,21,0.7)]"
            >
              {isTie ? '⚖️' : '🏆'}
            </motion.div>

            {/* 标题 */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${subtitleColor} bg-clip-text text-transparent tracking-wide text-center`}
            >
              {titleText}
            </motion.h1>

            {/* 获胜者详情 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="flex gap-4 items-center justify-center flex-wrap"
            >
              {winners.map((w) => (
                <div
                  key={w.player.id}
                  className="flex flex-col items-center gap-2 min-w-[180px] px-4 py-3 bg-yellow-500/10 border border-yellow-500/40 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-yellow-500/30 ring-2 ring-yellow-500 flex items-center justify-center text-lg">
                      {w.player.type === 'human' ? '👤' : '🤖'}
                    </div>
                    <span className="font-bold text-white text-lg">{w.player.name} 👑</span>
                  </div>

                  {/* 获胜手牌（如果可见） */}
                  {w.player.cards.length > 0 && (
                    <div className="flex gap-1">
                      {w.player.cards.map((c, i) => (
                        <div key={i} className="scale-75 -mx-1">
                          <PokerCard card={c} size="small" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-text-muted">{w.hand.name}</div>
                </div>
              ))}
            </motion.div>

            {/* 奖池 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.75, type: 'spring' }}
              className="flex items-baseline gap-2"
            >
              <span className="text-sm text-text-muted">赢取奖池</span>
              <span className="text-3xl font-black text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]">
                ${totalWinnings.toLocaleString()}
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : (
        // ========================= 阶段 2：顶部紧凑徽章 =========================
        <motion.div
          key="compact"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ type: 'spring', damping: 18 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        >
          <div className="flex items-center gap-3 px-5 py-2 bg-gradient-to-r from-yellow-500/20 via-yellow-500/10 to-yellow-500/20 border border-yellow-500/40 rounded-full shadow-lg backdrop-blur-md">
            <span className="text-lg">🏆</span>
            <span className="text-sm font-bold text-yellow-300">
              {isTie ? '平局' : `${winners[0]?.player.name} 获胜`}
            </span>
            <span className="text-xs text-yellow-500">
              +${totalWinnings.toLocaleString()}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
