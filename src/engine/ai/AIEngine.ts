import { Player, GameState, AIDecision, GTOStrategy } from '../../types';
import { AI_STYLES } from '../../types/aiStyle';
import { opponentModel } from '../gto/OpponentModel';
import { GTOSolver } from '../gto/GTOSolver';

export class AIEngine {
  // 获取AI决策
  //
  // ⭐ 核心策略：直接复用 GTOSolver（与 UI 侧边的 AI 助理同源），
  // 这样 AI 玩家的行动会与助理的建议完全一致。
  // 风格差异通过在多个候选中的偏好轻微加权实现，而不是走另一套决策系统。
  static getDecision(player: Player, gameState: GameState): AIDecision {
    if (!player.difficulty) {
      return { action: 'fold', amount: 0, confidence: 0 };
    }

    const styleConfig = player.aiStyle ? AI_STYLES[player.aiStyle] : AI_STYLES.TAG;

    // 1. 拿到 GTO 助理同款的策略分布 + 推荐加注量
    const analysis = GTOSolver.getFullAnalysis(player, gameState, { opponentModel });
    const { strategies, recommendedRaiseSize } = analysis;

    // Solver 兜底：极端异常场景（正常游戏不会走到）
    if (!strategies || strategies.length === 0) {
      const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
      const callAmount = Math.max(0, maxBet - player.bet);
      return {
        action: callAmount === 0 ? 'check' : 'call',
        amount: callAmount,
        confidence: 0.5,
        thinking: '策略计算异常，采用安全动作'
      };
    }

    // 1.5 【安全阀】剔除不合理的 fold：
    // - 免费入池（toCall === 0）：绝对不能 fold，check/call 就行
    // - 面对极小下注（toCall <= 1 BB，例如盲注补差）：也不 fold，除非牌真的极烂
    const maxBet0 = Math.max(...gameState.players.map(p => p.bet), 0);
    const toCall0 = Math.max(0, maxBet0 - player.bet);
    const bb = gameState.bigBlind;
    let sanitized = strategies;
    if (toCall0 === 0) {
      // 免费看牌，绝不弃
      sanitized = strategies.filter(s => s.action !== 'fold');
    } else if (toCall0 <= bb) {
      // 补差/最小加注：把 fold 权重压到 0（几乎不弃）
      sanitized = strategies.map(s =>
        s.action === 'fold' ? { ...s, frequency: 0 } : s
      );
    }
    // 全部被过滤 → 兜底 check/call
    if (sanitized.length === 0 || sanitized.every(s => s.frequency <= 0)) {
      return {
        action: toCall0 === 0 ? 'check' : 'call',
        amount: toCall0,
        confidence: 0.9,
        thinking: '免费/微跟场景，不应弃牌'
      };
    }

    // 2. 按风格微调 frequency（不改变主推荐、只影响 mix 中的偏好）
    const tunedStrategies = this.tuneStrategiesByStyle(sanitized, styleConfig);

    // 3. 按 frequency 采样，得到最终 action
    const chosen = this.sampleFromStrategies(tunedStrategies);

    // 4. 计算实际金额
    return this.strategyToDecision(chosen, player, gameState, recommendedRaiseSize, styleConfig);
  }

  /**
   * 按 AI 风格微调策略频率（保留个性但不背离 GTO）
   * - TAG/LAG（高攻击）：raise 权重 +20%
   * - LAP/TAP（低攻击）：call 权重 +15%
   * - LAG/LAP（松）：fold 权重 -15%
   * - TAG/nit（紧）：fold 权重 +10%
   */
  private static tuneStrategiesByStyle(
    strategies: GTOStrategy[],
    style: typeof AI_STYLES.TAG
  ): GTOStrategy[] {
    const tuned: GTOStrategy[] = strategies.map(s => {
      let f = s.frequency;
      if (s.action === 'raise' || s.action === 'all-in') {
        f *= 1 + (style.aggression - 1.5) * 0.15; // 攻击性影响 raise 频率
      }
      if (s.action === 'call' || s.action === 'check') {
        if (style.aggression < 1.5) f *= 1.12;
      }
      if (s.action === 'fold') {
        // vpip 高 => 少弃；vpip 低 => 多弃
        f *= 1 + (0.28 - style.vpip) * 0.5;
      }
      return { ...s, frequency: Math.max(0, f) };
    });

    // 归一化
    const sum = tuned.reduce((a, s) => a + s.frequency, 0);
    if (sum <= 0) return strategies;
    return tuned.map(s => ({ ...s, frequency: s.frequency / sum }));
  }

  /** 按策略频率采样 */
  private static sampleFromStrategies(strategies: GTOStrategy[]): GTOStrategy {
    const r = Math.random();
    let acc = 0;
    for (const s of strategies) {
      acc += s.frequency;
      if (r <= acc) return s;
    }
    return strategies[strategies.length - 1];
  }

  /**
   * 将选中的策略转换为最终的 AIDecision（含具体金额）
   */
  private static strategyToDecision(
    strategy: GTOStrategy,
    player: Player,
    gameState: GameState,
    recommendedRaiseSize: number,
    style: typeof AI_STYLES.TAG
  ): AIDecision {
    const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
    const callAmount = Math.max(0, maxBet - player.bet);
    const confidence = Math.min(1, 0.55 + strategy.frequency * 0.45);

    if (strategy.action === 'fold') {
      return {
        action: 'fold',
        amount: 0,
        confidence,
        thinking: strategy.reasoning || 'GTO 建议弃牌'
      };
    }

    if (strategy.action === 'call' || strategy.action === 'check') {
      if (callAmount === 0) {
        return { action: 'check', amount: 0, confidence, thinking: strategy.reasoning || 'GTO 建议过牌' };
      }
      const amt = Math.min(callAmount, player.chips);
      if (amt >= player.chips) {
        return { action: 'all-in', amount: player.chips, confidence, thinking: 'All-in 跟注' };
      }
      return { action: 'call', amount: amt, confidence, thinking: strategy.reasoning || 'GTO 建议跟注' };
    }

    if (strategy.action === 'all-in') {
      return {
        action: 'all-in',
        amount: player.chips,
        confidence,
        thinking: strategy.reasoning || 'GTO 建议 all-in'
      };
    }

    // raise：使用 solver 推荐的加注量，风格微调 ±10%
    if (strategy.action === 'raise') {
      const sizeMultiplier = 0.95 + (style.aggression - 1.5) * 0.06; // 0.86 ~ 1.04
      let amount = Math.round(recommendedRaiseSize * sizeMultiplier);

      // 保证合法：不小于 minRaise、不大于 chips
      const minLegal = Math.max(gameState.minRaise, maxBet + gameState.bigBlind);
      amount = Math.max(amount, minLegal);
      amount = Math.min(amount, player.chips);

      if (amount >= player.chips) {
        return {
          action: 'all-in',
          amount: player.chips,
          confidence,
          thinking: strategy.reasoning || 'GTO 建议 all-in'
        };
      }

      return {
        action: 'raise',
        amount,
        confidence,
        thinking: strategy.reasoning || 'GTO 建议加注'
      };
    }

    // 兜底
    return { action: 'fold', amount: 0, confidence: 0.5, thinking: '未知策略' };
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
