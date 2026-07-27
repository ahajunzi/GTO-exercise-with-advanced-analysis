import { HandHistory, GameState, PlayerAction } from '../../types';

/**
 * 单个对手的行为画像（用于专家模式）
 * 完全从 currentActions / handHistory 里增量统计得来。
 */
export interface OpponentProfile {
  playerId: string;
  handsObserved: number;

  // 翻牌前 -----------------------------------------------------------------
  vpip: number;               // 主动入池率
  pfr: number;                // 翻牌前加注率
  threeBet: number;           // 3-bet 频率
  foldToThreeBet: number;     // 面对 3-bet 弃牌率

  // 翻牌后 -----------------------------------------------------------------
  cbet: number;               // 持续开火频率（作为翻牌前加注者，flop 下注）
  foldToCbet: number;         // 面对对手 c-bet 弃牌率
  aggression: number;         // (raise+bet)/call 的比值
  wtsd: number;               // Went To Show Down

  // 派生 -------------------------------------------------------------------
  style: 'unknown' | 'nit' | 'tag' | 'lag' | 'fish' | 'maniac' | 'calling-station';
}

const DEFAULT_PROFILE: Omit<OpponentProfile, 'playerId'> = {
  handsObserved: 0,
  vpip: 0, pfr: 0, threeBet: 0, foldToThreeBet: 0,
  cbet: 0, foldToCbet: 0, aggression: 1, wtsd: 0,
  style: 'unknown'
};

/**
 * 简单的增量画像库 —— 在结算后调用 `record(hand)`
 */
export class OpponentModel {
  private profiles = new Map<string, OpponentProfile>();

  getProfile(playerId: string): OpponentProfile {
    return this.profiles.get(playerId) || { playerId, ...DEFAULT_PROFILE };
  }

  getAll(): OpponentProfile[] {
    return Array.from(this.profiles.values());
  }

  reset(): void {
    this.profiles.clear();
  }

  /**
   * 结算一手后，用完整的手牌历史更新每个玩家的画像。
   */
  record(hand: HandHistory): void {
    for (const player of hand.players) {
      const prev = this.profiles.get(player.id) || { playerId: player.id, ...DEFAULT_PROFILE };
      const n = prev.handsObserved;
      const playerActions = hand.actions.filter(a => a.playerId === player.id);

      // 是否入池（跟或加）
      const putMoneyIn = playerActions.some(a =>
        a.phase === 'preflop' && (a.action.type === 'call' || a.action.type === 'raise' || a.action.type === 'all-in')
      );
      // 是否 preflop 加注
      const pfr = playerActions.some(a =>
        a.phase === 'preflop' && (a.action.type === 'raise' || a.action.type === 'all-in')
      );

      // 3-bet：preflop 中在别人已加注后又加注
      let threeBet = false;
      let facedRaisePreflop = false;
      let foldedToThreeBet = false;
      let raisesSeenPreflop = 0;
      for (const a of hand.actions) {
        if (a.phase !== 'preflop') continue;
        if (a.playerId === player.id) {
          if ((a.action.type === 'raise' || a.action.type === 'all-in') && raisesSeenPreflop >= 1) threeBet = true;
          if (raisesSeenPreflop >= 2 && a.action.type === 'fold') foldedToThreeBet = true;
        }
        if (a.action.type === 'raise' || a.action.type === 'all-in') {
          if (a.playerId !== player.id) facedRaisePreflop = raisesSeenPreflop >= 1 ? true : facedRaisePreflop;
          raisesSeenPreflop++;
        }
      }

      // c-bet：作为翻牌前加注者，是否在 flop 下注 / 加注
      const preflopAggressor = this.findLastAggressor(hand.actions.filter(a => a.phase === 'preflop'));
      const flopActions = hand.actions.filter(a => a.phase === 'flop');
      let cbet = false;
      let hadCbetChance = false;
      if (preflopAggressor === player.id && flopActions.length > 0) {
        hadCbetChance = true;
        const myFirstFlop = flopActions.find(a => a.playerId === player.id);
        if (myFirstFlop && (myFirstFlop.action.type === 'raise' || myFirstFlop.action.type === 'all-in')) cbet = true;
      }

      // fold to c-bet
      let foldToCbet = false;
      let facedCbet = false;
      if (preflopAggressor && preflopAggressor !== player.id) {
        const oppFlopBet = flopActions.find(a => a.playerId === preflopAggressor && (a.action.type === 'raise' || a.action.type === 'all-in'));
        if (oppFlopBet) {
          facedCbet = true;
          const myResponse = flopActions.find(a =>
            a.playerId === player.id && a.action.timestamp > oppFlopBet.action.timestamp
          );
          if (myResponse && myResponse.action.type === 'fold') foldToCbet = true;
        }
      }

      // 攻击性
      const raises = playerActions.filter(a => a.action.type === 'raise' || a.action.type === 'all-in').length;
      const calls = playerActions.filter(a => a.action.type === 'call').length;
      const currentAgg = calls > 0 ? raises / calls : raises;

      // 摊牌
      const wentToShowdown = hand.actions.some(a =>
        a.playerId === player.id && a.phase === 'river' && a.action.type !== 'fold'
      );

      // 增量平均（滚动累积）
      const update = (prevRate: number, occurred: boolean, hadChance = true) => {
        if (!hadChance) return prevRate;
        return (prevRate * n + (occurred ? 1 : 0)) / (n + 1);
      };

      const next: OpponentProfile = {
        playerId: player.id,
        handsObserved: n + 1,
        vpip: update(prev.vpip, putMoneyIn),
        pfr: update(prev.pfr, pfr),
        threeBet: update(prev.threeBet, threeBet),
        foldToThreeBet: facedRaisePreflop ? update(prev.foldToThreeBet, foldedToThreeBet) : prev.foldToThreeBet,
        cbet: hadCbetChance ? update(prev.cbet, cbet) : prev.cbet,
        foldToCbet: facedCbet ? update(prev.foldToCbet, foldToCbet) : prev.foldToCbet,
        aggression: (prev.aggression * n + currentAgg) / (n + 1),
        wtsd: update(prev.wtsd, wentToShowdown),
        style: 'unknown'
      };
      next.style = this.classifyStyle(next);
      this.profiles.set(player.id, next);
    }
  }

