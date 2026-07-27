import { motion } from 'framer-motion';
import { GameState } from '../../types';
import { PlayerSeat } from '../common/PlayerSeat';
import { PokerCard } from '../common/PokerCard';

interface PokerTableProps {
  gameState: GameState;
}

export function PokerTable({ gameState }: PokerTableProps) {
  const { players, board, pots, phase } = gameState;

  // 计算玩家座位位置（椭圆排列）
  // 半径收窄：让座位更靠中心，手牌不会溢出到桌沿之外
  const getPlayerPosition = (index: number, total: number) => {
    const angle = (index * 360 / total) - 90;
    const radiusX = 38;
    const radiusY = 28;
    const x = 50 + radiusX * Math.cos(angle * Math.PI / 180);
    const y = 50 + radiusY * Math.sin(angle * Math.PI / 180);
    return { x, y };
  };

  const potAmount = pots.reduce((sum, pot) => sum + pot.amount, 0);
  const currentBets = players.reduce((sum, p) => sum + p.bet, 0);
  const totalPot = potAmount + currentBets;

  // 装饰用漂浮粒子（琥珀色 + 青色数据流）
  const particles = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    left: (i * 83) % 100,
    delay: (i * 0.7) % 6,
    duration: 8 + (i % 3) * 2,
    color: i % 2 === 0 ? '#f59e0b' : '#22d3ee',
  }));

  return (
    <div className="relative w-full flex items-center justify-center py-6">
      {/* 扑克桌容器 - 不裁切，让座位手牌可以溢出桌沿 */}
      <div className="relative w-full aspect-[16/10]">
        {/* 外层扫描光晕 */}
        <div className="absolute -inset-8 -z-10 rounded-[5rem] bg-gradient-to-br from-amber-500/15 via-cyan-500/10 to-amber-500/15 blur-3xl" />

        {/* 桌面视觉层 - 独立裁切，不影响座位 */}
        <div
          className="absolute inset-0 rounded-[3.5rem] overflow-hidden pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 100% at 50% 0%, #1a2c47 0%, #0f1e35 40%, #08132a 100%)',
            border: '10px solid',
            borderColor: '#3d2a14',
            boxShadow:
              '0 30px 80px -20px rgba(0,0,0,0.85), inset 0 0 60px rgba(245,158,11,0.12), inset 0 0 0 3px rgba(245,158,11,0.25)',
          }}
        >
          {/* 复古六边形网格背景 */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: `
                linear-gradient(30deg, rgba(245,158,11,0.15) 12%, transparent 12.5%, transparent 87%, rgba(245,158,11,0.15) 87.5%),
                linear-gradient(150deg, rgba(245,158,11,0.15) 12%, transparent 12.5%, transparent 87%, rgba(245,158,11,0.15) 87.5%),
                linear-gradient(90deg, rgba(34,211,238,0.08) 12%, transparent 12.5%, transparent 87%, rgba(34,211,238,0.08) 87.5%)
              `,
              backgroundSize: '48px 84px',
            }}
          />

          {/* CRT 扫描线覆盖 */}
          <div
            className="absolute inset-0 opacity-20 mix-blend-overlay"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)',
            }}
          />

          {/* 屏幕曲面暗角 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
            }}
          />

          {/* 顶部霓虹光条 */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-500/25 via-amber-500/5 to-transparent" />
          {/* 底部青色霓虹光条 */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cyan-500/20 via-cyan-500/5 to-transparent" />

          {/* 漂浮数据粒子 */}
          <div className="absolute inset-0 overflow-hidden">
            {particles.map((p) => (
              <motion.span
                key={p.id}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  left: `${p.left}%`,
                  top: '110%',
                  background: p.color,
                  boxShadow: `0 0 8px 2px ${p.color}`,
                }}
                animate={{
                  y: ['0%', '-1400%'],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            ))}
          </div>

          {/* 内圈椭圆 - 双层霓虹描边 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[74%] h-[70%] rounded-[50%]">
            {/* 外描边（琥珀） */}
            <div
              className="absolute inset-0 rounded-[50%]"
              style={{
                border: '2px solid rgba(245,158,11,0.55)',
                boxShadow:
                  '0 0 20px rgba(245,158,11,0.35), inset 0 0 30px rgba(245,158,11,0.15)',
              }}
            />
            {/* 内描边（青） */}
            <div
              className="absolute inset-4 rounded-[50%]"
              style={{
                border: '1px dashed rgba(34,211,238,0.45)',
              }}
            />
            {/* 四方位刻度标签（复古仪表） */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 text-[10px] font-mono font-bold tracking-widest text-amber-400/80 bg-[#0f1e35]">
              ▲ N
            </span>
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 text-[10px] font-mono font-bold tracking-widest text-amber-400/80 bg-[#0f1e35]">
              ▼ S
            </span>
            <span className="absolute top-1/2 -left-3 -translate-y-1/2 px-2 text-[10px] font-mono font-bold tracking-widest text-cyan-400/80 bg-[#0f1e35]">
              ◀ W
            </span>
            <span className="absolute top-1/2 -right-3 -translate-y-1/2 px-2 text-[10px] font-mono font-bold tracking-widest text-cyan-400/80 bg-[#0f1e35]">
              E ▶
            </span>
          </div>

          {/* 桌角复古螺丝钉装饰 */}
          {[
            'top-3 left-3',
            'top-3 right-3',
            'bottom-3 left-3',
            'bottom-3 right-3',
          ].map((pos) => (
            <div
              key={pos}
              className={`absolute ${pos} w-3 h-3 rounded-full`}
              style={{
                background: 'radial-gradient(circle at 30% 30%, #f59e0b, #92400e 60%, #451a03)',
                boxShadow:
                  'inset 0 1px 2px rgba(0,0,0,0.6), 0 0 6px rgba(245,158,11,0.4)',
              }}
            />
          ))}
        </div>

        {/* === 以下内容不在裁切层内，可以自由溢出桌沿 === */}

        {/* 中央区域 - 公共牌和底池 */}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-10">
          
          {/* 摊牌阶段：结算面板 */}
          {phase === 'showdown' && gameState.showdownResults ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="px-6 py-3 rounded-2xl flex items-center gap-5 min-w-max"
              style={{
                background: 'linear-gradient(135deg, rgba(15,30,53,0.95), rgba(8,19,42,0.95))',
                border: '2px solid rgba(245,158,11,0.6)',
                boxShadow:
                  '0 0 40px rgba(245,158,11,0.35), inset 0 1px 0 rgba(245,158,11,0.3)',
              }}
            >
              {(() => {
                const winners = gameState.showdownResults.filter((r) => r.isWinner);
                const totalWinnings = winners.reduce((sum, w) => sum + w.winAmount, 0);
                return (
                  <div className="flex items-center gap-3 pr-4 border-r border-amber-500/30">
                    <div className="text-3xl">🏆</div>
                    <div>
                      <div className="text-sm font-black text-amber-300 leading-tight tracking-wider font-mono">
                        {winners.length > 1 ? 'SPLIT POT' : winners[0]?.player.name}
                      </div>
                      <div className="text-xs text-amber-500 font-bold font-mono">
                        + ${totalWinnings.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                {gameState.showdownResults.map((result) => (
                  <div
                    key={result.player.id}
                    className={`flex flex-col items-center px-2.5 py-1 rounded-md min-w-[64px] font-mono ${
                      result.isWinner
                        ? 'bg-amber-500/15 ring-1 ring-amber-400/60'
                        : 'bg-white/5 ring-1 ring-white/10'
                    }`}
                  >
                    <span className="text-[10px] text-gray-300 truncate max-w-[54px]">
                      {result.player.name}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        result.isWinner ? 'text-amber-400' : 'text-gray-500'
                      }`}
                    >
                      {result.isWinner ? `+$${result.winAmount}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* 非摊牌：复古仪表盘底池 */
            <motion.div
              className="relative flex items-center gap-4 px-6 py-2.5 rounded-xl"
              style={{
                background:
                  'linear-gradient(180deg, #14243d 0%, #0a1a30 100%)',
                border: '2px solid rgba(245,158,11,0.55)',
                boxShadow:
                  '0 0 25px rgba(245,158,11,0.35), inset 0 1px 0 rgba(245,158,11,0.25), inset 0 -1px 0 rgba(0,0,0,0.4)',
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              layout
            >
              {/* 左侧仪表灯 */}
              <motion.span
                className="w-2.5 h-2.5 rounded-full bg-amber-400"
                style={{ boxShadow: '0 0 10px 2px rgba(245,158,11,0.9)' }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <div className="flex flex-col items-start leading-none gap-1">
                <span className="text-[10px] text-cyan-400 uppercase tracking-[0.25em] font-mono font-bold">
                  POT
                </span>
                <span
                  className="text-2xl font-black font-mono text-amber-300"
                  style={{ textShadow: '0 0 12px rgba(245,158,11,0.7)' }}
                >
                  ${totalPot.toLocaleString()}
                </span>
              </div>
              {/* 右侧仪表灯 */}
              <motion.span
                className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                style={{ boxShadow: '0 0 10px 2px rgba(34,211,238,0.9)' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
          )}

          {/* 公共牌 - 复古金属托盘 */}
          {board.length > 0 && (
            <motion.div
              className="flex gap-2 p-3 rounded-2xl"
              style={{
                background:
                  'linear-gradient(180deg, rgba(20,36,61,0.6), rgba(8,19,42,0.6))',
                border: '1px solid rgba(245,158,11,0.35)',
                boxShadow:
                  'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(245,158,11,0.15)',
              }}
              layout
            >
              {board.map((card, index) => (
                <motion.div
                  key={index}
                  initial={{ rotateY: 180, opacity: 0, y: -10 }}
                  animate={{ rotateY: 0, opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1, duration: 0.4, type: 'spring' }}
                >
                  <PokerCard card={card} size="large" />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* 游戏阶段指示器 - 复古 LED 标签 */}
          {phase !== 'showdown' && board.length > 0 && (
            <motion.div
              className="text-[11px] font-mono font-black tracking-[0.35em] px-4 py-1 rounded-sm text-amber-300"
              style={{
                background: 'linear-gradient(180deg, #14243d, #08132a)',
                border: '1px solid rgba(245,158,11,0.5)',
                boxShadow: '0 0 12px rgba(245,158,11,0.4), inset 0 0 8px rgba(245,158,11,0.15)',
                textShadow: '0 0 8px rgba(245,158,11,0.8)',
              }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {phase === 'flop' && '◆ FLOP ◆'}
              {phase === 'turn' && '◆ TURN ◆'}
              {phase === 'river' && '◆ RIVER ◆'}
            </motion.div>
          )}
        </div>

        {/* 玩家座位 - 在裁切层外，手牌可自由溢出 */}
        {players.map((player, index) => {
          const position = getPlayerPosition(index, players.length);
          const isCurrentPlayer = index === gameState.currentPlayerIndex;
          const isHuman = player.type === 'human';

          const result =
            phase === 'showdown' && gameState.showdownResults
              ? gameState.showdownResults.find((r) => r.player.id === player.id)
              : undefined;

          return (
            <PlayerSeat
              key={player.id}
              player={player}
              isCurrentPlayer={isCurrentPlayer && phase !== 'showdown'}
              showCards={isHuman || phase === 'showdown'}
              position={position}
              isWinner={!!result?.isWinner}
              winAmount={result?.winAmount ?? 0}
              handName={result?.hand?.name}
            />
          );
        })}

        {/* 外发光 */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/20 via-cyan-500/10 to-amber-500/20 blur-3xl rounded-[4rem]" />
      </div>
    </div>
  );
}
