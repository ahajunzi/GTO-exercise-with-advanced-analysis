import { motion } from 'framer-motion';
import { Player } from '../../types';
import { PokerCard } from './PokerCard';
import { getStyleDisplayName } from '../../types/aiStyle';

interface PlayerSeatProps {
  player: Player;
  isCurrentPlayer?: boolean;
  showCards?: boolean;
  position: { x: number; y: number };
  /** 是否是本手获胜者（用于金色高亮 + 👑 + 浮动金额） */
  isWinner?: boolean;
  /** 获胜金额（仅 isWinner=true 时显示） */
  winAmount?: number;
  /** 摊牌信息：手牌牌型名（如 "Two Pair"） */
  handName?: string;
}

export function PlayerSeat({
  player,
  isCurrentPlayer = false,
  showCards = false,
  position,
  isWinner = false,
  winAmount = 0,
  handName,
}: PlayerSeatProps) {
  const isActive = player.status === 'active' || player.status === 'waiting';
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all-in';

  // 获胜者边框色优先级最高；其次是当前行动玩家
  const borderClass = isWinner
    ? 'border-yellow-400 shadow-[0_0_28px_6px_rgba(250,204,21,0.55)]'
    : isCurrentPlayer
      ? 'border-primary shadow-lg shadow-primary/50'
      : 'border-white/20';

  return (
    <div
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <motion.div
        className={`relative ${isCurrentPlayer || isWinner ? 'z-10' : 'z-0'}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* 玩家信息卡片 */}
        <motion.div
          className={`relative bg-gradient-to-br from-background-dark to-background rounded-xl border-2 p-3 min-w-[140px] ${borderClass} ${
            isFolded && !isWinner ? 'opacity-50' : ''
          }`}
          animate={
            isWinner
              ? {
                  boxShadow: [
                    '0 0 20px rgba(250, 204, 21, 0.5)',
                    '0 0 40px rgba(250, 204, 21, 0.9)',
                    '0 0 20px rgba(250, 204, 21, 0.5)',
                  ],
                  scale: [1, 1.06, 1],
                }
              : isCurrentPlayer
                ? {
                    boxShadow: [
                      '0 0 20px rgba(16, 185, 129, 0.5)',
                      '0 0 30px rgba(16, 185, 129, 0.8)',
                      '0 0 20px rgba(16, 185, 129, 0.5)',
                    ],
                  }
                : {}
          }
          transition={{ duration: isWinner ? 1.2 : 1.5, repeat: Infinity }}
        >
          {/* 获胜者：顶部王冠 + 光环 */}
          {isWinner && (
            <>
              <motion.div
                initial={{ y: -6, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 260 }}
                className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-3xl drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]"
              >
                👑
              </motion.div>
              {/* 环绕金光粒子 */}
              <div className="pointer-events-none absolute inset-0 overflow-visible">
                {Array.from({ length: 10 }).map((_, i) => {
                  const angle = (i / 10) * Math.PI * 2;
                  const r = 90;
                  return (
                    <motion.span
                      key={i}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                      animate={{
                        x: Math.cos(angle) * r,
                        y: Math.sin(angle) * r,
                        opacity: [0, 1, 0],
                        scale: [0, 1.2, 0.4],
                      }}
                      transition={{
                        duration: 1.6,
                        delay: 0.05 * i,
                        repeat: Infinity,
                        repeatDelay: 0.6,
                      }}
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_8px_2px_rgba(250,204,21,0.9)]"
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* 状态指示器（获胜时隐藏，避免与👑冲突） */}
          {!isWinner && (player.isDealer || player.isSmallBlind || player.isBigBlind) && (
            <div className="absolute -top-2 -right-2 flex gap-1">
              {player.isDealer && (
                <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-amber-600">
                  D
                </div>
              )}
              {player.isSmallBlind && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-blue-600">
                  SB
                </div>
              )}
              {player.isBigBlind && (
                <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-red-600">
                  BB
                </div>
              )}
            </div>
          )}

          {/* 玩家头像 */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
              isWinner
                ? 'from-yellow-400 to-amber-600 ring-2 ring-yellow-300'
                : player.type === 'human' ? 'from-primary to-primary-600' : 'from-gray-500 to-gray-700'
            } flex items-center justify-center text-sm font-bold border-2 ${
              isActive || isWinner ? 'border-white' : 'border-gray-600'
            }`}>
              {player.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm truncate ${isWinner ? 'text-yellow-300' : ''}`}>
                {player.name}
              </div>
              {/* AI风格标签（获胜时替换为牌型名） */}
              {isWinner && handName ? (
                <div className="text-[10px] font-semibold text-yellow-400/90 mb-0.5 truncate">
                  {handName}
                </div>
              ) : player.type === 'ai' && player.aiStyle ? (
                <div className="text-[10px] text-text-muted mb-0.5">
                  {getStyleDisplayName(player.aiStyle)}
                </div>
              ) : null}
              <div className="flex items-center gap-1 text-xs text-text-muted">
                <span className="text-warning">🪙</span>
                <span>{player.chips}</span>
              </div>
            </div>
          </div>

          {/* 当前下注（获胜时不再显示 bet，改为浮动 +$金额） */}
          {!isWinner && player.bet > 0 && (
            <motion.div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-warning/90 px-3 py-1 rounded-full text-xs font-bold shadow-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              ${player.bet}
            </motion.div>
          )}

          {/* 获胜浮动金额飘字 */}
          {isWinner && winAmount > 0 && (
            <motion.div
              className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-sm font-black shadow-[0_0_18px_-2px_rgba(250,204,21,0.9)]"
              initial={{ scale: 0, y: 10, opacity: 0 }}
              animate={{
                scale: [0, 1.15, 1],
                y: [10, -4, 0],
                opacity: 1,
              }}
              transition={{ duration: 0.6, type: 'spring', damping: 12 }}
            >
              +${winAmount.toLocaleString()}
            </motion.div>
          )}

          {/* All-in 标记 */}
          {isAllIn && !isWinner && (
            <motion.div
              className="absolute -top-8 left-1/2 -translate-x-1/2 bg-error px-3 py-1 rounded-full text-xs font-bold shadow-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              ALL IN
            </motion.div>
          )}
        </motion.div>

        {/* 玩家手牌 */}
        {player.cards.length > 0 && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1">
            {player.cards.map((card, index) => (
              <PokerCard
                key={index}
                card={card}
                faceDown={!showCards && player.type === 'ai'}
                size="small"
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
