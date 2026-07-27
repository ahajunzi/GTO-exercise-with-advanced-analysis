import { motion } from 'framer-motion';
import { Card } from '../../types';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../../constants';

interface PokerCardProps {
  card?: Card;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function PokerCard({ card, faceDown = false, size = 'medium', className = '' }: PokerCardProps) {
  const sizeClasses = {
    small: 'w-12 h-16',
    medium: 'w-16 h-24',
    large: 'w-20 h-28'
  };

  // 各尺寸下的角标数字与中央花色字号（精确控制，避免溢出）
  const rankTextClass = {
    small: 'text-[10px]',
    medium: 'text-sm',
    large: 'text-base',
  }[size];

  const suitTextClass = {
    small: 'text-lg',
    medium: 'text-2xl',
    large: 'text-3xl',
  }[size];

  const paddingClass = size === 'small' ? 'p-1' : 'p-1.5';

  if (!card || faceDown) {
    return (
      <motion.div
        className={`${sizeClasses[size]} ${className} bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 rounded-lg border-2 border-blue-700 flex items-center justify-center shadow-lg relative overflow-hidden`}
        whileHover={{ scale: 1.05, rotateY: 5 }}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
          }}></div>
        </div>
        <div className="text-blue-400 font-bold opacity-50 leading-none">?</div>
      </motion.div>
    );
  }

  const suitColor = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  return (
    <motion.div
      className={`${sizeClasses[size]} ${className} ${paddingClass} bg-white rounded-lg border-2 border-gray-300 flex flex-col items-stretch justify-between shadow-lg relative overflow-hidden`}
      style={{ color: suitColor }}
      whileHover={{ scale: 1.1, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {/* 左上角数字 */}
      <div className={`${rankTextClass} font-bold leading-none self-start`}>
        {card.rank}
      </div>

      {/* 中央花色 - 用 flex-1 自适应剩余空间，避免撑高 */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className={`${suitTextClass} leading-none`}>{suitSymbol}</span>
      </div>

      {/* 右下角数字（旋转 180°） */}
      <div className={`${rankTextClass} font-bold leading-none self-end rotate-180`}>
        {card.rank}
      </div>
    </motion.div>
  );
}
