import { GameState, Player, Card, GamePhase, PlayerAction, ActionType, Pot, GameConfig, HandHistory } from '../../types';
import { createDeck, shuffleDeck, dealCards } from '../../utils/deck';
import { evaluateHand, compareHands } from '../../utils/handEvaluator';
import { assignRandomStyle } from '../../types/aiStyle';

export class GameEngine {
  private state: GameState;
  private currentHandActions: Array<{
    playerId: string;
    action: PlayerAction;
    phase: GamePhase;
  }> = [];
  private raiseCountThisRound: number = 0; // 当前回合的加注次数
  private readonly MAX_RAISES_PER_ROUND = 4; // 每轮最多允许4次加注

  constructor(config: GameConfig) {
    this.state = this.initializeGame(config);
  }

  // 初始化游戏
  private initializeGame(config: GameConfig): GameState {
    const players: Player[] = [];
    
    // 创建玩家
    for (let i = 0; i < config.playerCount; i++) {
      const isAI = i !== 0;
      const aiStyle = isAI ? assignRandomStyle(config.aiDifficulty) : undefined;
      
      players.push({
        id: `player-${i}`,
        name: i === 0 ? '你' : `AI ${i}`,
        type: i === 0 ? 'human' : 'ai',
        difficulty: i === 0 ? undefined : config.aiDifficulty,
        aiStyle: aiStyle,
        chips: config.startingChips,
        bet: 0,
        cards: [],
        status: 'waiting',
        position: i,
        hasActed: false,
        isDealer: i === 0,
        isSmallBlind: i === 1 % config.playerCount,
        isBigBlind: i === 2 % config.playerCount,
      });
    }

    console.log('[GameEngine] Players initialized with styles:', 
      players.filter(p => p.type === 'ai').map(p => ({ name: p.name, style: p.aiStyle }))
    );

    return {
      id: `game-${Date.now()}`,
      players,
      board: [],
      pots: [{ amount: 0, eligiblePlayers: players.map(p => p.id) }],
      currentPlayerIndex: 3 % config.playerCount,
      dealerIndex: 0,
      smallBlindIndex: 1 % config.playerCount,
      bigBlindIndex: 2 % config.playerCount,
      phase: 'preflop',
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      minRaise: config.bigBlind,
      lastRaise: config.bigBlind,
      deck: shuffleDeck(createDeck()),
      history: [],
    };
  }

  // 开始新一局
  startNewHand(): void {
    console.log('[GameEngine] ===== Starting new hand =====');
    
    // 重置当前手牌的行动记录和加注计数
    this.currentHandActions = [];
    this.raiseCountThisRound = 0;
    
    const deck = shuffleDeck(createDeck());
    
    // 重置玩家状态
    this.state.players.forEach(player => {
      player.cards = [];
      player.bet = 0;
      player.status = player.chips > 0 ? 'waiting' : 'out';
      player.hasActed = false;
    });

    // 移动庄家位置
    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.smallBlindIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.bigBlindIndex = (this.state.dealerIndex + 2) % this.state.players.length;
    this.state.currentPlayerIndex = (this.state.dealerIndex + 3) % this.state.players.length;

    console.log('[GameEngine] Positions:', {
      dealer: this.state.dealerIndex,
      sb: this.state.smallBlindIndex,
      bb: this.state.bigBlindIndex,
      current: this.state.currentPlayerIndex,
      totalPlayers: this.state.players.length
    });

    // 更新盲注位置标记
    this.state.players.forEach((player, index) => {
      player.isDealer = index === this.state.dealerIndex;
      player.isSmallBlind = index === this.state.smallBlindIndex;
      player.isBigBlind = index === this.state.bigBlindIndex;
    });

    // 发底牌
    let currentDeck = deck;
    this.state.players.forEach(player => {
      if (player.status !== 'out') {
        const { dealt, remaining } = dealCards(currentDeck, 2);
        player.cards = dealt;
        currentDeck = remaining;
        player.status = 'active';
      }
    });

    console.log('[GameEngine] Players after dealing:', this.state.players.map(p => ({
      name: p.name,
      status: p.status,
      chips: p.chips,
      cards: p.cards.length
    })));

    // 收取盲注
    this.collectBlinds();

    this.state.deck = currentDeck;
    this.state.board = [];
    this.state.phase = 'preflop';
    this.state.pots = [{ amount: 0, eligiblePlayers: this.state.players.filter(p => p.status !== 'out').map(p => p.id) }];
    this.state.showdownResults = undefined; // 清除上一局的结算结果

    // 关键兜底：如果起始 currentPlayer 因盲注 all-in 或其他原因不可行动，
    // 需要跳到下一个可行动玩家；若全无可行动玩家，直接快进摊牌
    this.skipToNextActionablePlayer();

    console.log('[GameEngine] Hand started, current player index:', this.state.currentPlayerIndex);
    console.log('[GameEngine] Current player:', this.state.players[this.state.currentPlayerIndex]?.name);
  }

