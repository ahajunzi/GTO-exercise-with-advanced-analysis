import { Player, GameState, GTOStrategy, Card, ActionType } from '../../types';
import { evaluateHand, HandRank, detectDraws } from '../../utils/handEvaluator';
import { PreflopRanges, HandTier } from '../ai/PreflopRanges';
import { OpponentModel, opponentModel as defaultOpponentModel } from './OpponentModel';

export type SolverMode = 'normal' | 'expert';

export interface SolverOptions {
  mode?: SolverMode;
  /** 专家模式下用于查询对手画像；不传则使用全局单例 */
  opponentModel?: OpponentModel;
}

/**
 * 额外的决策上下文（供 UI 教学面板使用）
 */
export interface DecisionContext {
  phase: string;
  pot: number;                 // 当前底池（含本轮下注）
  toCall: number;              // 我方还需跟注的金额
  potOdds: number;             // 需要的最低胜率（call/(pot+call)）
  equity: number;              // 估算胜率 0~1
  handStrength: number;        // 当前成牌强度 0~1（不含听牌）
  drawEquity: number;          // 听牌兑现权益 0~1
  spr: number;                 // stack-to-pot ratio
  effectiveStack: number;      // 有效筹码
  position: 'early' | 'middle' | 'late' | 'blinds';
  isFacingBet: boolean;
  aggressorId?: string;        // 本街的最近加注/下注者
  bettorCount: number;         // 本街已下注加注次数
  activeOpponents: number;
  handName?: string;           // 当前最好成牌名称
  preflopTier?: HandTier;      // preflop 手牌等级
}

/**
 * 决策评估结果（用于反馈玩家已做出的动作）
 */
export interface DecisionAnalysis {
  quality: number;             // 0~1
  evLoss: number;              // 相对最优 EV 的损失
  bestAction: ActionType;
  chosenEV: number;
  feedback: string;
  suggestion?: string;
}

export class GTOSolver {
  // ============================================================
  // 主入口
  // ============================================================
  static getStrategy(player: Player, gameState: GameState, options: SolverOptions = {}): GTOStrategy[] {
    const ctx = this.buildContext(player, gameState);
    if (gameState.phase === 'preflop') {
      return this.getPreflopStrategy(player, gameState, ctx, options);
    }
    return this.getPostflopStrategy(player, gameState, ctx, options);
  }

  static getRecommendedAction(player: Player, gameState: GameState, options: SolverOptions = {}): GTOStrategy {
    const strategies = this.getStrategy(player, gameState, options);
    return strategies[0] || {
      action: 'fold', frequency: 1, expectedValue: 0, reasoning: '无可用策略'
    };
  }

  /** 供 UI 面板使用：一次性拿到策略 + 决策上下文 */
  static getFullAnalysis(player: Player, gameState: GameState, options: SolverOptions = {}): {
    strategies: GTOStrategy[];
    context: DecisionContext;
    recommendedRaiseSize: number;
    mode: SolverMode;
  } {
    const ctx = this.buildContext(player, gameState);
    const strategies = gameState.phase === 'preflop'
      ? this.getPreflopStrategy(player, gameState, ctx, options)
      : this.getPostflopStrategy(player, gameState, ctx, options);
    const recommendedRaiseSize = this.recommendRaiseSize(player, gameState, ctx);
    return { strategies, context: ctx, recommendedRaiseSize, mode: options.mode || 'normal' };
  }

