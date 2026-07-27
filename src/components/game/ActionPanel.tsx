import { useState } from 'react';
import { motion } from 'framer-motion';
import { ActionType, Player } from '../../types';
import { ACTION_NAMES } from '../../constants';

interface ActionPanelProps {
  player: Player;
  availableActions: ActionType[];
  minRaise: number;
  maxBet: number;
  onAction: (action: ActionType, amount?: number) => void;
}

export function ActionPanel({ player, availableActions, minRaise, maxBet, onAction }: ActionPanelProps) {
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
      className="w-full rounded-xl border border-amber-500/25 bg-background-dark/70 backdrop-blur-md px-4 py-2.5"
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {!showRaiseSlider ? (
        <div className="flex items-center justify-between gap-3">
          {/* 左侧：玩家筹码/下注 - 紧凑单行 */}
          <div className="flex items-center gap-3 text-xs text-text-muted whitespace-nowrap font-mono">
            <span>筹码 <span className="text-warning font-bold">${player.chips}</span></span>
            <span className="opacity-40">|</span>
            <span>下注 <span className="text-primary font-bold">${player.bet}</span></span>
          </div>

          {/* 右侧：动作按钮 */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {availableActions.map(action => (
              <div key={action}>{getActionButton(action)}</div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* 加注金额显示 */}
          <div className="flex items-center gap-2 whitespace-nowrap font-mono">
            <span className="text-xs text-text-muted">加注</span>
            <span className="text-lg font-black text-warning">${raiseAmount}</span>
          </div>

          {/* 滑块 - 占满剩余空间 */}
          <input
            type="range"
            min={minRaise}
            max={player.chips}
            step={minRaise}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
            className="flex-1 h-2 bg-background-dark rounded-lg appearance-none cursor-pointer accent-warning"
          />

          {/* 快捷金额按钮 */}
          <div className="flex gap-1">
            {[
              { label: '1/2', value: Math.min(Math.floor(maxBet / 2), player.chips) },
              { label: '池', value: Math.min(maxBet, player.chips) },
              { label: 'All', value: player.chips },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setRaiseAmount(value)}
                className="px-2 py-1 bg-background-dark hover:bg-background text-xs rounded border border-white/10 hover:border-warning/50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* 取消/确认 */}
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => setShowRaiseSlider(false)}
            className="px-3 py-1.5 bg-gradient-to-r from-gray-600 to-gray-700 rounded-md font-semibold text-xs shadow-md"
          >
            取消
          </motion.button>
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={handleRaise}
            className="px-3 py-1.5 bg-gradient-to-r from-warning to-amber-600 rounded-md font-semibold text-xs shadow-md hover:shadow-warning/50"
          >
            确认 ${raiseAmount}
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
