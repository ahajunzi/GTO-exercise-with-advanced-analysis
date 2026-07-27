import { motion } from 'framer-motion';
import { Player } from '../../types';
import { PokerCard } from './PokerCard';
import { getStyleDisplayName } from '../../types/aiStyle';

interface PlayerSeatProps {
  player: Player;
  isCurrentPlayer?: boolean;
  showCards?: boolean;
  position: { x: number; y: number };
  isWinner?: boolean;
  winAmount?: number;
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

  // 卡片主色调 - 科技复古双色系（琥珀 / 青 / 蓝灰）
  const cardStyle = isWinner
    ? {
        background:
          'linear-gradient(160deg, #1a1508 0%, #2a1f0a 50%, #1a1508 100%)',
        border: '2px solid #f59e0b',
        boxShadow:
          '0 8px 24px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(245,158,11,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
      }
    : isCurrentPlayer
      ? {
          background:
            'linear-gradient(160deg, #0a1f2c 0%, #082130 50%, #0a1f2c 100%)',
          border: '2px solid #22d3ee',
          boxShadow:
            '0 8px 24px -4px rgba(34,211,238,0.55), inset 0 1px 0 rgba(34,211,238,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
        }
      : player.type === 'human'
        ? {
            background:
              'linear-gradient(160deg, #0f2138 0%, #0a1a30 100%)',
            border: '2px solid rgba(34,211,238,0.35)',
            boxShadow:
              '0 4px 12px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.15)',
          }
        : {
            background:
              'linear-gradient(160deg, #1c1811 0%, #14100a 100%)',
            border: '2px solid rgba(245,158,11,0.35)',
            boxShadow:
              '0 4px 12px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(245,158,11,0.15)',
          };

  const isHuman = player.type === 'human';

