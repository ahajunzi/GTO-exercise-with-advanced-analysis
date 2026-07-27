import { create } from 'zustand';
import { GameState, Player, PlayerAction, GameConfig, GamePhase } from '../types';
import { GameEngine } from '../engine/game-logic/GameEngine';
import { DEFAULT_CONFIG } from '../constants';
import { db } from '../services/database';
import { StatsService } from '../services/statsService';
import { GTOSolver, DecisionAnalysis, SolverMode } from '../engine/gto/GTOSolver';
import { opponentModel } from '../engine/gto/OpponentModel';

// 单次决策记录（用于结算后展示评分曲线）
export interface DecisionRecord {
  handId: string;
  timestamp: number;
  phase: GamePhase;
  action: PlayerAction['type'];
  amount: number;
  bestAction: PlayerAction['type'];
  quality: number;
  evLoss: number;
  feedback: string;
  suggestion?: string;
  handSnapshot?: { pot: number; toCall: number; equity: number };
}

interface GameStore {
  engine: GameEngine | null;
  gameState: GameState | null;
  currentPlayer: Player | null;
  isGameStarted: boolean;

  // 助理模式 & 决策评分
  assistantMode: SolverMode;              // 'normal' | 'expert'
  currentHandDecisions: DecisionRecord[]; // 本手玩家已做出的决策
  lastHandDecisions: DecisionRecord[];    // 上一手结算后固化的记录（供 Review 面板使用）
  showHandReview: boolean;                 // 是否显示结算复盘弹窗

  // AI 决策节奏：fast=沿用默认速度，slow=每步等 3 秒（便于观察）
  aiSpeedMode: 'fast' | 'slow';

  // Actions
  initializeGame: (config?: Partial<GameConfig>) => void;
  startNewHand: () => void;
  executePlayerAction: (playerId: string, action: PlayerAction) => void;
  updateGameState: () => void;
  saveHandHistory: () => Promise<void>;
  setAssistantMode: (mode: SolverMode) => void;
  setAiSpeedMode: (mode: 'fast' | 'slow') => void;
  closeHandReview: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  gameState: null,
  currentPlayer: null,
  isGameStarted: false,
  assistantMode: 'normal',
  currentHandDecisions: [],
  lastHandDecisions: [],
  showHandReview: false,
  aiSpeedMode: 'fast',

  initializeGame: (config = {}) => {
    const fullConfig: GameConfig = { ...DEFAULT_CONFIG, ...config };
    const engine = new GameEngine(fullConfig);
    
    set({
      engine,
      gameState: engine.getState(),
      currentPlayer: engine.getCurrentPlayer(),
      isGameStarted: true,
    });
  },

  startNewHand: () => {
    const { engine } = get();
    if (!engine) return;

    console.log('[GameStore] Starting new hand');
    engine.startNewHand();
    const newState = engine.getState();
    const newCurrentPlayer = engine.getCurrentPlayer();

    set({
      gameState: newState,
      currentPlayer: newCurrentPlayer,
      // 新手开始 → 清空本手决策
      currentHandDecisions: [],
      showHandReview: false,
    });
  },

  executePlayerAction: (playerId: string, action: PlayerAction) => {
    const { engine, assistantMode } = get();
    if (!engine) return;

    // 在动作提交之前，先分析这次决策（只对人类玩家做分析）
    const preState = engine.getState();
    const actingPlayer = preState.players.find(p => p.id === playerId);
    let decisionRecord: DecisionRecord | null = null;
    if (actingPlayer && actingPlayer.type === 'human') {
      try {
        const analysis: DecisionAnalysis = GTOSolver.analyzeDecision(
          action.type,
          actingPlayer,
          preState,
          { mode: assistantMode }
        );
        // 快照当前底池、需跟注、粗略 equity（用 solver 上下文）
        const full = GTOSolver.getFullAnalysis(actingPlayer, preState, { mode: assistantMode });
        decisionRecord = {
          handId: preState.id,
          timestamp: Date.now(),
          phase: preState.phase,
          action: action.type,
          amount: action.amount,
          bestAction: analysis.bestAction,
          quality: analysis.quality,
          evLoss: analysis.evLoss,
          feedback: analysis.feedback,
          suggestion: analysis.suggestion,
          handSnapshot: {
            pot: full.context.pot,
            toCall: full.context.toCall,
            equity: full.context.equity,
          },
        };
      } catch (err) {
        console.warn('[GameStore] analyzeDecision failed:', err);
      }
    }

    console.log('[GameStore] Executing action:', playerId, action.type, action.amount);
    const success = engine.executeAction(playerId, action);
    console.log('[GameStore] Action success:', success);
    
    if (success) {
      const newState = engine.getState();
      const newCurrentPlayer = engine.getCurrentPlayer();

      const patch: Partial<GameStore> = {
        gameState: newState,
        currentPlayer: newCurrentPlayer,
      };
      if (decisionRecord) {
        patch.currentHandDecisions = [...get().currentHandDecisions, decisionRecord];
      }
      set(patch as any);

      // 如果进入摊牌阶段，保存历史 + 冻结决策记录 + 更新对手画像
      if (newState.phase === 'showdown' && newState.showdownResults) {
        console.log('[GameStore] Showdown detected, saving hand history');
        get().saveHandHistory();
        const decisions = get().currentHandDecisions;
        set({
          lastHandDecisions: decisions,
          showHandReview: decisions.length > 0,
        });
      }
    }
  },

  updateGameState: () => {
    const { engine } = get();
    if (!engine) return;

    set({
      gameState: engine.getState(),
      currentPlayer: engine.getCurrentPlayer(),
    });
  },

  saveHandHistory: async () => {
    const { engine, gameState, currentHandDecisions } = get();
    if (!engine || !gameState) return;

    try {
      const handHistory = engine.getCurrentHandHistory();
      if (!handHistory) {
        console.warn('[GameStore] No hand history available');
        return;
      }

      // 更新对手画像（供专家模式使用）
      try {
        opponentModel.record(handHistory);
      } catch (err) {
        console.warn('[GameStore] opponentModel.record failed:', err);
      }

      // 保存到数据库
      const config: GameConfig = {
        playerCount: gameState.players.length,
        startingChips: DEFAULT_CONFIG.startingChips,
        smallBlind: gameState.smallBlind,
        bigBlind: gameState.bigBlind,
        aiDifficulty: DEFAULT_CONFIG.aiDifficulty
      };

      // 把本手的决策评分记录一并存入（按 handId 归档，供"查看详情"复盘使用）
      const decisionsMap = currentHandDecisions.length > 0
        ? { [handHistory.id]: currentHandDecisions }
        : undefined;

      await db.saveGame(gameState.id, config, [handHistory], decisionsMap);
      await StatsService.updateStatsFromHand(handHistory);
    } catch (error) {
      console.error('[GameStore] Error saving hand history:', error);
    }
  },

  setAssistantMode: (mode) => set({ assistantMode: mode }),
  setAiSpeedMode: (mode) => set({ aiSpeedMode: mode }),
  closeHandReview: () => set({ showHandReview: false }),
}));