  // ============================================================
  // 决策上下文
  // ============================================================
  private static buildContext(player: Player, gameState: GameState): DecisionContext {
    const pot = this.currentPot(gameState);
    const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
    const toCall = Math.max(0, maxBet - player.bet);
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

    const activeOpponents = gameState.players.filter(p =>
      p.id !== player.id && (p.status === 'active' || p.status === 'waiting' || p.status === 'all-in')
    ).length;

    // 手牌强度 / 听牌 / 权益（分阶段）
    let handStrength = 0;
    let drawEquity = 0;
    let handName: string | undefined;
    let preflopTier: HandTier | undefined;

    if (gameState.phase === 'preflop') {
      if (player.cards.length >= 2) {
        const [c1, c2] = player.cards;
        const suited = c1.suit === c2.suit;
        preflopTier = PreflopRanges.getHandTier(c1.rank, c2.rank, suited);
        handStrength = this.evaluatePreflopStrength(player.cards);
      }
    } else if (player.cards.length >= 2 && gameState.board.length >= 3) {
      const all = [...player.cards, ...gameState.board];
      const evaluation = evaluateHand(all);
      handStrength = this.madeHandStrength(evaluation.rank, evaluation.value);
      handName = evaluation.name;
      // 听牌只在 flop/turn 有意义
      if (gameState.phase !== 'river') {
        const draws = detectDraws(all);
        drawEquity = this.drawsToEquity(draws.outs, gameState.phase);
      }
    }

    const equity = this.combineEquity(handStrength, drawEquity, activeOpponents, gameState.phase);

    // 有效筹码 & SPR
    const opponents = gameState.players.filter(p => p.id !== player.id && p.status !== 'folded' && p.status !== 'out');
    const maxOpp = opponents.reduce((m, p) => Math.max(m, p.chips + p.bet), 0);
    const effectiveStack = Math.min(player.chips + player.bet, maxOpp || player.chips + player.bet);
    const spr = pot > 0 ? effectiveStack / pot : 999;

    // 位置
    const position = PreflopRanges.getPositionType(player.position, gameState.players.length, gameState.dealerIndex);

    // 行动上下文：本街 aggressor / 加注次数
    const currentPhaseActions = (gameState.currentActions || []).filter(a => a.phase === gameState.phase);
    let aggressorId: string | undefined;
    let bettorCount = 0;
    for (const a of currentPhaseActions) {
      if (a.action.type === 'raise' || a.action.type === 'all-in') {
        aggressorId = a.playerId;
        bettorCount++;
      }
    }
    if (gameState.phase === 'preflop' && bettorCount === 0 && maxBet > gameState.bigBlind) {
      // 有人 raise 但历史里没记录（保险）
      bettorCount = 1;
    }
    const isFacingBet = toCall > 0;

    return {
      phase: gameState.phase,
      pot, toCall, potOdds, equity, handStrength, drawEquity,
      spr, effectiveStack, position, isFacingBet,
      aggressorId, bettorCount, activeOpponents,
      handName, preflopTier
    };
  }