  return (
    <div
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <motion.div
        className={`relative ${isCurrentPlayer || isWinner ? 'z-20' : 'z-0'}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* 玩家信息卡片 - 复古仪表盘 */}
        <motion.div
          className={`relative rounded-xl p-3 min-w-[160px] font-mono ${
            isFolded && !isWinner ? 'opacity-45 grayscale' : ''
          }`}
          style={cardStyle}
          animate={
            isWinner
              ? {
                  boxShadow: [
                    '0 8px 24px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(245,158,11,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    '0 10px 34px -2px rgba(245,158,11,0.95), inset 0 1px 0 rgba(245,158,11,0.6), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    '0 8px 24px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(245,158,11,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
                  ],
                  scale: [1, 1.06, 1],
                }
              : isCurrentPlayer
                ? {
                    boxShadow: [
                      '0 8px 24px -4px rgba(34,211,238,0.55), inset 0 1px 0 rgba(34,211,238,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
                      '0 10px 28px -2px rgba(34,211,238,0.85), inset 0 1px 0 rgba(34,211,238,0.6), inset 0 -1px 0 rgba(0,0,0,0.5)',
                      '0 8px 24px -4px rgba(34,211,238,0.55), inset 0 1px 0 rgba(34,211,238,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    ],
                  }
                : {}
          }
          transition={{ duration: isWinner ? 1.2 : 1.5, repeat: Infinity }}
        >
          {/* 卡片右上角状态指示灯 */}
          {!isWinner && (
            <motion.span
              className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
              style={{
                background: isCurrentPlayer ? '#22d3ee' : isHuman ? '#22d3ee' : '#f59e0b',
                boxShadow: `0 0 6px ${isCurrentPlayer || isHuman ? 'rgba(34,211,238,0.9)' : 'rgba(245,158,11,0.9)'}`,
              }}
              animate={isCurrentPlayer ? { opacity: [1, 0.3, 1] } : { opacity: [0.7, 1, 0.7] }}
              transition={{ duration: isCurrentPlayer ? 1 : 2.5, repeat: Infinity }}
            />
          )}

          {/* 获胜者：顶部王冠 + 光环 */}
          {isWinner && (
            <>
              <motion.div
                initial={{ y: -6, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 260 }}
                className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-3xl drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]"
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
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_2px_rgba(245,158,11,0.9)]"
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* 状态指示器（复古仪表徽章）*/}
          {!isWinner && (player.isDealer || player.isSmallBlind || player.isBigBlind) && (
            <div className="absolute -top-2 -right-2 flex gap-1">
              {player.isDealer && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-amber-100 border-2"
                  style={{
                    background: 'linear-gradient(180deg, #f59e0b, #92400e)',
                    borderColor: '#78350f',
                    boxShadow: '0 0 8px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
                  }}
                >
                  D
                </div>
              )}
              {player.isSmallBlind && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-cyan-50 border-2"
                  style={{
                    background: 'linear-gradient(180deg, #22d3ee, #0e7490)',
                    borderColor: '#155e75',
                    boxShadow: '0 0 8px rgba(34,211,238,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
                  }}
                >
                  SB
                </div>
              )}
              {player.isBigBlind && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-red-50 border-2"
                  style={{
                    background: 'linear-gradient(180deg, #ef4444, #991b1b)',
                    borderColor: '#7f1d1d',
                    boxShadow: '0 0 8px rgba(239,68,68,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
                  }}
                >
                  BB
                </div>
              )}
            </div>
          )}

          {/* 玩家头像 */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="relative w-12 h-12 rounded-lg flex items-center justify-center text-lg font-black border-2 shrink-0"
              style={
                isWinner
                  ? {
                      background: 'linear-gradient(160deg, #f59e0b, #92400e)',
                      color: '#fff7ed',
                      borderColor: '#fbbf24',
                      boxShadow: '0 0 12px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
                    }
                  : isHuman
                    ? {
                        background: 'linear-gradient(160deg, #22d3ee, #0e7490)',
                        color: '#ecfeff',
                        borderColor: '#67e8f9',
                        boxShadow: '0 0 8px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                      }
                    : {
                        background: 'linear-gradient(160deg, #64748b, #334155)',
                        color: '#f1f5f9',
                        borderColor: '#94a3b8',
                        boxShadow: '0 0 6px rgba(148,163,184,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                      }
              }
            >
              {player.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="font-black text-sm truncate tracking-wide"
                style={{
                  color: isWinner ? '#fbbf24' : isCurrentPlayer ? '#67e8f9' : isHuman ? '#e0f2fe' : '#fef3c7',
                  textShadow: isWinner
                    ? '0 0 8px rgba(245,158,11,0.6)'
                    : isCurrentPlayer
                      ? '0 0 8px rgba(34,211,238,0.6)'
                      : 'none',
                }}
              >
                {player.name}
              </div>
              {/* AI风格标签 或 牌型名 */}
              {isWinner && handName ? (
                <div className="text-[10px] font-bold text-amber-400 mb-0.5 truncate tracking-wider">
                  ★ {handName}
                </div>
              ) : player.type === 'ai' && player.aiStyle ? (
                <div className="text-[10px] text-amber-500/80 mb-0.5 font-semibold tracking-wider truncate">
                  {getStyleDisplayName(player.aiStyle)}
                </div>
              ) : null}
              <div className="flex items-center gap-1 text-xs font-black text-amber-400">
                <span>🪙</span>
                <span style={{ textShadow: '0 0 6px rgba(245,158,11,0.5)' }}>
                  {player.chips.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 当前下注 - 复古 LED 标签 */}
          {!isWinner && player.bet > 0 && (
            <motion.div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-sm text-xs font-black font-mono tracking-wider"
              style={{
                background: 'linear-gradient(180deg, #14243d, #08132a)',
                color: '#fbbf24',
                border: '1px solid rgba(245,158,11,0.6)',
                boxShadow:
                  '0 0 10px rgba(245,158,11,0.4), inset 0 0 6px rgba(245,158,11,0.15)',
                textShadow: '0 0 6px rgba(245,158,11,0.7)',
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              ▸ ${player.bet.toLocaleString()}
            </motion.div>
          )}

          {/* 获胜浮动金额 */}
          {isWinner && winAmount > 0 && (
            <motion.div
              className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-sm text-sm font-black font-mono"
              style={{
                background: 'linear-gradient(180deg, #f59e0b, #b45309)',
                color: '#1a1508',
                border: '2px solid #fbbf24',
                boxShadow: '0 0 20px rgba(245,158,11,0.9), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
              initial={{ scale: 0, y: 10, opacity: 0 }}
              animate={{ scale: [0, 1.15, 1], y: [10, -4, 0], opacity: 1 }}
              transition={{ duration: 0.6, type: 'spring', damping: 12 }}
            >
              ★ +${winAmount.toLocaleString()}
            </motion.div>
          )}

          {/* All-in 标记 */}
          {isAllIn && !isWinner && (
            <motion.div
              className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-sm text-xs font-black font-mono tracking-widest"
              style={{
                background: 'linear-gradient(180deg, #ef4444, #7f1d1d)',
                color: '#fef2f2',
                border: '2px solid #dc2626',
                boxShadow: '0 0 12px rgba(239,68,68,0.7), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ▲ ALL IN
            </motion.div>
          )}

          {/* Folded 遮罩 */}
          {isFolded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl">
              <span
                className="text-[10px] font-black font-mono tracking-widest px-2 py-0.5 rounded-sm"
                style={{
                  background: 'rgba(15,30,53,0.9)',
                  color: '#94a3b8',
                  border: '1px solid rgba(148,163,184,0.4)',
                }}
              >
                ✕ FOLD
              </span>
            </div>
          )}
        </motion.div>

        {/* 玩家手牌 */}
        {player.cards.length > 0 && (
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex gap-1">
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

      <span className="sr-only">{isActive ? 'active' : 'idle'}</span>
    </div>
  );
}
