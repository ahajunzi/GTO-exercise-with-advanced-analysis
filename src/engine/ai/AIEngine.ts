import { Player, GameState, AIDecision, ActionType, AIDifficulty, Card } from '../../types';
import { AI_DIFFICULTY_CONFIG } from '../../constants';
import { evaluateHand } from '../../utils/handEvaluator';
import { PreflopRanges, HandTier } from './PreflopRanges';
import { AI_STYLES } from '../../types/aiStyle';
import { opponentModel, OpponentProfile } from '../gto/OpponentModel';

/**
 * 概率决策分布
 * 三个动作的相对权重（会被归一化），基于风格 + 牌力 + 底池赔率计算得到
 */
interface ActionMix {
  fold: number;
  call: number; // 也代表 check
  raise: number;
}

/**
 * 牌面纹理分析
 * 用于判断诈唬机会：干燥牌面（disconnected/rainbow）诈唬更成功
 */
interface BoardTexture {
  wetness: number;          // 0=极干, 1=极湿
  paired: boolean;          // 牌面配对
  monotone: boolean;        // 三张同花色
  twoTone: boolean;         // 两张同花色（存在同花听牌威胁）
  connected: boolean;       // 连张（顺子威胁）
  highCard: number;         // 最大牌rank数值（用于判断A/K高牌）
  hasAce: boolean;
  hasKing: boolean;
}

/**
 * 本手行动上下文
 * 用于识别 c-bet 机会、check-line 诈唬、代表牌力叙事等
 */
interface HandContext {
  preflopAggressor: string | null;   // 翻牌前最后加注者ID
  lastStreetAggressor: string | null; // 上一街最后加注者ID
  amIPreflopAggressor: boolean;      // 我是否是preflop加注者
  amILastAggressor: boolean;         // 我是否是上一街的加注者
  everyoneCheckedToMe: boolean;      // 之前所有人都过牌到我
  facedBetThisStreet: boolean;       // 本街是否面对下注
  betSizeRatio: number;              // 面对下注 / 底池 比例（0=无下注）
  numOpponents: number;              // 剩余活跃对手数
}

export class AIEngine {
  // 获取AI决策
  static getDecision(player: Player, gameState: GameState): AIDecision {
    if (!player.difficulty) {
      return { action: 'fold', amount: 0, confidence: 0 };
    }

    const config = AI_DIFFICULTY_CONFIG[player.difficulty];
    const styleConfig = player.aiStyle ? AI_STYLES[player.aiStyle] : AI_STYLES.TAG;
    
    // Preflop阶段使用GTO策略
    if (gameState.phase === 'preflop') {
      return this.getPreflopDecision(player, gameState, config);
    }

    // Postflop 使用基于概率分布的决策
    return this.getPostflopDecision(player, gameState, styleConfig, config);
  }

  // ================================================================
  // Preflop 决策
  // ================================================================

  // Preflop GTO决策
  private static getPreflopDecision(
    player: Player,
    gameState: GameState,
    config: typeof AI_DIFFICULTY_CONFIG.easy
  ): AIDecision {
    const [card1, card2] = player.cards;
    const suited = card1.suit === card2.suit;
    
    // 获取手牌等级
    const tier = PreflopRanges.getHandTier(card1.rank, card2.rank, suited);
    
    // 获取位置
    const position = PreflopRanges.getPositionType(
      player.position,
      gameState.players.length,
      gameState.dealerIndex
    );
    
    // 检查是否面对加注
    const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
    const facingRaise = maxBet > gameState.bigBlind;
    
    // 是否是盲注位且已投入筹码
    const isInBlind = player.bet > 0;
    const callAmount = maxBet - player.bet;
    const potSize = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);
    
    // 获取GTO建议
    const gtoSuggestion = PreflopRanges.getGTOAction(
      tier,
      position,
      facingRaise,
      potSize,
      gameState.bigBlind,
      isInBlind,
      callAmount,
      gameState.bigBlind
    );

    // 获取AI风格配置
    const styleConfig = player.aiStyle ? AI_STYLES[player.aiStyle] : AI_STYLES.TAG;
    
    // === 新逻辑：用概率分布替代硬性覆盖 ===
    const mix = this.buildPreflopMix(
      gtoSuggestion.action,
      tier,
      position,
      styleConfig,
      facingRaise,
      isInBlind,
      callAmount,
      gameState.bigBlind,
      potSize
    );
    
    // 翻前对手剥削：接入对手画像调整
    const exploitedMix = this.applyPreflopOpponentExploits(
      mix,
      player,
      gameState,
      tier,
      facingRaise,
      callAmount
    );
    
    // 难度控制：低难度玩家决策更随机（gtoAdherence 越低，越接近均匀分布）
    const finalMix = this.applyDifficultyToMix(exploitedMix, config.gtoAdherence, tier);
    
    // 从分布中采样得到最终动作
    let action: ActionType = this.sampleAction(finalMix);
    let amount = 0;
    const confidence = gtoSuggestion.confidence;

    // 计算具体金额
    if (action === 'raise') {
      const raiseSize = gtoSuggestion.raiseSize || gameState.bigBlind * 2.5;
      const sizeMultiplier = 0.8 + (styleConfig.aggression / 3) * 0.4; // 0.8-1.2
      amount = Math.round(Math.min(
        Math.max(raiseSize * sizeMultiplier, gameState.minRaise),
        player.chips
      ));
      
      if (amount >= player.chips) {
        action = 'all-in';
        amount = player.chips;
      }
    } else if (action === 'call') {
      // 免费过牌
      if (callAmount === 0) {
        action = 'check';
      } else {
        amount = Math.min(callAmount, player.chips);
        if (amount >= player.chips) {
          action = 'all-in';
          amount = player.chips;
        }
      }
    }