  // ============================================================
  // Preflop 策略
  // ============================================================
  private static getPreflopStrategy(
    player: Player,
    gameState: GameState,
    ctx: DecisionContext,
    options: SolverOptions = {}
  ): GTOStrategy[] {
    if (!player.cards || player.cards.length < 2 || ctx.preflopTier === undefined) {
      return [{ action: 'fold', frequency: 1, expectedValue: 0, reasoning: '无手牌信息，弃牌' }];
    }

    const tier = ctx.preflopTier;
    const [c1, c2] = player.cards;
    const suited = c1.suit === c2.suit;
    const isInBlind = player.isSmallBlind || player.isBigBlind;

    // 分析加注量：区分 open / 3-bet / 4-bet+
    const openSize = gameState.bigBlind * 2.5;
    const raiseTier = this.classifyPreflopRaise(ctx.toCall, gameState.bigBlind, ctx.pot);

    const suggestion = PreflopRanges.getGTOAction(
      tier,
      ctx.position,
      ctx.isFacingBet,
      ctx.pot,
      gameState.bigBlind,
      isInBlind,
      ctx.toCall,
      gameState.bigBlind
    );

    // 面对 3-bet+ 时对建议做严厉修正
    let adjusted: 'fold' | 'call' | 'raise' = suggestion.action === 'all-in' ? 'raise' : suggestion.action;
    let confidence = suggestion.confidence;
    if (raiseTier === '3bet') {
      // 面对 3-bet：只有 STRONG+ 才 continue，非 PREMIUM 通常只跟不 4-bet
      if (tier < HandTier.STRONG) { adjusted = 'fold'; confidence = 0.75; }
      else if (tier === HandTier.STRONG) { adjusted = 'call'; confidence = 0.7; }
      else { adjusted = 'raise'; confidence = 0.85; }
    } else if (raiseTier === '4bet+') {
      // 只有 PREMIUM 且更倾向 QQ+/AK
      if (tier < HandTier.PREMIUM) { adjusted = 'fold'; confidence = 0.85; }
      else { adjusted = 'raise'; confidence = 0.8; }
    }

    // ---- 计算三种动作的 EV（用于教学显示与决策评估）----
    const equity = ctx.equity;
    const foldEV = 0;

    // Call EV：如果不用跟（toCall=0）→ 视作 check（看免费一手）
    const callEV = ctx.toCall === 0
      ? equity * ctx.pot * 0.5 // 免费看牌，粗略视作能兑现部分权益
      : equity * (ctx.pot + ctx.toCall) - ctx.toCall;

    // Raise EV：估算 fold equity，来自"下注大小/底池"而不是我方牌强度
    const raiseSize = this.recommendRaiseSize(player, gameState, ctx);
    const riskAmount = raiseSize - player.bet; // 我实际投入
    // α = bet / (pot + bet)：对手 breakeven 弃牌率
    const potBeforeRaise = ctx.pot + ctx.toCall;
    const alpha = raiseSize / (potBeforeRaise + raiseSize);
    // 每个对手都要 continue 才算不弃：多人底池弃牌概率呈几何递减
    const perOppFoldRate = this.estimateOppFoldRate(alpha, tier, raiseTier, player, gameState, options);
    const allFold = Math.pow(perOppFoldRate, ctx.activeOpponents);
    // 至少一人跟注：进入摊牌阶段，简化用 equity 估算
    const showdownWin = equity * (potBeforeRaise + riskAmount * ctx.activeOpponents) - riskAmount;
    const raiseEV = allFold * ctx.pot + (1 - allFold) * showdownWin;

    // ---- 生成混合策略 ----
    const strategies: GTOStrategy[] = [];
    const action = adjusted;

    if (action === 'fold') {
      strategies.push({ action: 'fold', frequency: 1, expectedValue: 0,
        reasoning: this.preflopReason('fold', tier, ctx.position, raiseTier) });
      // 教学：仍列出 call/raise 的 EV 作对比
      if (ctx.toCall > 0) {
        strategies.push({ action: 'call', frequency: 0, expectedValue: callEV,
          reasoning: `EV=${callEV.toFixed(0)}，权益${(equity*100).toFixed(0)}% 不足以支撑跟注` });
      }
    } else if (action === 'call') {
      const callFreq = confidence;
      strategies.push({
        action: ctx.toCall > 0 ? 'call' : 'check',
        frequency: callFreq,
        expectedValue: callEV,
        reasoning: this.preflopReason(ctx.toCall > 0 ? 'call' : 'check', tier, ctx.position, raiseTier)
      });

      // 少量 raise 混合（仅当加注 EV 也为正 且不在盲注防守大 3-bet 场景）
      const canBluffRaise = raiseEV > 0 && raiseTier !== '3bet' && raiseTier !== '4bet+';
      const raiseMixFreq = canBluffRaise ? 0.15 : 0;
      if (canBluffRaise) {
        strategies.push({
          action: 'raise', frequency: raiseMixFreq, expectedValue: raiseEV,
          reasoning: '也可以少量偷袭加注，混淆范围'
        });
      }

      // ⚠️ 关键修复：只有在【面对加注 + 牌力真的边缘】时才允许 fold 混合。
      // - toCall === 0：无需付钱看牌，绝对不能塞 fold（免费入池）
      // - 盲注补差 <= 1BB：本质上也是免费看牌，不弃
      // - 牌力 GOOD 及以上（KQs/AJs/AQo/77+）：无论如何都不应弃
      // 之前这里无条件 push 1-confidence 的 fold，会让 KQs 也有 15-30% 概率 fold，属于严重 bug。
      const isFreeOrTiny = ctx.toCall <= gameState.bigBlind;
      const isStrongEnough = tier >= HandTier.GOOD;
      if (!isFreeOrTiny && !isStrongEnough) {
        const foldFreq = Math.max(0, 1 - callFreq - raiseMixFreq);
        if (foldFreq > 0) {
          strategies.push({
            action: 'fold', frequency: foldFreq,
            expectedValue: 0,
            reasoning: '也可以弃牌规避风险'
          });
        }
      }
      // 免费/微跟场景：把剩余频率补到 call（不加 fold）
      // 强牌场景：把剩余频率补到 raise（不加 fold）
      else if (!isFreeOrTiny && isStrongEnough) {
        // 强牌但不塞 fold：剩余频率转成 raise
        const rest = Math.max(0, 1 - callFreq - raiseMixFreq);
        if (rest > 0) {
          strategies.push({
            action: 'raise', frequency: rest, expectedValue: raiseEV,
            reasoning: '强牌，也可以直接加注施压'
          });
        }
      }
    } else if (action === 'raise') {
      strategies.push({
        action: 'raise',
        frequency: confidence,
        expectedValue: raiseEV,
        reasoning: this.preflopReason('raise', tier, ctx.position, raiseTier)
      });
      if (ctx.toCall > 0 && tier >= HandTier.GOOD) {
        strategies.push({
          action: 'call', frequency: 0.2, expectedValue: callEV,
          reasoning: '也可以只跟注隐藏范围'
        });
      }
      if (raiseTier === '3bet' || raiseTier === '4bet+') {
        strategies.push({
          action: 'fold', frequency: Math.max(0, 1 - confidence - 0.2), expectedValue: 0,
          reasoning: '面对大加注，弃牌也是合理选项'
        });
      }
    }

    return this.normalizeAndSort(strategies);
  }