  private findLastAggressor(actions: HandHistory['actions']): string | null {
    let last: string | null = null;
    for (const a of actions) {
      if (a.action.type === 'raise' || a.action.type === 'all-in') last = a.playerId;
    }
    return last;
  }

  private classifyStyle(p: OpponentProfile): OpponentProfile['style'] {
    if (p.handsObserved < 8) return 'unknown';
    const { vpip, pfr, aggression } = p;
    // 经典 tracker 分类
    if (vpip < 0.18 && pfr < 0.12) return 'nit';                       // 极紧
    if (vpip < 0.28 && pfr / Math.max(vpip, 0.01) > 0.7) return 'tag'; // 紧凶
    if (vpip > 0.35 && pfr / Math.max(vpip, 0.01) > 0.6) return 'lag'; // 松凶
    if (vpip > 0.45 && aggression > 2.5) return 'maniac';              // 疯狂
    if (vpip > 0.35 && pfr / Math.max(vpip, 0.01) < 0.35) return 'calling-station'; // 跟注站
    return 'fish';                                                     // 其他随手玩
  }

  /**
   * 估算指定对手在"面对下注"时的弃牌率（供 GTOSolver 专家模式）
   * @param alpha 下注/(pot+bet) 比例
   * @param phase 当前街
   * @param context 附加：是否是 c-bet、面对 3-bet 等
   */
  estimateFoldRate(
    playerId: string,
    alpha: number,
    phase: 'preflop' | 'flop' | 'turn' | 'river',
    context?: { isCbet?: boolean; isThreeBet?: boolean }
  ): number {
    const p = this.getProfile(playerId);
    if (p.handsObserved < 5) {
      // 数据不足退回到"标准"估计
      return Math.max(0.15, Math.min(0.7, 0.3 + alpha * 0.45));
    }

    // 用专属统计
    if (phase === 'preflop' && context?.isThreeBet && p.foldToThreeBet > 0) {
      return this.blend(p.foldToThreeBet, alpha);
    }
    if (phase === 'flop' && context?.isCbet && p.foldToCbet > 0) {
      return this.blend(p.foldToCbet, alpha);
    }

    // 通用：wtsd 越高越粘 → 越不弃；aggression 越高说明进攻多 => call 也多
    let base = 0.4;
    base -= (p.wtsd - 0.28) * 0.6;                 // wtsd 高 → base 降
    base -= Math.max(0, p.vpip - 0.3) * 0.35;      // 松玩家不弃
    base += Math.max(0, 0.18 - p.vpip) * 0.6;      // 紧玩家更愿弃

    // α 修正
    base += (alpha - 0.5) * 0.35;
    return Math.max(0.05, Math.min(0.85, base));
  }

  private blend(observed: number, alpha: number): number {
    // 根据下注大小微调（越大越可能弃）
    const adj = observed + (alpha - 0.5) * 0.2;
    return Math.max(0.05, Math.min(0.9, adj));
  }
}

/** 全局单例 —— 供 gameStore 累积统计 */
export const opponentModel = new OpponentModel();