    return {
      action,
      amount,
      confidence,
      thinking: this.generateThinking(action, confidence, player.difficulty!)
    };
  }

  /**
   * 构建 Preflop 决策概率分布
   * 核心思路：以 GTO 建议为基线，根据风格调整
   */
  private static buildPreflopMix(
    gtoAction: 'fold' | 'call' | 'raise' | 'all-in',
    tier: HandTier,
    position: string,
    style: typeof AI_STYLES.TAG,
    facingRaise: boolean,
    isInBlind: boolean,
    callAmount: number,
    bigBlind: number,
    potSize: number
  ): ActionMix {
    // 手牌强度（0-1）
    const strength = tier / 5;
    
    // 底池赔率（call需要付出的相对代价）
    const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) : 0;
    
    // 基础分布：根据 GTO 建议设置默认权重
    let mix: ActionMix = { fold: 0, call: 0, raise: 0 };
    
    if (gtoAction === 'raise' || gtoAction === 'all-in') {
      mix = { fold: 0.05, call: 0.20, raise: 0.75 };
    } else if (gtoAction === 'call') {
      mix = { fold: 0.10, call: 0.70, raise: 0.20 };
    } else {
      // fold
      mix = { fold: 0.70, call: 0.20, raise: 0.10 };
    }
    
    // ============================================================
    // 风格调整：VPIP 决定入池率（fold vs 非fold）
    // ============================================================
    // vpip 越高，越倾向于入池；同时用 handStrength 作为额外保护
    const vpip = style.vpip;
    
    // 目标入池率 = vpip + 手牌强度加成
    const targetPlayRate = Math.min(0.98, vpip + strength * 0.6 + 0.1);
    const targetFoldRate = 1 - targetPlayRate;
    
    // 将 fold 向 targetFoldRate 靠拢（取加权平均）
    const foldBlend = 0.6; // 60% 采用目标值
    mix.fold = mix.fold * (1 - foldBlend) + targetFoldRate * foldBlend;
    
    // ============================================================
    // 风格调整：PFR/aggression 决定 call vs raise 的比例
    // ============================================================
    // 攻击性因子（0-3），将其映射到 raise/call 比例
    const aggressionRatio = style.aggression / (style.aggression + 1.5); // 0-0.67
    const nonFoldWeight = mix.call + mix.raise;
    if (nonFoldWeight > 0) {
      // 期望 raise 占非fold的比例
      const targetRaiseShare = Math.min(0.85, aggressionRatio + strength * 0.35);
      const targetCallShare = 1 - targetRaiseShare;
      
      // 强牌越强，越倾向 raise
      const raiseBlend = 0.5;
      mix.raise = nonFoldWeight * (targetRaiseShare * raiseBlend + (mix.raise / nonFoldWeight) * (1 - raiseBlend));
      mix.call = nonFoldWeight * (targetCallShare * raiseBlend + (mix.call / nonFoldWeight) * (1 - raiseBlend));
    }
    
    // ============================================================
    // 底池承诺 / 盲注保护
    // ============================================================
    // 盲注位已投入筹码 -> 强烈降低弃牌概率
    if (isInBlind && callAmount > 0) {
      if (callAmount <= bigBlind * 2) {
        // 面对小额跟注，几乎不弃牌
        mix.fold *= 0.15;
        if (tier >= HandTier.MARGINAL) {
          mix.fold *= 0.3;
        }
      } else if (callAmount <= bigBlind * 4) {
        mix.fold *= 0.5;
      }
    }
    
    // ============================================================
    // 底池赔率修正
    // ============================================================
    // 如果 pot odds 极好（< 25%），降低弃牌率
    if (potOdds > 0 && potOdds < 0.25) {
      mix.fold *= 0.4;
      mix.call *= 1.3;
    } else if (potOdds > 0 && potOdds < 0.4) {
      mix.fold *= 0.7;
    }
    
    // ============================================================
    // 面对 3-bet+ 时的调整
    // ============================================================
    if (facingRaise && callAmount > bigBlind * 6) {
      // 面对大加注，垃圾牌应该弃
      if (tier === HandTier.TRASH) {
        mix.fold = Math.max(mix.fold, 0.85);
        mix.call *= 0.3;
        mix.raise *= 0.2;
      } else if (tier === HandTier.MARGINAL) {
        mix.fold = Math.max(mix.fold, 0.6);
      }
    }
    
    // ============================================================
    // 强牌保护：极强牌不应弃牌
    // ============================================================
    if (tier >= HandTier.STRONG) {
      mix.fold = Math.min(mix.fold, 0.05);
    }
    if (tier === HandTier.PREMIUM) {
      mix.fold = 0;
    }
    
    // ============================================================
    // 免费过牌保护：无需支付时永不弃牌（call=check）
    // ============================================================
    if (callAmount === 0) {
      mix.call += mix.fold;
      mix.fold = 0;
    }
    
    return this.normalizeMix(mix);
  }

  // ================================================================
  // Postflop 决策 - 基于概率分布 + EV
  // ================================================================

  private static getPostflopDecision(
    player: Player,
    gameState: GameState,
    styleConfig: typeof AI_STYLES.TAG,
    config: typeof AI_DIFFICULTY_CONFIG.easy
  ): AIDecision {
    const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
    const callAmount = maxBet - player.bet;
    const potSize = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);
    
    // 评估当前牌力（含听牌）
    const analysis = this.analyzePostflopHand(player.cards, gameState.board, gameState.phase);
    
    // 底池赔率
    const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) : 0;
    
    // 底池承诺：已投入相对于剩余筹码的比例
    const potCommitment = player.bet / Math.max(player.chips + player.bet, 1);
    
    // 位置强度
    const position = this.getPositionStrength(player.position, gameState.players.length);
    
    // 分析牌面纹理
    const texture = this.analyzeBoardTexture(gameState.board);
    
    // 分析本手行动上下文（诈唬的关键情报）
    const activeCount = gameState.players.filter(p => p.status === 'active' || p.status === 'waiting').length;
    const context = this.analyzeHandContext(player, gameState, callAmount, potSize, activeCount);
    
    // 构建概率分布
    const mix = this.buildPostflopMix(
      analysis,
      potOdds,
      potCommitment,
      position,
      styleConfig,
      gameState.phase,
      callAmount,
      gameState.bigBlind,
      activeCount,
      texture,
      context,
      player.cards
    );
    
    // ============================================================
    // 剥削性调整：根据对手画像（>= 5 手观察）调整分布
    // ============================================================
    const exploitedMix = this.applyOpponentExploits(
      mix,
      player,
      gameState,
      analysis,
      context,
      callAmount
    );
    
    // 难度调整
    const finalMix = this.applyDifficultyToMix(exploitedMix, config.gtoAdherence, Math.floor(analysis.equity * 5));
    
    // 采样动作
    let action: ActionType = this.sampleAction(finalMix);
    let amount = 0;
    
    // 计算金额
    if (action === 'raise') {
      // 判定当前加注是价值还是诈唬：equity < 0.5 且没成牌 → 诈唬定性
      const isBluff = analysis.equity < 0.45 && analysis.madeHandStrength < 0.35;
      amount = this.calculateRaiseSize(
        analysis.equity,
        potSize,
        styleConfig.aggression,
        gameState.minRaise,
        player.chips,
        callAmount,
        texture,
        isBluff,
        gameState.phase
      );
      
      if (amount >= player.chips) {
        action = 'all-in';
        amount = player.chips;
      }
    } else if (action === 'call') {
      if (callAmount === 0) {
        action = 'check';
      } else {
        amount = Math.min(callAmount, player.chips);
        if (amount >= player.chips) {
          action = 'all-in';
          amount = player.chips;
        }
      }
    }
    
    return {
      action,
      amount,
      confidence: analysis.equity,
      thinking: this.generateThinking(action, analysis.equity, player.difficulty!)
    };
  }

  /**
   * 分析翻牌后手牌
   * 返回归一化胜率（equity, 0-1），考虑现有牌力 + 听牌
   */
  private static analyzePostflopHand(
    playerCards: Card[],
    board: Card[],
    phase: string
  ): { equity: number; madeHandStrength: number; drawEquity: number; hasStrongDraw: boolean } {
    const allCards = [...playerCards, ...board];
    const evaluation = evaluateHand(allCards);
    
    // 现有成牌强度（0-1）
    const maxRank = 9;
    let madeHandStrength = evaluation.rank / maxRank;
    // 加入牌型内部强度（例如两对内部大小）
    madeHandStrength = Math.min(1, madeHandStrength + (evaluation.value % 1000000) / 10000000);
    
    // 听牌胜率估算
    let drawEquity = 0;
    let hasStrongDraw = false;
    
    if (evaluation.draws) {
      const { flushDraw, straightDraw, gutshot, outs } = evaluation.draws;
      
      // 剩余需要发出的牌数
      const remainingCards = phase === 'flop' ? 2 : phase === 'turn' ? 1 : 0;
      
      if (remainingCards > 0 && outs > 0) {
        // 使用简化的 rule of 4/2 计算听牌胜率
        // flop -> river: outs * 4%
        // turn -> river: outs * 2%
        const multiplier = remainingCards === 2 ? 0.04 : 0.02;
        drawEquity = Math.min(0.45, outs * multiplier);
        
        if (flushDraw || straightDraw) {
          hasStrongDraw = true;
        } else if (gutshot) {
          hasStrongDraw = false;
        }
      }
    }
    
    // 综合胜率：现有牌力 + 听牌权益（听牌只在没有强成牌时才计入）
    let equity = madeHandStrength;
    if (madeHandStrength < 0.4 && drawEquity > 0) {
      // 弱成牌但有听牌，主要看听牌胜率
      equity = Math.max(madeHandStrength, drawEquity + madeHandStrength * 0.3);
    }
    
    return {
      equity: Math.min(1, equity),
      madeHandStrength,
      drawEquity,
      hasStrongDraw
    };
  }

  // ================================================================
  // 智能诈唬支撑：牌面纹理 / 行动上下文 / 诈唬评分
  // ================================================================

  /**
   * 分析牌面纹理（用于判断诈唬机会）
   * 干燥牌面（如 K72 rainbow）：诈唬极易成功
   * 湿润牌面（如 T98ss）：太多可能中牌的听牌手，诈唬风险高
   */
  private static analyzeBoardTexture(board: Card[]): BoardTexture {
    if (board.length === 0) {
      return {
        wetness: 0, paired: false, monotone: false, twoTone: false,
        connected: false, highCard: 0, hasAce: false, hasKing: false
      };
    }
    
    const rankOrder: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    
    const ranks = board.map(c => rankOrder[c.rank]).sort((a, b) => b - a);
    const suits = board.map(c => c.suit);
    
    // 配对检测
    const rankCounts = new Map<number, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const paired = Array.from(rankCounts.values()).some(c => c >= 2);
    
    // 同花可能
    const suitCounts = new Map<string, number>();
    suits.forEach(s => suitCounts.set(s, (suitCounts.get(s) || 0) + 1));
    const maxSuit = Math.max(...Array.from(suitCounts.values()));
    const monotone = maxSuit >= 3;
    const twoTone = maxSuit === 2;
    
    // 连张检测（最大与最小差不超过4且没配对）
    const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
    let connected = false;
    if (uniqueRanks.length >= 3) {
      const gap = uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1];
      connected = gap <= 4;
    } else if (uniqueRanks.length === 2) {
      connected = uniqueRanks[0] - uniqueRanks[1] <= 2;
    }
    
    // 湿润度计算：0-1
    let wetness = 0;
    if (monotone) wetness += 0.5;
    else if (twoTone) wetness += 0.2;
    if (connected) wetness += 0.3;
    if (paired) wetness += 0.15; // 配对牌面对诈唬也不太友好
    wetness = Math.min(1, wetness);
    
    return {
      wetness,
      paired,
      monotone,
      twoTone,
      connected,
      highCard: ranks[0] || 0,
      hasAce: ranks.includes(14),
      hasKing: ranks.includes(13)
    };
  }

  /**
   * 分析本手行动上下文
   * - 谁是 preflop 加注者？我能否 c-bet？
   * - 上一街是否有人下注、谁是加注者？
   * - 本街之前是否有人下注？下注比例？
   * - 是否所有人都过牌到我（可以随手偷池）？
   */
  private static analyzeHandContext(
    player: Player,
    gameState: GameState,
    callAmount: number,
    potSize: number,
    activeCount: number
  ): HandContext {
    const actions = gameState.currentActions || [];
    const currentPhase = gameState.phase;
    
    // 找出 preflop 最后一位加注者
    let preflopAggressor: string | null = null;
    for (const a of actions) {
      if (a.phase === 'preflop' && (a.action.type === 'raise' || a.action.type === 'all-in')) {
        preflopAggressor = a.playerId;
      }
    }
    
    // 找出上一街的最后加注者
    const streetOrder: string[] = ['preflop', 'flop', 'turn', 'river'];
    const prevPhaseIdx = streetOrder.indexOf(currentPhase) - 1;
    const prevPhase = prevPhaseIdx >= 0 ? streetOrder[prevPhaseIdx] : null;
    let lastStreetAggressor: string | null = null;
    if (prevPhase) {
      for (const a of actions) {
        if (a.phase === prevPhase && (a.action.type === 'raise' || a.action.type === 'all-in' || a.action.type === 'call')) {
          if (a.action.type === 'raise' || a.action.type === 'all-in') {
            lastStreetAggressor = a.playerId;
          }
        }
      }
    }
    
    // 本街是否有人下注？
    const thisStreetActions = actions.filter(a => a.phase === currentPhase);
    const facedBetThisStreet = callAmount > 0;
    const betSizeRatio = potSize > 0 ? callAmount / potSize : 0;
    
    // 是否所有活跃玩家都在本街过牌到我？
    const everyoneCheckedToMe = thisStreetActions.length > 0 && 
      thisStreetActions.every(a => a.action.type === 'check') &&
      !facedBetThisStreet;
    
    return {
      preflopAggressor,
      lastStreetAggressor,
      amIPreflopAggressor: preflopAggressor === player.id,
      amILastAggressor: lastStreetAggressor === player.id,
      everyoneCheckedToMe,
      facedBetThisStreet,
      betSizeRatio,
      numOpponents: Math.max(1, activeCount - 1)
    };
  }

  /**
   * 计算诈唬评分（0-1）
   * 综合考虑多种因素：
   * 1. 手牌基础：不能有太强牌力（不需要诈唬）也不能完全没救
   * 2. 阻断牌（blockers）：手中有 A/K 可以阻断对手的强牌组合
   * 3. 牌面纹理：干燥牌面更适合诈唬
   * 4. 代表性叙事：作为 preflop 加注者在 flop c-bet 天然可信
   * 5. 位置优势：后位诈唬更成功
   * 6. 对手数量：越少越好（每多一个对手成功率约 x0.7）
   * 7. 听牌半诈唬：有 draw 时诈唬 EV 更高
   * 8. 风格频率：LAG > TAG > LAP > TAP
   */
  private static computeBluffScore(input: {
    equity: number;
    madeHandStrength: number;
    drawEquity: number;
    hasStrongDraw: boolean;
    phase: string;
    position: number;
    activePlayers: number;
    texture: BoardTexture;
    context: HandContext;
    style: typeof AI_STYLES.TAG;
    holeCards: Card[];
    callAmount: number;
  }): number {
    const {
      equity, madeHandStrength, drawEquity, hasStrongDraw,
      phase, position, activePlayers, texture, context, style, holeCards, callAmount
    } = input;
    
    // 强牌不诈唬（这已经是价值下注了，不算诈唬）
    if (madeHandStrength > 0.55) return 0;
    
    // 河牌前面对大注不诈唬
    if (callAmount > 0 && context.betSizeRatio > 0.7) return 0;
    
    let score = 0;
    
    // ============================================
    // 1. 基础风格频率
    // ============================================
    score += style.bluffFrequency * 1.5; // 0.10~0.30 * 1.5 = 0.15~0.45
    
    // ============================================
    // 2. 位置奖励（后位诈唬更值钱）
    // ============================================
    if (position > 0.7) score += 0.15;
    else if (position > 0.5) score += 0.05;
    else score -= 0.05;
    
    // ============================================
    // 3. 对手数量惩罚：每多一个对手大幅降低
    // ============================================
    const opponents = context.numOpponents;
    if (opponents === 1) score += 0.10; // heads-up 更适合诈唬
    else if (opponents === 2) score -= 0.05;
    else score -= 0.20 * (opponents - 1);
    
    // ============================================
    // 4. 代表性叙事：C-bet 场景（最重要！）
    // ============================================
    // 作为 preflop 加注者，在 flop 上 c-bet 是最经典的诈唬机会
    // 因为对手会尊重你的强牌代表
    if (context.amIPreflopAggressor && phase === 'flop' && context.everyoneCheckedToMe) {
      score += 0.35; // 大幅提升
    }
    // Turn 双管齐下（double-barrel）：如果 flop 也 c-bet 了继续开火
    if (context.amILastAggressor && phase === 'turn') {
      score += 0.20;
    }
    // River 三管齐下（triple-barrel）：风险最高，只有 LAG 才敢
    if (context.amILastAggressor && phase === 'river' && style.aggression > 2.2) {
      score += 0.10;
    }
    
    // ============================================
    // 5. 偷池诈唬：所有人都check到我，且我在后位
    // ============================================
    if (context.everyoneCheckedToMe && position > 0.6 && !context.amIPreflopAggressor) {
      score += 0.20;
    }
    
    // ============================================
    // 6. 牌面纹理：干燥牌面 vs 湿润牌面
    // ============================================
    // 干燥牌面 (wetness < 0.2)：诈唬极易成功
    score += (0.5 - texture.wetness) * 0.4; // -0.2 ~ +0.2
    
    // 高牌牌面（A/K）+ 我是 preflop 加注者 -> 我很可能有顶对
    if (context.amIPreflopAggressor && (texture.hasAce || texture.hasKing)) {
      score += 0.15;
    }
    
    // 配对牌面：对方中的可能性降低，但如果对方有三条会陷阱
    if (texture.paired) {
      score += 0.05;
    }
    
    // 三张同花：诈唬风险高（对方容易有同花或听牌）
    if (texture.monotone) {
      score -= 0.20;
    }
    
    // ============================================
    // 7. 阻断牌（blockers）：手中有 A 或 K
    // ============================================
    const hasAceBlocker = holeCards.some(c => c.rank === 'A');
    const hasKingBlocker = holeCards.some(c => c.rank === 'K');
    if (hasAceBlocker && texture.hasAce === false) score += 0.10;
    if (hasKingBlocker && texture.hasKing === false) score += 0.05;
    
    // 同花阻断牌：手中有同花色的高牌，减少对手同花可能
    if (texture.twoTone || texture.monotone) {
      const boardSuits = new Set<string>();
      // 这里粗略用 wetness 反推，实际有更精确的方式
      const hasFlushBlocker = holeCards.some(c => 
        boardSuits.has(c.suit) || (c.rank === 'A' || c.rank === 'K')
      );
      if (hasFlushBlocker) score += 0.05;
    }
    
    // ============================================
    // 8. 半诈唬奖励：有强听牌
    // ============================================
    if (hasStrongDraw && phase !== 'river') {
      score += 0.20; // 半诈唬风险低（即使被叫也有听牌胜率）
      // 松凶玩家更爱半诈唬
      if (style.aggression > 2.0) score += 0.10;
    }
    
    // ============================================
    // 9. 有点点 equity 的诈唬（防守型诈唬）
    // ============================================
    if (equity > 0.15 && equity < 0.35 && phase !== 'river') {
      score += 0.05;
    }
    
    // ============================================
    // 10. River 特殊处理
    // ============================================
    if (phase === 'river') {
      // River 诈唬必须"讲好故事"：只有作为持续下注者才可信
      if (!context.amILastAggressor && !context.amIPreflopAggressor) {
        score -= 0.20;
      }
      // 河牌手中完全没牌但有阻断牌 -> 极限诈唬机会
      if (equity < 0.15 && hasAceBlocker && style.aggression > 2.0) {
        score += 0.10;
      }
      // 河牌听牌不中：错过听牌可以尝试诈唬（bluff catcher）
      if (drawEquity > 0.2 && madeHandStrength < 0.3) {
        score += 0.08;
      }
    }
    
    // ============================================
    // 11. 松弱型玩家不诈唬（TAP/LAP）
    // ============================================
    if (style.aggression < 1.0) {
      score *= 0.4;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 构建 Postflop 决策概率分布
   */
  private static buildPostflopMix(
    analysis: { equity: number; madeHandStrength: number; drawEquity: number; hasStrongDraw: boolean },
    potOdds: number,
    potCommitment: number,
    position: number,
    style: typeof AI_STYLES.TAG,
    phase: string,
    callAmount: number,
    bigBlind: number,
    activePlayers: number,
    texture: BoardTexture,
    context: HandContext,
    holeCards: Card[]
  ): ActionMix {
    const { equity, madeHandStrength, hasStrongDraw, drawEquity } = analysis;
    
    // 基础概率分布（根据牌力档次）
    let mix: ActionMix;
    
    if (equity >= 0.75) {
      // 极强牌 - 主要价值下注
      mix = { fold: 0, call: 0.25, raise: 0.75 };
    } else if (equity >= 0.55) {
      // 强牌
      mix = { fold: 0.02, call: 0.45, raise: 0.53 };
    } else if (equity >= 0.40) {
      // 中等牌
      mix = { fold: 0.08, call: 0.65, raise: 0.27 };
    } else if (equity >= 0.28) {
      // 边缘牌 / 听牌
      mix = { fold: 0.28, call: 0.58, raise: 0.14 };
    } else if (equity >= 0.18) {
      // 弱牌但有点戏
      mix = { fold: 0.55, call: 0.35, raise: 0.10 };
    } else {
      // 垃圾牌
      mix = { fold: 0.80, call: 0.13, raise: 0.07 };
    }
    
    // ============================================================
    // 风格调整
    // ============================================================
    // 弱牌情况下，fold阈值调整
    mix.fold += style.foldThresholdAdjust; // TAG=-0.08, LAG=-0.20, TAP=-0.05, LAP=-0.25
    mix.fold = Math.max(0, mix.fold);
    
    // 攻击性影响 raise 权重
    const aggressionBoost = (style.aggression - 1.5) * 0.15; // -0.75~+0.225
    mix.raise = Math.max(0, mix.raise + aggressionBoost * (equity > 0.3 ? 1 : 0.3));
    
    // 松弱玩家：更多 call
    if (style.aggression < 1.0) {
      const shifted = mix.raise * 0.4;
      mix.raise -= shifted;
      mix.call += shifted;
    }
    
    // ============================================================
    // 底池赔率保护：面对好赔率的跟注不应轻易弃牌
    // ============================================================
    if (callAmount > 0) {
      // 当我方胜率 >= 底池赔率 * 1.15 时，明显有利可图
      if (equity > potOdds * 1.15) {
        mix.fold *= 0.35;
        mix.call *= 1.35;
      } else if (equity < potOdds * 0.7) {
        // 胜率远低于赔率 —— 明显亏损跟注，坚决弃
        mix.fold *= 1.5;
        mix.call *= 0.5;
      }
      // 极好的赔率（跟注很便宜）
      if (potOdds < 0.2) {
        mix.fold *= 0.5;
      }
      
      // 面对小 bet（相对于底池）但胜率也应至少能打
      if (callAmount <= bigBlind * 2 && equity > 0.15) {
        mix.fold *= 0.6;
      }
    } else {
      // 无需付出，永不弃牌
      mix.call += mix.fold;
      mix.fold = 0;
    }
    
    // ============================================================
    // 底池承诺保护：已投入较多筹码时，不应轻易弃牌
    // 但同样要求 equity 起码不能太惨
    // ============================================================
    if (potCommitment > 0.3 && equity > 0.2) {
      mix.fold *= 0.5;
    } else if (potCommitment > 0.15 && equity > 0.25) {
      mix.fold *= 0.75;
    }
    
    // ============================================================
    // 听牌处理：flop/turn 有强听牌应主动跟注甚至半诈唬加注
    // ============================================================
    if (hasStrongDraw && phase !== 'river') {
      mix.fold *= 0.4;
      mix.call *= 1.3;
      // 松凶/紧凶可能半诈唬加注
      if (style.aggression > 2.0) {
        mix.raise *= 1.4;
      }
    }
    
    // ============================================================
    // 智能慢打（诱敌/陷阱）—— 基于纹理确定性判断，避免随机翻脸
    // 强牌 + 干燥牌面 + 单挑 -> 高概率慢打；湿润牌面 -> 直接价值下注
    // ============================================================
    if (madeHandStrength > 0.8 && callAmount === 0) {
      // 慢打得分：0-1，>0.5 才启用慢打
      const slowPlayScore =
        style.slowPlayFrequency *
        (1.5 - texture.wetness) *      // 干燥牌面倾向慢打
        (context.numOpponents === 1 ? 1.4 : 0.6); // 单挑更适合，多人场必须保护
      
      // 河牌不慢打（错过价值）
      const canSlowPlay = phase !== 'river' && slowPlayScore > 0.5;
      if (canSlowPlay) {
        mix.call += mix.raise * 0.7;
        mix.raise *= 0.3;
      }
    }
    
    // ============================================================
    // 智能诈唬系统：综合牌面、行动历史、位置、代表性叙事
    // ============================================================
    const bluffScore = this.computeBluffScore({
      equity,
      madeHandStrength,
      drawEquity,
      hasStrongDraw,
      phase,
      position,
      activePlayers,
      texture,
      context,
      style,
      holeCards,
      callAmount
    });
    
    // bluffScore ∈ [0, 1] 越高越应诈唬
    if (bluffScore > 0.15 && callAmount === 0) {
      // 主动诈唬：check 场景下改为加注（c-bet / probe / stab）
      const raiseBoost = bluffScore * 0.75;
      mix.raise = mix.raise + raiseBoost;
      // 从 call 挪一部分权重到 raise
      const shift = Math.min(mix.call, bluffScore * 0.4);
      mix.call -= shift;
      mix.raise += shift;
    } else if (bluffScore > 0.6 && callAmount > 0 && context.betSizeRatio < 0.5) {
      // 高置信度下面对小额下注 -> check-raise 诈唬
      mix.raise = Math.max(mix.raise, bluffScore * 0.3);
      mix.fold *= 0.6;
    }
    
    // ============================================================
    // 位置修正：好位置更愿意参与
    // ============================================================
    if (position > 0.7) {
      mix.fold *= 0.85;
      mix.raise *= 1.1;
    } else if (position < 0.3) {
      mix.fold *= 1.05;
    }
    
    // ============================================================
    // River GTO 平衡：诈唬-价值-弃防对称
    // ============================================================
    if (phase === 'river') {
      if (callAmount > 0) {
        // ---- 面对下注：GTO 最小防守频率 MDF = 1 - α ----
        // α = bet/(pot+bet)，我方为了不被剥削，call 概率至少 MDF
        // 但同时也要考虑自身牌力
        const alpha = potOdds; // 恰好等于底池赔率的 α
        const mdf = 1 - alpha; // 最小防守频率
        
        if (equity >= 0.7) {
          // 强牌：几乎不弃，甚至考虑加注收更多价值（thin value / raise-for-value）
          mix.fold = 0;
          mix.call = Math.max(mix.call, 0.75);
          // 面对小注可以加价值
          if (context.betSizeRatio < 0.6 && equity >= 0.8) {
            mix.raise = Math.max(mix.raise, 0.25);
          }
        } else if (equity >= 0.45) {
          // 中等牌 —— 典型 bluff-catch 区，按 MDF 决定 call
          mix.call = Math.max(mix.call, mdf * 0.9);
          mix.fold = Math.min(mix.fold, 1 - mdf * 0.9);
          mix.raise = 0; // 不要用中等牌加注 —— 会被更强的牌 3-bet
        } else if (equity >= 0.25) {
          // 边缘牌：只有小注时才 bluff-catch
          if (alpha < 0.4) {
            // 对方下注小 (< 40% pot)，我方 pot odds 好
            mix.call = Math.max(mix.call, 0.4);
            mix.fold = Math.min(mix.fold, 0.6);
          } else {
            mix.call *= 0.5;
            mix.fold = Math.max(mix.fold, 0.7);
          }
          mix.raise = 0;
        } else {
          // 河牌垃圾牌面对下注：几乎必弃，除非有阻断牌 + 极小注
          mix.raise *= 0.3; // 保留一点点 3-bet 诈唬空间
          mix.call *= 0.2;
          mix.fold = Math.max(mix.fold, 0.85);
        }
      } else {
        // ---- 无人下注：河牌下注决策 ----
        if (equity >= 0.7) {
          // 强牌：价值下注（更薄一档）
          mix.raise = Math.max(mix.raise, 0.7);
          mix.call = 1 - mix.raise; // check-behind 也可
        } else if (equity >= 0.45) {
          // 中等牌：check 为主，避免被 check-raise
          mix.raise *= 0.4;
          mix.call = Math.max(mix.call, 0.7);
        } else if (equity < 0.25) {
          // 河牌垃圾牌：只有 bluffScore 特别高才诈唬（已由 bluff 系统处理）
          // 这里限制随机诈唬冲动
          mix.raise = Math.min(mix.raise, 0.25);
          mix.call = Math.max(mix.call, 0.75);
        }
      }
    }
    
    // 强牌保底
    if (equity >= 0.7) {
      mix.fold = Math.min(mix.fold, 0.02);
    }
    if (equity >= 0.85) {
      mix.fold = 0;
    }
    
    return this.normalizeMix(mix);
  }

  /**
   * 计算加注大小（基于牌力 + 牌面纹理 + SPR + 街阶段）
   *
   * 经典 GTO 尺度参考：
   * - 干燥牌面 (wetness < 0.25): 33-50% pot（阻塞下注 / 小额诈唬）
   * - 中等牌面: 50-66%
   * - 湿润牌面 (wetness > 0.5): 66-100%（保护 + 收听牌费）
   * - 极值牌型（坚果 / 深筹）: 偶尔 overbet 到 125%
   * - SPR 低（<3）时：更倾向直接 all-in 或大注（承诺）
   */
  private static calculateRaiseSize(
    equity: number,
    potSize: number,
    aggression: number,
    minRaise: number,
    playerChips: number,
    callAmount: number,
    texture?: BoardTexture,
    isBluff: boolean = false,
    phase: string = 'flop'
  ): number {
    const wetness = texture?.wetness ?? 0.3;
    const effectivePot = potSize + callAmount;
    
    // 基础 pot 比例
    let potFraction: number;
    
    if (isBluff) {
      // 诈唬：干燥牌面小注、湿润牌面大注（不同的诈唬逻辑）
      if (wetness < 0.3) {
        potFraction = 0.4;  // 干燥牌面 33-50%，成本低
      } else if (wetness > 0.6) {
        potFraction = 0.75; // 湿润牌面必须大注否则被听牌打
      } else {
        potFraction = 0.6;
      }
    } else if (equity >= 0.85) {
      // 坚果牌：湿润牌面 overbet 保护+收更多价值，干燥牌面小注钓鱼
      if (wetness > 0.5) {
        potFraction = 1.0;
      } else if (wetness > 0.25) {
        potFraction = 0.75;
      } else {
        potFraction = 0.55;
      }
    } else if (equity >= 0.65) {
      // 强价值牌：中大注收保护费
      if (wetness > 0.5) {
        potFraction = 0.8;
      } else if (wetness > 0.25) {
        potFraction = 0.66;
      } else {
        potFraction = 0.5;
      }
    } else if (equity >= 0.45) {
      // 中等牌：更小的下注控制底池
      if (wetness > 0.5) {
        potFraction = 0.6;
      } else {
        potFraction = 0.4;
      }
    } else {
      // 弱牌加注只可能是诈唬/半诈唬
      potFraction = wetness > 0.5 ? 0.66 : 0.5;
    }
    
    // 攻击性乘数（LAG 加大、TAP 缩小），但限制在合理区间
    const aggMultiplier = 0.9 + (aggression / 3) * 0.25; // 0.9-1.15
    potFraction *= aggMultiplier;
    
    // 河牌：不再有听牌威胁，价值下注可以更薄
    if (phase === 'river' && !isBluff && equity >= 0.6 && equity < 0.85) {
      potFraction *= 0.85;
    }
    
    let raiseAmount = Math.round(effectivePot * potFraction) + callAmount;
    
    // SPR 保护：如果加注后剩余筹码很少，直接 all-in 更好
    const remainingAfterRaise = playerChips - raiseAmount;
    if (remainingAfterRaise > 0 && remainingAfterRaise < potSize * 0.5) {
      raiseAmount = playerChips;
    }
    
    raiseAmount = Math.max(raiseAmount, minRaise);
    raiseAmount = Math.min(raiseAmount, playerChips);
    
    return Math.round(raiseAmount);
  }

  // ================================================================
  // 概率分布工具函数
  // ================================================================

  /** 归一化概率分布 */
  private static normalizeMix(mix: ActionMix): ActionMix {
    const total = Math.max(mix.fold, 0) + Math.max(mix.call, 0) + Math.max(mix.raise, 0);
    if (total <= 0) {
      return { fold: 0, call: 1, raise: 0 };
    }
    return {
      fold: Math.max(mix.fold, 0) / total,
      call: Math.max(mix.call, 0) / total,
      raise: Math.max(mix.raise, 0) / total
    };
  }

  /** 从分布中采样动作 */
  private static sampleAction(mix: ActionMix): ActionType {
    const r = Math.random();
    if (r < mix.fold) return 'fold';
    if (r < mix.fold + mix.call) return 'call';
    return 'raise';
  }

  /**
   * 翻前剥削性调整：根据对手画像调整 3-bet / cold-call / fold 频率
   *
   * - 面对 nit（vpip 极低）的加注 → 更多弃，只 3-bet 极强牌
   * - 面对 maniac（vpip 极高、aggression 极高）的加注 → 用更宽的范围 3-bet 反击
   * - 面对 fold-to-3bet 高的对手 → 疯狂 3-bet 诈唬
   * - 面对 calling-station 的加注 → 不诈唬 3-bet，只价值 3-bet
   */
  private static applyPreflopOpponentExploits(
    mix: ActionMix,
    player: Player,
    gameState: GameState,
    tier: HandTier,
    facingRaise: boolean,
    callAmount: number
  ): ActionMix {
    // 找到本手 preflop 加注者作为剥削目标
    let target: OpponentProfile | null = null;
    if (facingRaise) {
      const currentActions = gameState.currentActions || [];
      for (let i = currentActions.length - 1; i >= 0; i--) {
        const a = currentActions[i];
        if (a.phase !== 'preflop') continue;
        if (a.playerId !== player.id && (a.action.type === 'raise' || a.action.type === 'all-in')) {
          target = opponentModel.getProfile(a.playerId);
          break;
        }
      }
    } else {
      // 未面对加注 —— 看下游玩家最"松"的那位，决定是否要 iso-raise
      for (const p of gameState.players) {
        if (p.id === player.id) continue;
        const prof = opponentModel.getProfile(p.id);
        if (!target || prof.vpip > target.vpip) target = prof;
      }
    }
    
    if (!target || target.handsObserved < 5) return mix;
    
    const out: ActionMix = { ...mix };
    
    // ---- 面对加注时的剥削 ----
    if (facingRaise && callAmount > 0) {
      // 1. 对方是 nit → 加注 = 强牌，只有 PREMIUM 才应对
      if (target.style === 'nit' || target.vpip < 0.18) {
        if (tier < HandTier.PREMIUM) {
          out.fold *= 1.5;
          out.raise *= 0.4;
          out.call *= 0.7;
        }
      }
      
      // 2. 对方是 maniac / 极松 → 用更宽范围 3-bet call
      if (target.style === 'maniac' || target.vpip > 0.4) {
        if (tier >= HandTier.GOOD) {
          out.fold *= 0.3;
          out.call *= 1.3;
          out.raise *= 1.4;
        } else if (tier >= HandTier.PLAYABLE) {
          out.fold *= 0.6;
          out.call *= 1.2;
        }
      }
      
      // 3. 对方 fold-to-3bet 高 → 我方 light 3-bet 诈唬
      if (target.foldToThreeBet > 0.65 && tier <= HandTier.PLAYABLE) {
        // 用弱牌 3-bet 诈唬，直接偷底池
        out.raise += 0.25;
        out.fold *= 0.6;
      }
      
      // 4. 对方 calling-station → 只价值 3-bet，从不诈唬
      if (target.style === 'calling-station' || target.wtsd > 0.45) {
        if (tier < HandTier.STRONG) {
          out.raise *= 0.3;
          out.call += mix.raise * 0.5;
        }
        // 强牌加大价值 raise
        if (tier >= HandTier.STRONG) {
          out.raise *= 1.3;
        }
      }
    }
    
    return this.normalizeMix(out);
  }

  /**
   * 剥削性调整 —— 根据对手历史画像调整决策
   *
   * 核心思路：
   * - 面对 fold-to-cbet 高的对手 → 疯狂 c-bet 诈唬
   * - 面对 calling-station（wtsd 高）→ 减少诈唬，只做价值
   * - 面对 nit（vpip 极低）→ 尊重其下注，弱牌坚决弃
   * - 面对 maniac（aggression > 3）→ 加大 bluff-catch，更多 call
   *
   * 只有当画像 handsObserved >= 5 时才启用剥削（避免样本不足）
   */
  private static applyOpponentExploits(
    mix: ActionMix,
    player: Player,
    gameState: GameState,
    analysis: { equity: number; madeHandStrength: number },
    context: HandContext,
    callAmount: number
  ): ActionMix {
    // 找出主要对手 = 上一个下注/加注者，或最近一个人类玩家
    const opponents = gameState.players.filter(
      p => p.id !== player.id && (p.status === 'active' || p.status === 'waiting' || p.status === 'all-in')
    );
    if (opponents.length === 0) return mix;
    
    // 优先看：如果面对下注，剥削下注者；否则看下游玩家（可能的抵抗者）
    let target: OpponentProfile | null = null;
    if (context.facedBetThisStreet) {
      // 找上一次下注者
      const lastActions = gameState.currentActions || [];
      for (let i = lastActions.length - 1; i >= 0; i--) {
        const a = lastActions[i];
        if (a.playerId !== player.id && (a.action.type === 'raise' || a.action.type === 'all-in')) {
          target = opponentModel.getProfile(a.playerId);
          break;
        }
      }
    }
    // 兜底：用剩余对手中样本最多的
    if (!target) {
      for (const p of opponents) {
        const prof = opponentModel.getProfile(p.id);
        if (!target || prof.handsObserved > target.handsObserved) {
          target = prof;
        }
      }
    }
    
    if (!target || target.handsObserved < 5) return mix;
    
    const out: ActionMix = { ...mix };
    
    // ---- 1. calling-station / high wtsd：不要诈唬，只做价值 ----
    if (target.style === 'calling-station' || target.wtsd > 0.45) {
      // 弱牌加注要压低（诈唬无效）
      if (analysis.equity < 0.5) {
        out.raise *= 0.4;
        out.call += mix.raise * 0.4;
      }
      // 强牌 raise 提升（value bet 更能被叫）
      if (analysis.equity >= 0.65) {
        out.raise *= 1.25;
      }
    }
    
    // ---- 2. nit / 极紧对手：尊重其下注 ----
    if ((target.style === 'nit' || target.vpip < 0.18) && context.facedBetThisStreet) {
      // nit 下注几乎都是强牌，边缘牌应该弃
      if (analysis.equity < 0.55) {
        out.fold *= 1.6;
        out.call *= 0.7;
        out.raise *= 0.5;
      }
    }
    
    // ---- 3. maniac / 高攻击性对手：加大 bluff-catch ----
    if ((target.style === 'maniac' || target.aggression > 3) && context.facedBetThisStreet) {
      // 因为对方诈唬多，我们的中等牌值得跟
      if (analysis.equity >= 0.3 && analysis.equity < 0.65) {
        out.fold *= 0.5;
        out.call *= 1.35;
      }
      // 但不主动加注对抗（会被 3-bet）
      if (analysis.equity < 0.7) {
        out.raise *= 0.75;
      }
    }
    
    // ---- 4. 高 fold-to-cbet 对手：疯狂 c-bet 诈唬 ----
    if (
      context.amIPreflopAggressor &&
      gameState.phase === 'flop' &&
      context.everyoneCheckedToMe &&
      target.foldToCbet > 0.55
    ) {
      // 显著提升 c-bet 频率，即使弱牌
      out.raise += 0.35;
      out.call *= 0.5; // 减少 check-back
    }
    
    // ---- 5. 高 fold-to-3bet 对手：多在翻前 3-bet（此处只影响 postflop 继续加注）----
    if (target.foldToThreeBet > 0.65 && analysis.equity < 0.4 && callAmount === 0) {
      // 对方翻前打不住，翻后接着开火同样有效
      out.raise += 0.15;
    }
    
    return this.normalizeMix(out);
  }

  /**
   * 应用难度对分布的影响 —— 使用温度采样，而不是掺入均匀噪声
   *
   * 高难度（gtoAdherence 接近 1.0）：分布锐化 → 更倾向于选最优动作，行为一致
   * 低难度（gtoAdherence 接近 0.5）：分布平滑 → 保持随机性但仍偏向合理选项
   *
   * 关键：不再有"33% 均匀分布"的噪声污染，即使新手 AI 也不会在强牌乱弃或垃圾牌乱冲。
   */
  private static applyDifficultyToMix(mix: ActionMix, gtoAdherence: number, _tierOrEquity: number): ActionMix {
    // temperature ∈ [0.5, 2.0]：越低分布越锐化（越确定），越高越平滑
    // gtoAdherence 1.0 → temp 0.55（几乎总选最优）
    // gtoAdherence 0.7 → temp 1.0（原分布，正常采样）
    // gtoAdherence 0.5 → temp 1.5（平滑，更随机但仍合理）
    const temperature = Math.max(0.5, 2.0 - gtoAdherence * 1.5);
    
    const pow = (v: number) => Math.pow(Math.max(v, 1e-6), 1 / temperature);
    return this.normalizeMix({
      fold: pow(mix.fold),
      call: pow(mix.call),
      raise: pow(mix.raise)
    });
  }

  // ================================================================
  // 保留的辅助函数
  // ================================================================

  // 获取位置优势（0-1）
  private static getPositionStrength(position: number, totalPlayers: number): number {
    const relativePosition = (position - 1 + totalPlayers) % totalPlayers;
    return relativePosition / (totalPlayers - 1);
  }

  // 生成AI思考过程（用于调试和展示）
  private static generateThinking(action: ActionType, handStrength: number, difficulty: AIDifficulty): string {
    const strengthDesc = handStrength > 0.7 ? '强牌' : handStrength > 0.4 ? '中等牌' : '弱牌';
    const actionDesc = {
      'fold': '放弃这手牌',
      'check': '观望局势',
      'call': '跟进看看',
      'raise': '施加压力',
      'all-in': '全力以赴'
    }[action];

    return `[${difficulty}] 持有${strengthDesc}，决定${actionDesc}`;
  }

  // ================================================================
  // AI 回合处理
  // ================================================================

  // 批量处理所有AI玩家的决策（同步执行，不使用setTimeout）
  static processAITurns(gameState: GameState, onDecision: (playerId: string, decision: AIDecision) => void): void {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    console.log('[AIEngine] processAITurns called:', {
      currentPlayerIndex: gameState.currentPlayerIndex,
      currentPlayer: currentPlayer ? {
        id: currentPlayer.id,
        name: currentPlayer.name,
        type: currentPlayer.type,
        status: currentPlayer.status
      } : null,
      phase: gameState.phase
    });
    
    if (!currentPlayer) {
      console.warn('[AIEngine] No current player found');
      return;
    }
    
    const canAct = currentPlayer.status === 'active' || currentPlayer.status === 'waiting';
    
    if (currentPlayer.type === 'ai' && canAct) {
      console.log(`[AIEngine] ${currentPlayer.name} 正在思考... (phase: ${gameState.phase})`);
      const decision = this.getDecision(currentPlayer, gameState);
      console.log(`[AIEngine] ${currentPlayer.name} 决定: ${decision.action}${decision.amount ? ` $${decision.amount}` : ''}`);
      onDecision(currentPlayer.id, decision);
    } else {
      console.log(`[AIEngine] 跳过 ${currentPlayer.name} (type: ${currentPlayer.type}, status: ${currentPlayer.status}, canAct: ${canAct})`);
    }
  }

  // 异步处理AI回合
  static async processAITurnAsync(
    gameState: GameState, 
    onDecision: (playerId: string, decision: AIDecision) => void,
    delay: number = 400
  ): Promise<void> {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (currentPlayer.type === 'ai' && currentPlayer.status === 'active') {
      return new Promise((resolve) => {
        setTimeout(() => {
          const decision = this.getDecision(currentPlayer, gameState);
          onDecision(currentPlayer.id, decision);
          resolve();
        }, delay);
      });
    }
  }
}