  // 判断当前面对的加注规模属于哪一档
  private static classifyPreflopRaise(toCall: number, bb: number, pot: number): 'none' | 'open' | '3bet' | '4bet+' {
    if (toCall <= 0) return 'none';
    // 相对 bb 的比例
    const raiseBb = toCall / bb;
    if (raiseBb <= 3.5) return 'open';    // 2.5-3.5bb 的 open
    if (raiseBb <= 10) return '3bet';     // 3-bet 通常 7-10bb
    return '4bet+';
  }

  // ============================================================
  // Postflop 策略
  // ============================================================
  private static getPostflopStrategy(
    player: Player,
    gameState: GameState,
    ctx: DecisionContext,
    options: SolverOptions = {}
  ): GTOStrategy[] {
    const strategies: GTOStrategy[] = [];
    const { equity, handStrength, drawEquity, pot, toCall, potOdds, position, phase, spr } = ctx;

    // ---- 计算三种动作的 EV ----
    const foldEV = 0;

    // Check/Call EV
    let checkCallEV: number;
    let checkCallAction: ActionType;
    if (toCall === 0) {
      // 免费看牌：折扣一下（避免让 flop 空气张也报正 EV）
      checkCallEV = equity * pot * 0.6;
      checkCallAction = 'check';
    } else {
      // 精确 pot odds vs equity 判断
      checkCallEV = equity * (pot + toCall) - toCall;
      checkCallAction = 'call';
    }

    // Raise EV（估算 fold equity）
    const raiseSize = this.recommendRaiseSize(player, gameState, ctx);
    const totalPutIn = raiseSize; // 我方总下注变为 raiseSize
    const riskAmount = raiseSize - player.bet;
    const potBeforeRaise = pot + toCall;
    const alpha = riskAmount / (potBeforeRaise + riskAmount);

    // fold equity 取决于：下注大小、街道、对手数、牌面代表性（用 handStrength 作为可信度）
    const perOppFoldRate = this.estimatePostflopOppFold(alpha, phase, position, handStrength, player, gameState, ctx, options);
    const allFold = Math.pow(perOppFoldRate, ctx.activeOpponents);

    // 被跟后：进入下一街，用 equity 估算胜率并考虑 river 尚未兑现的部分
    const showdownWin = equity * (potBeforeRaise + riskAmount * ctx.activeOpponents) - riskAmount;
    const raiseEV = allFold * pot + (1 - allFold) * showdownWin;

    // ---- 生成动作候选 ----
    // 弃牌
    if (toCall > 0 && checkCallEV < 0 && raiseEV < checkCallEV) {
      strategies.push({
        action: 'fold', frequency: 1, expectedValue: 0,
        reasoning: `权益 ${(equity*100).toFixed(0)}% < 需要的 ${(potOdds*100).toFixed(0)}%，跟注亏损`
      });
      // 也列出 call/raise 的 EV 作教学对比
      strategies.push({ action: 'call', frequency: 0, expectedValue: checkCallEV,
        reasoning: `跟注 EV=${checkCallEV.toFixed(0)}` });
      return this.normalizeAndSort(strategies);
    }

    // Check/Call
    if (checkCallEV >= 0 || toCall === 0) {
      strategies.push({
        action: checkCallAction,
        frequency: 0.5,
        expectedValue: checkCallEV,
        reasoning: this.postflopReason(checkCallAction, ctx)
      });
    }

    // Raise（价值下注）
    const isValueRaise = handStrength >= 0.55;
    // Raise（诈唬/半诈唬）
    const isSemibluff = drawEquity >= 0.25 && handStrength < 0.55;
    const isPureBluff = handStrength < 0.3 && drawEquity < 0.15 && position === 'late' && !ctx.isFacingBet;

    if (raiseEV > checkCallEV && (isValueRaise || isSemibluff)) {
      strategies.push({
        action: 'raise',
        frequency: isValueRaise ? 0.6 : 0.35,
        expectedValue: raiseEV,
        reasoning: this.postflopReason('raise', ctx, isValueRaise ? 'value' : 'semibluff')
      });
    } else if (isPureBluff && !ctx.isFacingBet && ctx.activeOpponents <= 2) {
      // GTO 诈唬频率：optimal bluff = value * α，简化用固定小概率
      const bluffFreq = Math.min(0.2, this.optimalBluffFrequency(riskAmount, potBeforeRaise));
      strategies.push({
        action: 'raise',
        frequency: bluffFreq,
        expectedValue: raiseEV,
        reasoning: this.postflopReason('raise', ctx, 'bluff')
      });
    }

    // 弃牌（作为混合选项）
    if (toCall > 0 && checkCallEV < pot * 0.05) {
      strategies.push({
        action: 'fold',
        frequency: 0.2,
        expectedValue: 0,
        reasoning: '也可以弃牌控制风险'
      });
    }

    if (strategies.length === 0) {
      strategies.push({
        action: toCall > 0 ? 'fold' : 'check',
        frequency: 1, expectedValue: 0,
        reasoning: '默认保守动作'
      });
    }

    return this.normalizeAndSort(strategies);
  }