  // 从当前 currentPlayerIndex 起，跳到下一个可行动玩家；若无人可行动则快进摊牌
  private skipToNextActionablePlayer(): void {
    const playerCount = this.state.players.length;
    let idx = this.state.currentPlayerIndex;
    let attempts = 0;
    while (attempts < playerCount) {
      const p = this.state.players[idx];
      if (p && (p.status === 'active' || p.status === 'waiting')) {
        this.state.currentPlayerIndex = idx;
        return;
      }
      idx = (idx + 1) % playerCount;
      attempts++;
    }
    // 遍历一圈也没找到可行动玩家（例如所有非弃牌者都 all-in）
    console.warn('[GameEngine] No actionable player at start, fast-forwarding');
    // 检查手牌中还剩几人
    const playersInHand = this.state.players.filter(p =>
      p.status !== 'folded' && p.status !== 'out'
    );
    if (playersInHand.length >= 2) {
      this.fastForwardToShowdown();
    } else if (playersInHand.length === 1) {
      // 只剩一人（其他都 fold/out），直接结算
      this.fastForwardToShowdown();
    }
  }

  // 收取盲注
  private collectBlinds(): void {
    const sbPlayer = this.state.players[this.state.smallBlindIndex];
    const bbPlayer = this.state.players[this.state.bigBlindIndex];

    if (sbPlayer && sbPlayer.status !== 'out') {
      const sbAmount = Math.min(sbPlayer.chips, this.state.smallBlind);
      sbPlayer.chips -= sbAmount;
      sbPlayer.bet = sbAmount;
      if (sbPlayer.chips === 0) sbPlayer.status = 'all-in';
    }

    if (bbPlayer && bbPlayer.status !== 'out') {
      const bbAmount = Math.min(bbPlayer.chips, this.state.bigBlind);
      bbPlayer.chips -= bbAmount;
      bbPlayer.bet = bbAmount;
      if (bbPlayer.chips === 0) bbPlayer.status = 'all-in';
    }

    this.state.minRaise = this.state.bigBlind * 2;
    this.state.lastRaise = this.state.bigBlind;
  }

