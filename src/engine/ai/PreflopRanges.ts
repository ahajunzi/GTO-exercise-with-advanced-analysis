/**
 * Preflop GTO 范围数据
 * 基于常见GTO策略简化版本
 */

export type PreflopAction = 'fold' | 'call' | 'raise' | 'all-in';
// 8 档位置：UTG(=前1) / UTG+1 / MP / MP+1 / HJ / CO / BTN / Blinds
// 兼容原来的 4 档语义
export type Position = 'early' | 'middle' | 'late' | 'blinds';

// 手牌强度分级
export enum HandTier {
  PREMIUM = 5,    // AA, KK, QQ, AKs
  STRONG = 4,     // JJ, TT, AQs, AKo
  GOOD = 3,       // 99-77, AJs, AQo, KQs
  PLAYABLE = 2,   // 小对子, 同花连牌
  MARGINAL = 1,   // 弱牌
  TRASH = 0       // 垃圾牌
}

interface PreflopStrategy {
  tier: HandTier;
  earlyPosition: PreflopAction;
  middlePosition: PreflopAction;
  latePosition: PreflopAction;
  blindsPosition: PreflopAction;
  raiseSize?: number; // 加注大小（以BB为单位）
}

// 手牌等级映射表
export class PreflopRanges {
  // 评估手牌等级
  static getHandTier(card1Rank: string, card2Rank: string, suited: boolean): HandTier {
    const rankValues: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };

    const val1 = rankValues[card1Rank];
    const val2 = rankValues[card2Rank];
    const isPair = val1 === val2;
    const high = Math.max(val1, val2);
    const low = Math.min(val1, val2);
    const gap = high - low;

    // ===== PREMIUM: AA, KK, QQ, AKs =====
    if (isPair && val1 >= 12) return HandTier.PREMIUM;
    if (high === 14 && low === 13 && suited) return HandTier.PREMIUM;

    // ===== STRONG: JJ, TT, AKo, AQs =====
    if (isPair && val1 >= 10) return HandTier.STRONG;
    if (high === 14 && low === 13) return HandTier.STRONG; // AKo
    if (high === 14 && low === 12 && suited) return HandTier.STRONG; // AQs
    if (high === 13 && low === 12 && suited) return HandTier.STRONG; // KQs

    // ===== GOOD: 99-77, AJs, ATs, AQo, KJs, KTs, QJs, QTs, JTs =====
    if (isPair && val1 >= 7) return HandTier.GOOD;
    if (high === 14 && low >= 10 && suited) return HandTier.GOOD; // AJs, ATs
    if (high === 14 && low === 12) return HandTier.GOOD;          // AQo
    if (high === 13 && low >= 10 && suited) return HandTier.GOOD; // KJs, KTs
    if (high === 12 && low >= 10 && suited) return HandTier.GOOD; // QJs, QTs
    if (high === 11 && low === 10 && suited) return HandTier.GOOD; // JTs

    // ===== PLAYABLE: 66-22, AJo, KQo, 各种同花连牌/A同花 =====
    if (isPair) return HandTier.PLAYABLE; // 22-66
    if (high === 14 && low === 11) return HandTier.PLAYABLE;      // AJo
    if (high === 13 && low === 12) return HandTier.PLAYABLE;      // KQo
    if (high === 14 && suited && low <= 9) return HandTier.PLAYABLE; // A9s-A2s（有 nut 潜力）
    if (suited && gap === 1 && high >= 7) return HandTier.PLAYABLE;  // 同花连牌 76s+
    if (suited && gap === 2 && high >= 9) return HandTier.PLAYABLE;  // 同花准连牌 T8s+
    if (high >= 12 && low >= 10) return HandTier.PLAYABLE;           // KJo, QJo, QTo