  // ============================================================
  // Sizing 建议
  // ============================================================
  private static recommendRaiseSize(player: Player, gameState: GameState, ctx: DecisionContext): number {
    const bb = gameState.bigBlind;
    const potBeforeRaise = ctx.pot + ctx.toCall;

    if (gameState.phase === 'preflop') {
      if (ctx.toCall === 0) {
        // Open raise: 2.5-3bb
        return Math.min(player.chips + player.bet, bb * 2.5);
      }
      // 面对加注 → 3-bet 3x，4-bet 2.2x
      const raiseTier = this.classifyPreflopRaise(ctx.toCall, bb, ctx.pot);
      const mult = raiseTier === 'open' ? 3 : raiseTier === '3bet' ? 2.3 : 2.2;
      const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
      return Math.min(player.chips + player.bet, maxBet * mult);
    }

    // Postflop：按底池比例
    // - flop 强牌：66-75% pot
    // - flop 弱/半诈：50% pot
    // - turn：75%
    // - river 强牌：75-100%，polarized 时可 overbet
    let ratio: number;
    if (gameState.phase === 'flop') {
      ratio = ctx.handStrength >= 0.6 ? 0.66 : 0.5;
    } else if (gameState.phase === 'turn') {
      ratio = 0.75;
    } else {
      ratio = ctx.handStrength >= 0.7 ? 0.85 : 0.6;
    }
    const raiseAmount = potBeforeRaise * ratio;
    const totalBet = (ctx.toCall > 0 ? Math.max(...gameState.players.map(p => p.bet), 0) + raiseAmount : raiseAmount);
    return Math.min(player.chips + player.bet, Math.max(totalBet, bb * 2));
  }