  // 执行玩家动作
  executeAction(playerId: string, action: PlayerAction): boolean {
    console.log('[GameEngine] executeAction called:', playerId, action.type);
    
    const player = this.state.players.find(p => p.id === playerId);
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    
    if (!player) {
      console.error('[GameEngine] Player not found:', playerId);
      return false;
    }
    
    if (player.id !== currentPlayer?.id) {
      console.error('[GameEngine] Not current player:', {
        playerId: player.id,
        currentPlayerId: currentPlayer?.id
      });
      return false;
    }

    console.log('[GameEngine] Executing action for:', player.name);
    
    // 记录行动到历史
    this.currentHandActions.push({
      playerId,
      action,
      phase: this.state.phase
    });
    
    // 标记玩家已行动（关键修复）
    player.hasActed = true;

    switch (action.type) {
      case 'fold':
        player.status = 'folded';
        break;

      case 'check':
        if (player.bet < this.getMaxBet()) {
          console.error('[GameEngine] Cannot check, bet mismatch');
          return false;
        }
        break;

      case 'call':
        const callAmount = Math.min(this.getMaxBet() - player.bet, player.chips);
        player.chips -= callAmount;
        player.bet += callAmount;
        if (player.chips === 0) player.status = 'all-in';
        break;

      case 'raise':
        // 检查加注次数限制
        if (this.raiseCountThisRound >= this.MAX_RAISES_PER_ROUND) {
          console.warn('[GameEngine] Max raises reached this round, converting to call');
          // 超过限制，转为跟注
          const callAmount = Math.min(this.getMaxBet() - player.bet, player.chips);
          player.chips -= callAmount;
          player.bet += callAmount;
          if (player.chips === 0) player.status = 'all-in';
          break;
        }

        const oldMaxBetForRaise = this.getMaxBet();
        const raiseAmount = Math.min(action.amount, player.chips);
        if (raiseAmount < this.state.minRaise && player.chips > this.state.minRaise) {
          console.error('[GameEngine] Raise amount too small');
          return false;
        }
        player.chips -= raiseAmount;
        player.bet += raiseAmount;
        // 修复：lastRaise = 新最高注 - 旧最高注（即本次加注的净增量）
        this.state.lastRaise = Math.max(this.state.bigBlind, player.bet - oldMaxBetForRaise);
        this.state.minRaise = player.bet + this.state.lastRaise;
        if (player.chips === 0) player.status = 'all-in';

        // 增加加注计数
        this.raiseCountThisRound++;

        // 关键修复：重置其他活跃玩家的hasActed，因为有人加注了，他们需要重新决策
        this.state.players.forEach(p => {
          if (p.id !== player.id && (p.status === 'active' || p.status === 'waiting')) {
            p.hasActed = false;
          }
        });
        break;

      case 'all-in':
        const allInAmount = player.chips;
        const oldMaxBet = this.getMaxBet();
        player.bet += allInAmount;
        player.chips = 0;
        player.status = 'all-in';
        
        // 如果all-in金额超过了当前最大下注，相当于加注，需要重置其他玩家的hasActed
        if (player.bet > oldMaxBet) {
          this.state.players.forEach(p => {
            if (p.id !== player.id && (p.status === 'active' || p.status === 'waiting')) {
              p.hasActed = false;
            }
          });
        }
        break;
    }

    console.log('[GameEngine] Action executed, moving to next player');
    this.moveToNextPlayer();
    return true;
  }