    // ===== MARGINAL: 弱同花连牌 / 高牌无 suited =====
    if (suited && gap <= 3 && high >= 8) return HandTier.MARGINAL;   // 同花有gap 85s+
    if (high >= 13 && low >= 9) return HandTier.MARGINAL;             // K9+
    if (high === 12 && low >= 9 && suited) return HandTier.MARGINAL; // Q9s
    if (high === 11 && low >= 9 && suited) return HandTier.MARGINAL; // J9s

    return HandTier.TRASH;
  }

  // 根据位置和手牌等级获取GTO建议
  static getGTOAction(
    tier: HandTier,
    position: Position,
    facingRaise: boolean,
    potSize: number,
    bigBlind: number,
    isInBlind: boolean = false,
    callAmount: number = 0,
    bb: number = 0
  ): { action: PreflopAction; raiseSize?: number; confidence: number } {
    
    // **盲注位特殊处理：已投入筹码，底池赔率好**
    if (isInBlind && callAmount > 0) {
      // 如果底池赔率很好（跟注金额小），放宽范围但不至于什么都玩
      if (callAmount <= bb * 2) {
        // 面对 limp 或最小加注，边缘及以上可 call
        if (tier >= HandTier.MARGINAL) {
          return { action: 'call', confidence: 0.70 };
        }
        // 垃圾牌仍然弃 —— 好赔率≠自动跟
        return { action: 'fold', confidence: 0.55 };
      } else if (callAmount <= bb * 4) {
        // 面对中等加注，只玩 playable 以上
        if (tier >= HandTier.PLAYABLE) {
          return { action: 'call', confidence: 0.65 };
        }
        return { action: 'fold', confidence: 0.70 };
      }
    }
    
    // 面对加注时的策略
    if (facingRaise) {
      return this.getFacingRaiseStrategy(tier, position);
    }

    // 开局策略（无人加注）
    return this.getOpeningStrategy(tier, position, bigBlind);
  }

  // 开局策略
  private static getOpeningStrategy(
    tier: HandTier,
    position: Position,
    bigBlind: number
  ): { action: PreflopAction; raiseSize?: number; confidence: number } {
    
    // 位置化 GTO 开局范围（参照真实 GTO Solver 建议，8-max 6-max 通用）
    // early: UTG/UTG+1 — 极紧（~12% VPIP）
    // middle: MP — 稍宽（~16% VPIP）
    // late: CO/BTN — 明显更宽（~25-30% VPIP）
    // blinds: SB/BB —— open 场景，SB 通常 raise 或 fold，BB 少开
    const strategies: Record<Position, Record<HandTier, { action: PreflopAction; raiseSize?: number; confidence: number }>> = {
      early: {
        [HandTier.PREMIUM]: { action: 'raise', raiseSize: 3, confidence: 0.95 },
        [HandTier.STRONG]: { action: 'raise', raiseSize: 2.8, confidence: 0.90 },
        [HandTier.GOOD]: { action: 'raise', raiseSize: 2.5, confidence: 0.75 },
        [HandTier.PLAYABLE]: { action: 'fold', confidence: 0.55 },    // 前位太松就漏钱
        [HandTier.MARGINAL]: { action: 'fold', confidence: 0.75 },
        [HandTier.TRASH]: { action: 'fold', confidence: 0.95 }
      },
      middle: {
        [HandTier.PREMIUM]: { action: 'raise', raiseSize: 3, confidence: 0.95 },
        [HandTier.STRONG]: { action: 'raise', raiseSize: 2.5, confidence: 0.90 },
        [HandTier.GOOD]: { action: 'raise', raiseSize: 2.5, confidence: 0.80 },
        [HandTier.PLAYABLE]: { action: 'raise', raiseSize: 2.3, confidence: 0.55 },
        [HandTier.MARGINAL]: { action: 'fold', confidence: 0.60 },
        [HandTier.TRASH]: { action: 'fold', confidence: 0.90 }
      },
      late: {
        [HandTier.PREMIUM]: { action: 'raise', raiseSize: 2.5, confidence: 0.95 },
        [HandTier.STRONG]: { action: 'raise', raiseSize: 2.5, confidence: 0.90 },
        [HandTier.GOOD]: { action: 'raise', raiseSize: 2.3, confidence: 0.85 },
        [HandTier.PLAYABLE]: { action: 'raise', raiseSize: 2.3, confidence: 0.70 },
        [HandTier.MARGINAL]: { action: 'raise', raiseSize: 2.3, confidence: 0.45 },
        [HandTier.TRASH]: { action: 'fold', confidence: 0.75 }    // BTN 也不能什么都玩
      },
      blinds: {
        [HandTier.PREMIUM]: { action: 'raise', raiseSize: 3, confidence: 0.95 },
        [HandTier.STRONG]: { action: 'raise', raiseSize: 3, confidence: 0.90 },
        [HandTier.GOOD]: { action: 'raise', raiseSize: 2.8, confidence: 0.75 },
        [HandTier.PLAYABLE]: { action: 'call', confidence: 0.55 },   // BB limp/complete
        [HandTier.MARGINAL]: { action: 'fold', confidence: 0.55 },
        [HandTier.TRASH]: { action: 'fold', confidence: 0.85 }
      }
    };

    const strategy = strategies[position][tier];
    
    // 如果有加注大小，转换为实际筹码数
    if (strategy.raiseSize) {
      return {
        ...strategy,
        raiseSize: strategy.raiseSize * bigBlind
      };
    }

    return strategy;
  }

  // 面对加注的策略
  private static getFacingRaiseStrategy(
    tier: HandTier,
    position: Position
  ): { action: PreflopAction; raiseSize?: number; confidence: number } {
    
    // 面对加注（3-bet 场景）：只有强牌能玩，垃圾/边缘牌坚决弃
    switch (tier) {
      case HandTier.PREMIUM:
        return { action: 'raise', confidence: 0.95 }; // 4-bet or 3-bet
      case HandTier.STRONG:
        // JJ/TT/AKo/AQs 后位 3-bet，前位 call
        if (position === 'late' || position === 'blinds') {
          return { action: 'raise', confidence: 0.75 };
        }
        return { action: 'call', confidence: 0.80 };
      case HandTier.GOOD:
        return { action: 'call', confidence: 0.65 };  // 主要跟注看翻牌
      case HandTier.PLAYABLE:
        // 只有位置好且有隐含赔率才跟
        if (position === 'late') {
          return { action: 'call', confidence: 0.50 };
        }
        return { action: 'fold', confidence: 0.60 };
      case HandTier.MARGINAL:
        return { action: 'fold', confidence: 0.80 };
      default:
        // 垃圾牌任何位置都弃
        return { action: 'fold', confidence: 0.95 };
    }
  }

  // 获取位置分类（更符合真实牌桌）
  static getPositionType(playerPosition: number, totalPlayers: number, dealerIndex: number): Position {
    // 相对于按钮的位置：0 = SB, 1 = BB, 2 = UTG, ..., totalPlayers-1 = BTN
    const seatsFromDealer = (playerPosition - dealerIndex + totalPlayers) % totalPlayers;
    
    // 盲注（SB=0 & BB=1）
    if (seatsFromDealer <= 1) return 'blinds';
    
    // BTN（最后一位）+ CO（倒数第二位）都算 late
    if (seatsFromDealer >= totalPlayers - 2) return 'late';
    
    // 剩下的按前后一半分：前半段 early，后半段 middle
    const relativeFromUTG = seatsFromDealer - 2;         // UTG = 0
    const utgToBtn = totalPlayers - 4;                    // UTG..(CO-1) 的可用槽位数
    if (utgToBtn <= 0) return 'middle';
    
    // 前 40% 算 early（≤3 人时 UTG 就算 early），其余算 middle
    if (relativeFromUTG < Math.max(1, Math.floor(utgToBtn * 0.4))) return 'early';
    return 'middle';
  }
}