  // ============================================================
  // 决策评估（供 UI 反馈玩家实际做出的动作）
  // ============================================================
  static analyzeDecision(
    playerAction: ActionType,
    player: Player,
    gameState: GameState,
    options: SolverOptions = {}
  ): DecisionAnalysis {
    const strategies = this.getStrategy(player, gameState, options);
    if (strategies.length === 0) {
      return { quality: 0.5, evLoss: 0, bestAction: playerAction, chosenEV: 0, feedback: '无可用策略参考' };
    }

    const bestEV = Math.max(...strategies.map(s => s.expectedValue));
    const bestAction = strategies.reduce((a, b) => a.expectedValue >= b.expectedValue ? a : b).action;

    const chosen = strategies.find(s => s.action === playerAction);
    let chosenEV: number;
    let inMix = false;
    if (chosen) {
      chosenEV = chosen.expectedValue;
      inMix = chosen.frequency > 0.05;
    } else {
      // 若玩家动作完全不在策略集，视为 EV=0（fold 视作 0，raise/call 若不在集里保守估 0）
      chosenEV = playerAction === 'fold' ? 0 : 0;
    }

    const evLoss = Math.max(0, bestEV - chosenEV);
    // quality: EV loss / |bestEV|，映射到 0~1
    const denom = Math.max(1, Math.abs(bestEV));
    let quality = Math.max(0, 1 - evLoss / denom);
    if (inMix) quality = Math.max(quality, 0.75);

    let feedback: string;
    let suggestion: string | undefined;
    if (playerAction === bestAction) {
      feedback = '✓ 最优决策，符合 GTO';
    } else if (inMix) {
      feedback = '○ 属于合理的混合策略选项';
      suggestion = `更优选择：${bestAction}（EV=${bestEV.toFixed(0)}）`;
    } else if (evLoss <= denom * 0.15) {
      feedback = '○ 小幅偏离最优，EV 损失较小';
      suggestion = `更优选择：${bestAction}（EV=${bestEV.toFixed(0)}，损失约 ${evLoss.toFixed(0)}）`;
    } else {
      feedback = '✗ 明显偏离最优决策';
      suggestion = `建议改为：${bestAction}（EV=${bestEV.toFixed(0)}，本次损失约 ${evLoss.toFixed(0)}）`;
    }

    return { quality, evLoss, bestAction, chosenEV, feedback, suggestion };
  }

  // ============================================================
  // 底层：牌力 / 权益 / EV 组件
  // ============================================================
  private static currentPot(gameState: GameState): number {
    const potAccum = gameState.pots.reduce((s, p) => s + p.amount, 0);
    const streetBets = gameState.players.reduce((s, p) => s + p.bet, 0);
    // 尽量避免重复计入：如果 pots 已经包含 bet，则不加 streetBets
    // 实际实现中 GameEngine 在结算街尾时才把 bet 归入 pots，因此这里两者相加更接近"面前底池"
    return potAccum + streetBets;
  }

  /** 成牌强度 0~1（不含听牌） */
  private static madeHandStrength(rank: HandRank, value: number): number {
    const base: Record<HandRank, number> = {
      [HandRank.HighCard]: 0.08,
      [HandRank.OnePair]: 0.32,
      [HandRank.TwoPair]: 0.58,
      [HandRank.ThreeOfAKind]: 0.75,
      [HandRank.Straight]: 0.85,
      [HandRank.Flush]: 0.90,
      [HandRank.FullHouse]: 0.96,
      [HandRank.FourOfAKind]: 0.99,
      [HandRank.StraightFlush]: 1.0,
      [HandRank.RoyalFlush]: 1.0
    };
    const bonus = ((value % 1000000) / 1000000) * 0.08;
    return Math.min(0.99, base[rank] + bonus);
  }

  /** 听牌兑现权益 */
  private static drawsToEquity(outs: number, phase: string): number {
    if (!outs || outs <= 0) return 0;
    // 经验法则：flop→river ~= outs * 4%；turn→river ~= outs * 2%
    const pct = phase === 'flop' ? outs * 0.04 : phase === 'turn' ? outs * 0.02 : 0;
    return Math.min(0.55, pct);
  }

  /** 综合权益：成牌 + 听牌 + 对手数衰减（成牌部分才受多人衰减） */
  private static combineEquity(handStrength: number, drawEquity: number, opps: number, phase: string): number {
    let made = handStrength;
    if (opps > 1 && phase !== 'preflop') {
      made = made * Math.pow(0.88, opps - 1);
    }
    // 听牌兑现率对多人下降更缓（我们中牌通常就赢）
    const draw = drawEquity * Math.pow(0.95, Math.max(0, opps - 1));
    // 不是简单相加：两者独立事件，取 P(A ∪ B) ≈ made + (1-made)*draw
    const combined = made + (1 - made) * draw;
    return Math.max(0.02, Math.min(0.98, combined));
  }