  // 移动到下一个玩家
  private moveToNextPlayer(): void {
    console.log('[GameEngine] moveToNextPlayer called');

    // 能行动的玩家（不含 all-in、folded、out）
    const activePlayers = this.state.players.filter(p =>
      p.status === 'active' || p.status === 'waiting'
    );

    // 还在手牌中的玩家（含 all-in，不含 folded/out）
    const playersInHand = this.state.players.filter(p =>
      p.status !== 'folded' && p.status !== 'out'
    );

    console.log('[GameEngine] Active players:', activePlayers.length, 'Players in hand:', playersInHand.length);

    // 场景1：只剩 1 名或 0 名玩家还在手牌中（其他人都弃牌了）→ 直接结算
    if (playersInHand.length <= 1) {
      console.log('[GameEngine] Only 1 or less players in hand, going to showdown');
      this.fastForwardToShowdown();
      return;
    }

    // 场景2：没有任何人还能行动（全部 all-in），直接快进到摊牌
    if (activePlayers.length === 0) {
      console.log('[GameEngine] No actionable players, fast-forwarding to showdown');
      this.fastForwardToShowdown();
      return;
    }

    // 场景3：只剩 1 人能行动，且此人已经无需再面对下注（等于最高注 或 其他人全 all-in）
    //         → 无需再让他做决策，直接快进
    if (activePlayers.length === 1) {
      const lonePlayer = activePlayers[0];
      const maxBet = this.getMaxBet();
      // 独苗玩家的下注已达到最高注，或所有对手都 all-in 了：无法再有意义地行动
      if (lonePlayer.bet >= maxBet || lonePlayer.hasActed) {
        console.log('[GameEngine] Only 1 actionable player left, fast-forwarding to showdown');
        this.fastForwardToShowdown();
        return;
      }
      // 否则允许该玩家 call / fold 后续继续走正常流程
    }

    // 场景4：当前轮全部行动完毕 → 推进到下一阶段
    if (this.isRoundComplete()) {
      console.log('[GameEngine] Round complete, advancing phase');
      this.advancePhase();
      // 推进后如果只剩单人或全 all-in，会在下面的兜底再兜一次
      this.ensureNotStuck();
      return;
    }

    // 场景5：普通推进到下一个可行动玩家
    let nextIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
    let attempts = 0;
    while (
      this.state.players[nextIndex].status !== 'active' &&
      this.state.players[nextIndex].status !== 'waiting' &&
      attempts < this.state.players.length
    ) {
      nextIndex = (nextIndex + 1) % this.state.players.length;
      attempts++;
    }

    // 兜底：如果一圈都没找到可行动玩家，强制快进摊牌
    if (attempts >= this.state.players.length) {
      console.warn('[GameEngine] No active player found after full loop, fast-forwarding');
      this.fastForwardToShowdown();
      return;
    }

    this.state.currentPlayerIndex = nextIndex;
    console.log('[GameEngine] Next player:', this.state.players[nextIndex].name, 'index:', nextIndex);
  }

  // 快进到摊牌：处理所有 all-in 或只剩单人的情形，保证一定能推进到 showdown
  private fastForwardToShowdown(): void {
    let safety = 10; // 最多推进 5 个阶段，10 次是绝对安全上限
    while (this.state.phase !== 'showdown' && safety-- > 0) {
      this.advancePhase();
    }
    if (this.state.phase !== 'showdown') {
      // 兜底：无论如何都要走到 showdown
      console.error('[GameEngine] fastForwardToShowdown could not reach showdown after 10 iterations, forcing showdown');
      this.state.phase = 'showdown';
      this.showdown();
    }
  }

  // 兜底检查：advancePhase 后如果发现没人能行动了，继续快进
  private ensureNotStuck(): void {
    if (this.state.phase === 'showdown') return;
    const activePlayers = this.state.players.filter(p =>
      p.status === 'active' || p.status === 'waiting'
    );
    const playersInHand = this.state.players.filter(p =>
      p.status !== 'folded' && p.status !== 'out'
    );
    // 没人能行动，或只剩一个人在手牌中 → 快进
    if (activePlayers.length === 0 || playersInHand.length <= 1) {
      this.fastForwardToShowdown();
    }
  }

  // 检查当前轮是否完成
  private isRoundComplete(): boolean {
    const activePlayers = this.state.players.filter(p => 
      p.status === 'active' || p.status === 'waiting'
    );
    
    if (activePlayers.length === 0) return true;

    const maxBet = this.getMaxBet();
    
    // 关键修复：所有活跃玩家必须：
    // 1. 下注额等于最大下注（或 all-in）
    // 2. 并且已经在当前轮行动过
    return activePlayers.every(p => 
      (p.bet === maxBet || p.status === 'all-in') && p.hasActed
    );
  }

