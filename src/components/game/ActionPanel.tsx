import { useState } from 'react';
import { motion } from 'framer-motion';
import { ActionType, Player } from '../../types';
import { ACTION_NAMES } from '../../constants';

interface ActionPanelProps {
  player: Player;
  availableActions: ActionType[];
  minRaise: number;
  maxBet: number;
  pot: number; // 当前底池总额（含本轮已下注），用于计算按底池比例的加注
  onAction: (action: ActionType, amount?: number) => void;
}

export function ActionPanel({ player, availableActions, minRaise, maxBet, pot, onAction }: ActionPanelProps) {
  const [raiseAmount, setRaiseAmount] = useState(minRaise);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  const handleAction = (action: ActionType) => {
    if (action === 'raise') {
      setShowRaiseSlider(true);
    } else {
      onAction(action, action === 'call' ? maxBet - player.bet : 0);
    }
  };

  const handleRaise = () => {
    onAction('raise', raiseAmount);
    setShowRaiseSlider(false);
  };

  const callAmount = maxBet - player.bet;
  const canCheck = player.bet === maxBet;

  /**
   * 计算按底池比例的 raise 金额
   *
   * GameEngine 中 raise 的 amount 语义 = 玩家本次共计投入的筹码（增量）
   * 底池下注公式：总投入 = 跟注额 + fraction * (当前底池 + 跟注额)
   * 也就是“先把跟注那部分归入底池，再按 fraction 追加”
   */
  const calcPotBet = (fraction: number) => {
    const potAfterCall = pot + callAmount;
    const target = callAmount + Math.floor(fraction * potAfterCall);
    // 夹限到合法区间 [minRaise, player.chips]
    return Math.max(minRaise, Math.min(target, player.chips));
  };

  const buttonVariants = {
    hover: { scale: 1.04, y: -1 },
    tap: { scale: 0.96 }
  };

  const getActionButton = (action: ActionType) => {
    const baseClass = "px-5 py-2 rounded-md font-semibold text-sm transition-all shadow-md";

    switch (action) {
      case 'fold':
        return (
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => handleAction('fold')}
            className={`${baseClass} bg-gradient-to-r from-error to-red-600 hover:shadow-error/50`}
          >
            {ACTION_NAMES.fold}
          </motion.button>
        );

      case 'check':
        return canCheck && (
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => handleAction('check')}
            className={`${baseClass} bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-blue-500/50`}
          >
            {ACTION_NAMES.check}
          </motion.button>
        );

      case 'call':
        return !canCheck && (
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => handleAction('call')}
            className={`${baseClass} bg-gradient-to-r from-primary to-primary-600 hover:shadow-primary/50`}
          >
            {ACTION_NAMES.call} ${callAmount}
          </motion.button>
        );

      case 'raise':
        return (
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => handleAction('raise')}
            className={`${baseClass} bg-gradient-to-r from-warning to-amber-600 hover:shadow-warning/50`}
          >
            {ACTION_NAMES.raise}
          </motion.button>
        );

      case 'all-in':
        return (
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => handleAction('all-in')}
            className={`${baseClass} bg-gradient-to-r from-purple-500 to-purple-600 hover:shadow-purple-500/50 border border-purple-400`}
          >
            {ACTION_NAMES['all-in']} ${player.chips}
          </motion.button>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      className="w-full rounded-xl border border-amber-500/25 bg-background-dark/70 backdrop-blur-md px-3 md:px-4 py-2 md:py-2.5"
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {!showRaiseSlider ? (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
          {/* 左侧：玩家筹码/下注 - 紧凑单行 */}
          <div className="flex items-center gap-3 text-xs md:text-sm text-text-muted whitespace-nowrap font-mono">
            <span>筹码 <span className="text-warning font-bold">${player.chips}</span></span>
            <span className="opacity-40">|</span>
            <span>下注 <span className="text-primary font-bold">${player.bet}</span></span>
          </div>

          {/* 右侧：动作按钮 */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
            {availableActions.map(action => (
              <div key={action}>{getActionButton(action)}</div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* 加注金额显示 - 大号仪表读数 */}
          <div className="flex flex-col items-start whitespace-nowrap font-mono leading-none">
            <span className="text-sm text-cyan-400 uppercase tracking-[0.2em] font-bold">RAISE</span>
            <span
              className="text-3xl font-black text-amber-300 mt-1"
              style={{ textShadow: '0 0 10px rgba(245,158,11,0.7)' }}
            >
              ${raiseAmount}
            </span>
          </div>

          {/* 滑块容器 - 复古仪表条：底槽 + 填充条 + 扫描线 + 原生 range 覆盖 */}
          <div className="relative flex-1 h-8 flex items-center">
            {/* 底部凹槽 */}
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 rounded-sm overflow-hidden"
              style={{
                background: '#050e1f',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
              }}
            >
              {/* 填充条 */}
              <div
                className="h-full transition-all duration-100"
                style={{
                  width: `${((raiseAmount - minRaise) / Math.max(player.chips - minRaise, 1)) * 100}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
                  boxShadow: '0 0 12px rgba(245,158,11,0.7), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              />
              {/* CRT 扫描线 */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 6px)',
                }}
              />
            </div>
            {/* 原生 range 输入 - 透明覆盖用于拖拽 */}
            <input
              type="range"
              min={minRaise}
              max={player.chips}
              step={minRaise}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
              className="raise-slider absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent"
              style={{ WebkitAppearance: 'none' }}
            />
            <style>{`
              .raise-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 18px;
                height: 26px;
                border-radius: 3px;
                background: linear-gradient(180deg, #fbbf24, #d97706);
                border: 2px solid #451a03;
                box-shadow: 0 0 12px rgba(245,158,11,0.9), inset 0 1px 0 rgba(255,255,255,0.5);
                cursor: grab;
              }
              .raise-slider::-webkit-slider-thumb:active { cursor: grabbing; }
              .raise-slider::-moz-range-thumb {
                width: 18px;
                height: 26px;
                border-radius: 3px;
                background: linear-gradient(180deg, #fbbf24, #d97706);
                border: 2px solid #451a03;
                box-shadow: 0 0 12px rgba(245,158,11,0.9);
                cursor: grab;
              }
              .raise-slider::-webkit-slider-runnable-track { background: transparent; }
              .raise-slider::-moz-range-track { background: transparent; }
            `}</style>
          </div>

          {/* 快捷金额按钮 + 取消/确认 - 手机端换行 */}
          <div className="flex gap-1.5 md:gap-2 flex-wrap justify-end">
            {[
              { label: '1/2底', value: calcPotBet(0.5) },
              { label: '底池', value: calcPotBet(1.0) },
              { label: 'All-In', value: player.chips },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setRaiseAmount(value)}
                className="px-2 md:px-4 py-1.5 md:py-2 min-w-[54px] md:min-w-[64px] text-xs md:text-sm font-bold font-mono rounded-md transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(180deg, #14243d, #0a1a30)',
                  border: '1.5px solid rgba(245,158,11,0.5)',
                  color: '#fbbf24',
                  boxShadow:
                    '0 0 8px rgba(245,158,11,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
                  textShadow: '0 0 6px rgba(245,158,11,0.5)',
                }}
              >
                {label}
              </button>
            ))}

            {/* 取消/确认 - 手机端与快捷按钮同行换行 */}
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={() => setShowRaiseSlider(false)}
              className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gray-600 to-gray-700 rounded-md font-bold text-xs md:text-sm shadow-md"
            >
              取消
            </motion.button>
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={handleRaise}
              className="px-3 md:px-5 py-1.5 md:py-2 bg-gradient-to-r from-warning to-amber-600 rounded-md font-bold text-xs md:text-sm shadow-md hover:shadow-warning/50 whitespace-nowrap"
            >
              确认 ${raiseAmount}
            </motion.button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