  /** 翻牌前强度（Chen 公式） */
  private static evaluatePreflopStrength(cards: Card[]): number {
    if (cards.length !== 2) return 0;
    const rankValues: Record<string, number> = {
      '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14
    };
    const val1 = rankValues[cards[0].rank];
    const val2 = rankValues[cards[1].rank];
    const isPair = val1 === val2;
    const isSuited = cards[0].suit === cards[1].suit;
    const high = Math.max(val1, val2);
    const low = Math.min(val1, val2);
    const gap = high - low;

    let score = high / 2;
    if (isPair) score = Math.max(5, high);
    if (isSuited) score += 2;
    if (gap === 1) score += 1;
    else if (gap === 2) score += 0;
    else if (gap === 3) score -= 2;
    else if (gap >= 4 && !isPair) score -= 4;
    return Math.min(1, Math.max(0.1, score / 12));
  }

  /** 估算 preflop 对手弃牌率（普通模式用通用公式，专家模式碰对手画像） */
  private static estimateOppFoldRate(
    alpha: number,
    tier: HandTier,
    raiseTier: string,
    player: Player,
    gameState: GameState,
    options: SolverOptions
  ): number {
    // 基础：α 越大对手越倾向弃牌
    let rate = 0.35 + alpha * 0.4;
    if (raiseTier === '3bet') rate -= 0.15;
    if (raiseTier === '4bet+') rate -= 0.25;
    rate = Math.max(0.15, Math.min(0.7, rate));

    if (options.mode !== 'expert') return rate;

    // 专家模式：逐对手取弃牌率，取均值
    const model = options.opponentModel || defaultOpponentModel;
    const opponents = gameState.players.filter(p =>
      p.id !== player.id && (p.status === 'active' || p.status === 'waiting' || p.status === 'all-in')
    );
    if (opponents.length === 0) return rate;
    let sum = 0, count = 0;
    for (const opp of opponents) {
      const r = model.estimateFoldRate(opp.id, alpha, 'preflop', { isThreeBet: raiseTier === '3bet' || raiseTier === '4bet+' });
      sum += r; count++;
    }
    const avg = count > 0 ? sum / count : rate;
    // 与统计 blend（防止对手样本太少）
    return 0.55 * avg + 0.45 * rate;
  }

  /** 估算 postflop 对手弃牌率 */
  private static estimatePostflopOppFold(
    alpha: number,
    phase: string,
    position: string,
    handStrength: number,
    player: Player,
    gameState: GameState,
    ctx: DecisionContext,
    options: SolverOptions
  ): number {
    let rate = 0.3 + alpha * 0.5;
    if (position === 'late') rate += 0.08;
    if (position === 'early') rate -= 0.05;
    if (phase === 'turn') rate -= 0.05;
    if (phase === 'river') rate -= 0.1;
    rate = Math.max(0.1, Math.min(0.75, rate));

    if (options.mode !== 'expert') return rate;

    const model = options.opponentModel || defaultOpponentModel;
    const opponents = gameState.players.filter(p =>
      p.id !== player.id && (p.status === 'active' || p.status === 'waiting' || p.status === 'all-in')
    );
    if (opponents.length === 0) return rate;
    // 判断是否为 c-bet：我是 preflop 最后加注者 & 当前是 flop 且未面对下注
    const preflopActs = (gameState.currentActions || []).filter(a => a.phase === 'preflop');
    let preflopAggressor: string | null = null;
    for (const a of preflopActs) if (a.action.type === 'raise' || a.action.type === 'all-in') preflopAggressor = a.playerId;
    const isCbet = phase === 'flop' && preflopAggressor === player.id && !ctx.isFacingBet;

    let sum = 0, count = 0;
    for (const opp of opponents) {
      const r = model.estimateFoldRate(opp.id, alpha, phase as any, { isCbet });
      sum += r; count++;
    }
    const avg = count > 0 ? sum / count : rate;
    return 0.6 * avg + 0.4 * rate;
  }

  /** GTO 诈唬频率 */
  private static optimalBluffFrequency(bet: number, pot: number): number {
    // Value : Bluff = pot+bet : bet（river）→ bluff 比例 = bet/(pot+2*bet)
    return bet / (pot + 2 * bet);
  }