  // 推进游戏阶段
  private advancePhase(): void {
    // 先收集当前轮的下注到底池
    this.collectPot();
    
    // 重置加注计数
    this.raiseCountThisRound = 0;

    // 检查是否只剩一个活跃玩家（其他人都弃牌了）
    const activePlayers = this.state.players.filter(p => 
      p.status !== 'folded' && p.status !== 'out'
    );

    if (activePlayers.length === 1) {
      // 只剩一个玩家，直接获胜（其他人都弃牌了）
      this.state.phase = 'showdown';
      const winner = activePlayers[0];
      const totalPot = this.state.pots.reduce((sum, pot) => sum + pot.amount, 0);
      winner.chips += totalPot;
      this.state.pots = [{ amount: 0, eligiblePlayers: [] }];

      // 生成 showdownResults，只包含未弃牌的玩家（供 UI 结算面板 + 弃牌灰暗判断使用）
      this.state.showdownResults = [
        {
          player: winner,
          hand: evaluateHand([...winner.cards, ...this.state.board]),
          winAmount: totalPot,
          isWinner: true,
        },
      ];

      // 重置玩家状态为 waiting（但保留 'folded'，让 UI 结算面板能识别弃牌玩家用于灰暗展示）
      // 真正的 status 重置会在下一手 startNewHand() 里发生
      this.state.players.forEach(player => {
        if (player.status !== 'out' && player.status !== 'folded') {
          player.status = 'waiting';
        }
      });

      return;
    }

    // 重置玩家下注和行动状态
    this.state.players.forEach(player => {
      if (player.status === 'active' || player.status === 'waiting') {
        player.status = 'active';
      }
      player.bet = 0;
      player.hasActed = false; // 新阶段重置行动标志
    });

    // 推进阶段
    switch (this.state.phase) {
      case 'preflop':
        this.dealFlop();
        this.state.phase = 'flop';
        break;
      case 'flop':
        this.dealTurn();
        this.state.phase = 'turn';
        break;
      case 'turn':
        this.dealRiver();
        this.state.phase = 'river';
        break;
      case 'river':
        this.state.phase = 'showdown';
        this.showdown();
        return; // showdown后不需要设置下一个玩家
    }

    // 重置当前玩家为庄家后第一个活跃玩家
    let nextPlayerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    let attempts = 0;
    while (
      this.state.players[nextPlayerIndex].status !== 'active' &&
      attempts < this.state.players.length
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % this.state.players.length;
      attempts++;
    }

    // 如果找不到活跃玩家，说明游戏已结束，保持当前索引
    if (attempts >= this.state.players.length) {
      console.warn('No active players found after phase advance');
      return;
    }

    this.state.currentPlayerIndex = nextPlayerIndex;
    this.state.minRaise = this.state.bigBlind;
    this.state.lastRaise = 0;
  }

  // 发翻牌
  private dealFlop(): void {
    const { dealt, remaining } = dealCards(this.state.deck, 3);
    this.state.board = dealt;
    this.state.deck = remaining;
  }

  // 发转牌
  private dealTurn(): void {
    const { dealt, remaining } = dealCards(this.state.deck, 1);
    this.state.board.push(dealt[0]);
    this.state.deck = remaining;
  }

  // 发河牌
  private dealRiver(): void {
    const { dealt, remaining } = dealCards(this.state.deck, 1);
    this.state.board.push(dealt[0]);
    this.state.deck = remaining;
  }

  // 收集底池：把所有玩家的 bet 归集到底池，并清零 bet（避免同一笔筹码被重复收集）
  private collectPot(): void {
    const totalBet = this.state.players.reduce((sum, p) => sum + p.bet, 0);
    if (totalBet <= 0) return;
    this.state.pots[0].amount += totalBet;
    // 关键修复：collectPot 必须清零 bet，否则 river→showdown 时会重复收集
    this.state.players.forEach(p => { p.bet = 0; });
  }