  // ============================================================
  // 说辞
  // ============================================================
  private static preflopReason(action: string, tier: HandTier, position: string, raiseTier: string): string {
    const tierNames = ['垃圾牌', '边缘牌', '可玩牌', '好牌', '强牌', '顶级牌'];
    const posNames: Record<string, string> = { early: '前位', middle: '中位', late: '后位', blinds: '盲注位' };
    const t = tierNames[tier] || '未知';
    const p = posNames[position] || position;
    const rt = raiseTier === '3bet' ? '面对 3-bet' : raiseTier === '4bet+' ? '面对 4-bet' : raiseTier === 'open' ? '面对开池加注' : '';

    if (action === 'fold') return `${t} 在${p}${rt ? '，' + rt : ''}，牌力不足，弃牌`;
    if (action === 'check') return `${t} 在${p}，免费看翻牌`;
    if (action === 'call') return `${t} 在${p}${rt ? '，' + rt : ''}，跟注入池 / 看翻牌`;
    if (action === 'raise') {
      if (raiseTier === '3bet') return `${t} 4-bet 施压 / 建立价值范围`;
      if (raiseTier === '4bet+') return `${t} 5-bet / all-in 只玩最强范围`;
      if (raiseTier === 'open') return `${t} 3-bet 隔离与惩罚开池`;
      return `${t} 在${p} 开池加注`;
    }
    return '基于 GTO 混合策略';
  }

  private static postflopReason(action: ActionType, ctx: DecisionContext, kind?: 'value' | 'semibluff' | 'bluff'): string {
    const eq = (ctx.equity * 100).toFixed(0);
    const po = (ctx.potOdds * 100).toFixed(0);
    const pos = ctx.position === 'late' ? '后位' : ctx.position === 'early' ? '前位' : '中位';
    const hand = ctx.handName ? `【${ctx.handName}】` : '';

    switch (action) {
      case 'fold':
        return `${hand} 权益 ${eq}% < 底池赔率所需 ${po}%，跟注亏 EV`;
      case 'check':
        if (ctx.phase === 'river') {
          if (ctx.equity >= 0.7) return `${hand} ${eq}% 强牌，过牌诱导对手下注`;
          if (ctx.equity >= 0.45) return `${hand} ${eq}%，过牌控池`;
          return `${hand} ${eq}%，过牌放弃，尽量看摊牌`;
        }
        return `${hand} ${pos}，免费看下一街`;
      case 'call':
        return `${hand} 权益 ${eq}% ≥ 赔率所需 ${po}%，值得跟注`;
      case 'raise':
        if (kind === 'value') return `${hand} 强牌，${pos} 价值下注榨取更多筹码`;
        if (kind === 'semibluff') return `${hand} 半诈唬：既有听牌权益又能施压`;
        if (kind === 'bluff') return `${hand} 纯诈唬：${pos} 代表牌面偷底池`;
        return `${hand} 加注施压`;
      default:
        return '基于 GTO 混合策略';
    }
  }

  // ============================================================
  // 归一化
  // ============================================================
  private static normalizeAndSort(strategies: GTOStrategy[]): GTOStrategy[] {
    // 合并同一 action（如果因为价值+诈唬拆成了两条 raise，取其一）
    const merged = new Map<ActionType, GTOStrategy>();
    for (const s of strategies) {
      const cur = merged.get(s.action);
      if (!cur) merged.set(s.action, { ...s });
      else {
        // 取 EV 更高的说辞，频率相加
        const better = s.expectedValue > cur.expectedValue ? s : cur;
        merged.set(s.action, {
          action: s.action,
          frequency: cur.frequency + s.frequency,
          expectedValue: better.expectedValue,
          reasoning: better.reasoning
        });
      }
    }
    const list = Array.from(merged.values()).map(s => ({ ...s, frequency: Math.max(0, s.frequency) }));

    // 归一化频率
    const total = list.reduce((s, x) => s + x.frequency, 0);
    if (total > 0) list.forEach(s => s.frequency = s.frequency / total);

    // 按 EV 降序（教学时更易看出最优）
    return list.sort((a, b) => b.expectedValue - a.expectedValue);
  }
}