  // 摊牌
  private showdown(): void {
    console.log('[GameEngine] ===== Showdown =====');
    const activePlayers = this.state.players.filter(p => 
      p.status !== 'folded' && p.status !== 'out'
    );

    console.log('[GameEngine] Active players for showdown:', activePlayers.map(p => ({
      name: p.name,
      status: p.status,
      cards: p.cards,
      chips: p.chips
    })));

    if (activePlayers.length === 0) return;

    // 收集最后一轮的下注
    this.collectPot();

    console.log('[GameEngine] Board cards:', this.state.board);
    console.log('[GameEngine] Total pot:', this.state.pots.reduce((sum, pot) => sum + pot.amount, 0));

    // 评估每个玩家的手牌
    const evaluations = activePlayers.map(player => {
      const hand = evaluateHand([...player.cards, ...this.state.board]);
      console.log('[GameEngine] Player hand evaluation:', {
        player: player.name,
        cards: player.cards,
        handName: hand.name,
        handRank: hand.rank,
        handValue: hand.value
      });
      return {
        player,
        hand
      };
    });

    // 找出最好的手牌
    evaluations.sort((a, b) => compareHands(b.hand, a.hand));

    // 分配底池
    const totalPot = this.state.pots.reduce((sum, pot) => sum + pot.amount, 0);
    const winners = evaluations.filter(e => 
      compareHands(e.hand, evaluations[0].hand) === 0
    );

    console.log('[GameEngine] Winners:', winners.map(w => w.player.name));

    const winAmount = Math.floor(totalPot / winners.length);
    
    // 存储结算结果
    this.state.showdownResults = evaluations.map(({ player, hand }) => {
      const isWinner = winners.some(w => w.player.id === player.id);
      if (isWinner) {
        player.chips += winAmount;
      }
      return {
        player,
        hand,
        winAmount: isWinner ? winAmount : 0,
        isWinner
      };
    });

    // 清空底池
    this.state.pots = [{ amount: 0, eligiblePlayers: [] }];
    
    // 重置玩家状态为 waiting（但保留 'folded'，让 UI 结算面板能识别弃牌玩家用于灰暗展示）
    // 真正的 status 重置会在下一手 startNewHand() 里发生
    this.state.players.forEach(player => {
      if (player.status !== 'out' && player.status !== 'folded') {
        player.status = 'waiting';
      }
    });
    
    console.log('[GameEngine] ===== Showdown complete =====');
  }

  // 获取当前最大下注
  private getMaxBet(): number {
    return Math.max(...this.state.players.map(p => p.bet), 0);
  }

  // 获取游戏状态
  getState(): GameState {
    // 深拷贝关键数组，确保引用变化能触发 React 更新
    return {
      ...this.state,
      players: this.state.players.map(p => ({
        ...p,
        cards: [...p.cards]
      })),
      board: [...this.state.board],
      pots: this.state.pots.map(pot => ({
        ...pot,
        eligiblePlayers: [...pot.eligiblePlayers]
      })),
      // 暴露当前手行动记录给AI进行诈唬/对手建模决策
      currentActions: this.currentHandActions.map(a => ({ ...a }))
    };
  }

  // 获取当前玩家
  getCurrentPlayer(): Player | undefined {
    // 摊牌阶段没有当前玩家
    if (this.state.phase === 'showdown') {
      console.log('[GameEngine] Phase is showdown, no current player');
      return undefined;
    }
    
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    
    if (!currentPlayer) {
      console.error('[GameEngine] No player at current index:', this.state.currentPlayerIndex);
      return undefined;
    }
    
    console.log('[GameEngine] getCurrentPlayer:', {
      name: currentPlayer.name,
      status: currentPlayer.status,
      index: this.state.currentPlayerIndex
    });
    
    // 返回当前玩家（不过滤状态，让调用方决定如何处理）
    return currentPlayer;
  }

  // 获取可用动作
  getAvailableActions(playerId: string): ActionType[] {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.status !== 'active') return [];

    const actions: ActionType[] = ['fold'];
    const maxBet = this.getMaxBet();

    if (player.bet === maxBet) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    if (player.chips > 0) {
      actions.push('raise');
      actions.push('all-in');
    }

    return actions;
  }

  // 获取当前手牌历史
  getCurrentHandHistory(): HandHistory | null {
    if (!this.state.showdownResults) return null;

    return {
      id: this.state.id,
      timestamp: Date.now(),
      players: this.state.players.map(p => ({ ...p })),
      board: [...this.state.board],
      pots: this.state.pots.map(pot => ({ ...pot })),
      actions: [...this.currentHandActions],
      winners: this.state.showdownResults
        .filter(r => r.isWinner)
        .map(r => ({
          playerId: r.player.id,
          amount: r.winAmount,
          hand: r.hand.name
        }))
    };
  }
}
