import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { PokerTable } from './PokerTable';
import { ActionPanel } from './ActionPanel';
import { GTOAssistant } from './GTOAssistant';
import { HandReviewModal } from './HandReviewModal';


import { AIEngine } from '../../engine/ai/AIEngine';
import { PlayerAction } from '../../types';
import { DEFAULT_AI_SPEED } from '../../constants';

// AI 慢速模式的每步延迟（3 秒）
const SLOW_AI_SPEED = 1500;

interface GamePageProps {
  onBack?: () => void;
}

export function GamePage({ onBack }: GamePageProps) {
  // 强制刷新标记
  const { gameState, engine, startNewHand, executePlayerAction, isGameStarted: storeGameStarted } = useGameStore();
  const showHandReview = useGameStore(s => s.showHandReview);
  const lastHandDecisions = useGameStore(s => s.lastHandDecisions);
  const closeHandReview = useGameStore(s => s.closeHandReview);
  const aiSpeedMode = useGameStore(s => s.aiSpeedMode);
  const setAiSpeedMode = useGameStore(s => s.setAiSpeedMode);
  const aiSpeedModeRef = useRef(aiSpeedMode);
  const [showGTOAssistant, setShowGTOAssistant] = useState(true);
  const [localGameStarted, setLocalGameStarted] = useState(false);
  const processingRef = useRef(false);
  const gameStateRef = useRef(gameState);
  const executeActionRef = useRef(executePlayerAction);

  // 直接从 gameState 获取当前玩家
  const currentPlayer = gameState ? gameState.players[gameState.currentPlayerIndex] : null;

  // 保持 refs 最新
  useEffect(() => {
    gameStateRef.current = gameState;
    executeActionRef.current = executePlayerAction;
  }, [gameState, executePlayerAction]);

  useEffect(() => {
    aiSpeedModeRef.current = aiSpeedMode;
  }, [aiSpeedMode]);

  // 初始化游戏逻辑
  useEffect(() => {
    // 如果本地还没标记为开始
    if (!localGameStarted) {
      // 检查当前游戏状态是否有效（是否已经发过牌）
      // 判断依据：是否有手牌
      const hasCards = gameState?.players.some(p => p.cards.length > 0);
      
      // 1. 如果 Store 里已经有游戏在进行，且已经发过牌，直接恢复
      if (storeGameStarted && gameState && hasCards) {
        console.log('[GamePage] Resuming existing game with cards');
        setLocalGameStarted(true);
        return;
      }

      // 2. 否则开始新游戏（即使 storeGameStarted 为 true，如果没有牌也重置）
      console.log('[GamePage] Starting initial hand (no valid active game found)');
      startNewHand();
      setLocalGameStarted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localGameStarted]); // 只依赖本地状态，确保只执行一次

  // 监听摊牌阶段
  useEffect(() => {
    if (gameState?.phase === 'showdown' && gameState.showdownResults) {
      processingRef.current = false;
    }
  }, [gameState?.phase, gameState?.showdownResults]);

  // 处理AI玩家的回合
  useEffect(() => {
    console.log('[GamePage] Effect triggered:', {
      hasGameState: !!gameState,
      hasCurrentPlayer: !!currentPlayer,
      currentPlayerId: currentPlayer?.id,
      currentPlayerName: currentPlayer?.name,
      currentPlayerType: currentPlayer?.type,
      currentPlayerStatus: currentPlayer?.status,
      phase: gameState?.phase,
      currentPlayerIndex: gameState?.currentPlayerIndex,
      processing: processingRef.current
    });

    if (!gameState || !currentPlayer) {
      console.log('[GamePage] Skipping - no gameState or currentPlayer');
      return;
    }
    
    if (gameState.phase === 'showdown') {
      console.log('[GamePage] Skipping - showdown phase');
      return;
    }

    // 检查当前玩家是否可以行动
    const canAct = currentPlayer.status === 'active' || currentPlayer.status === 'waiting';
    
    if (!canAct) {
      console.log('[GamePage] Current player cannot act:', currentPlayer.status);
      processingRef.current = false;
      return;
    }

    if (currentPlayer.type === 'ai' && !processingRef.current) {
      console.log('[GamePage] Starting AI processing for:', currentPlayer.name);
      processingRef.current = true;
      
      const timer = setTimeout(() => {
        const latestGameState = gameStateRef.current;
        const latestExecuteAction = executeActionRef.current;
        
        // 再次检查状态
        if (!latestGameState || latestGameState.phase === 'showdown') {
          console.log('[GamePage] AI processing cancelled - showdown or no state');
          processingRef.current = false;
          return;
        }

        console.log('[GamePage] Executing AI turn for player:', {
          id: currentPlayer.id,
          name: currentPlayer.name,
          status: currentPlayer.status,
          type: currentPlayer.type
        });
        
        AIEngine.processAITurns(latestGameState, (playerId, decision) => {
          console.log('[GamePage] AI decision received:', { playerId, decision });
          
          // 执行 AI 决策
          latestExecuteAction(playerId, {
            type: decision.action,
            amount: decision.amount,
            timestamp: Date.now()
          });
          
          // 无论成功或失败，都重置处理标志，防止卡住
          // 注意：如果失败，GameEngine 会保持状态不变，下次 Effect 会重新触发
          processingRef.current = false;
        });
      }, aiSpeedModeRef.current === 'slow' ? SLOW_AI_SPEED : DEFAULT_AI_SPEED);

      return () => {
        clearTimeout(timer);
        // 如果组件卸载或依赖变化导致清理，必须重置处理状态，
        // 否则下一次 effect 执行时会误以为还在处理中
        processingRef.current = false;
      };
    } else if (currentPlayer.type === 'human') {
      console.log('[GamePage] Human player turn:', currentPlayer.name);
      processingRef.current = false;
    }
  }, [gameState?.currentPlayerIndex, gameState?.phase]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background-darker via-background-dark to-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">加载游戏中...</div>
        </div>
      </div>
    );
  }

  const humanPlayer = gameState.players.find(p => p.type === 'human');
  
  // 调试日志：监控手牌状态
  useEffect(() => {
    if (humanPlayer) {
      console.log('[GamePage] Human player status:', {
        name: humanPlayer.name,
        status: humanPlayer.status,
        cardsCount: humanPlayer.cards.length,
        phase: gameState.phase,
        isDealer: humanPlayer.isDealer
      });
    }
  }, [gameState.phase, humanPlayer, gameState.currentPlayerIndex]);

  const isHumanTurn = currentPlayer?.type === 'human';
  const maxBet = Math.max(...gameState.players.map(p => p.bet), 0);
  // 底池总额 = 已归入底池 + 本轮所有玩家的下注（用于计算按底池比例的加注）
  const totalPot =
    gameState.pots.reduce((sum, p) => sum + p.amount, 0) +
    gameState.players.reduce((sum, p) => sum + p.bet, 0);

  const handleAction = (action: string, amount?: number) => {
    if (!humanPlayer || !isHumanTurn) return;

    const playerAction: PlayerAction = {
      type: action as any,
      amount: amount || 0,
      timestamp: Date.now()
    };

    executePlayerAction(humanPlayer.id, playerAction);
  };

  const availableActions = engine?.getAvailableActions(humanPlayer?.id || '') || [];

  const handleContinue = () => {
    processingRef.current = false; // 重置AI状态
    startNewHand();
  };

  const isShowdown = gameState.phase === 'showdown' && gameState.showdownResults;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-darker via-background-dark to-background">
      {/* 顶部工具栏 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background-dark/80 backdrop-blur-md border-b border-white/10">
        <div className="container mx-auto px-2 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2">
          <button 
            onClick={onBack}
            className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 hover:bg-white/10 rounded-lg transition-colors text-sm md:text-base flex-shrink-0"
          >
            <span>⬅️</span>
            <span className="hidden sm:inline">返回大厅</span>
          </button>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="text-xs md:text-sm text-text-muted hidden sm:block">
              小盲/大盲: <span className="text-warning font-semibold">${gameState.smallBlind}/${gameState.bigBlind}</span>
            </div>

            {/* AI 节奏切换 */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => setAiSpeedMode('fast')}
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                  aiSpeedMode === 'fast'
                    ? 'bg-primary text-white shadow'
                    : 'text-text-muted hover:text-white'
                }`}
                title="AI 快速决策（默认）"
              >
                ⚡<span className="hidden md:inline"> 快速</span>
              </button>
              <button
                onClick={() => setAiSpeedMode('slow')}
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                  aiSpeedMode === 'slow'
                    ? 'bg-primary text-white shadow'
                    : 'text-text-muted hover:text-white'
                }`}
                title="AI 每步等待 3 秒，便于观察"
              >
                🐢<span className="hidden md:inline"> 慢速</span>
              </button>
            </div>

            <button className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-colors text-lg md:text-xl hidden sm:block">
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* 主游戏区域 - 顶部对齐固定 padding，避免助手撑高容器导致牌桌相对下移
           手机端：单列纵向；桌面端：三栏布局保持不变 */}
      <main className="pt-16 md:pt-32 pb-9 px-2 md:px-4 flex justify-center">
        <div className="w-full max-w-[1920px] flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-start justify-center">
          {/* 左侧占位 - 只在桌面端生效，保持牌桌视觉居中 */}
          {showGTOAssistant && humanPlayer && (
            <div className="hidden md:block w-72 flex-shrink-0" aria-hidden="true" />
          )}

          {/* 中间：牌桌 + 操作面板 - 桌面端固定基准宽度 */}
          <div className="flex-shrink-0 w-full max-w-[1360px] flex flex-col gap-3">
            <PokerTable gameState={gameState} />

            {humanPlayer && isHumanTurn && humanPlayer.status === 'active' && (
              <ActionPanel
                player={humanPlayer}
                availableActions={availableActions}
                minRaise={gameState.minRaise}
                maxBet={maxBet}
                pot={totalPot}
                onAction={handleAction}
              />
            )}
          </div>

          {/* 右侧：GTO 助手
               - 桌面端：右侧固定栏，独立滚动
               - 手机端：变成底部抽屉，覆盖显示，避免挤压牌桌
          */}
          <AnimatePresence>
            {showGTOAssistant && humanPlayer && (
              <>
                {/* 桌面端：右侧栏 */}
                <motion.div
                  key="gto-desktop"
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 300, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="hidden md:block w-72 flex-shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1"
                >
                  <GTOAssistant player={humanPlayer} gameState={gameState} />
                </motion.div>

                {/* 手机端：底部弹出抽屉 */}
                <motion.div
                  key="gto-mobile"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="md:hidden fixed inset-x-0 bottom-0 top-16 z-40 bg-background-dark/95 backdrop-blur-lg border-t border-white/10 overflow-y-auto"
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2 sticky top-0 bg-background-dark/95 py-1 z-10">
                      <span className="text-sm font-bold">🧠 GTO 助手</span>
                      <button
                        onClick={() => setShowGTOAssistant(false)}
                        className="px-3 py-1 bg-white/10 rounded-md text-xs font-semibold"
                      >
                        关闭 ✕
                      </button>
                    </div>
                    <GTOAssistant player={humanPlayer} gameState={gameState} />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* GTO助手切换按钮：桌面在右上，手机在右下（避开顶栏和牌桌） */}
      <button
        onClick={() => setShowGTOAssistant(!showGTOAssistant)}
        className="fixed z-[60] px-3 md:px-4 py-2 bg-primary hover:bg-primary-600 rounded-lg shadow-lg transition-colors text-xs md:text-sm font-semibold
                   right-2 md:right-4 bottom-20 md:bottom-auto md:top-20"
      >
        {showGTOAssistant ? '🧠 隐藏助手' : '🧠 显示助手'}
      </button>

      {/* 结算后的继续按钮 */}
      {isShowdown && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ delay: 1, type: 'spring' }}
          onClick={handleContinue}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 px-8 py-4 bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl font-bold text-lg shadow-2xl transition-all transform hover:scale-105"
        >
          继续下一局 →
        </motion.button>
      )}



      {/* 决策复盘弹窗 */}
      {showHandReview && lastHandDecisions.length > 0 && (
        <HandReviewModal decisions={lastHandDecisions} onClose={closeHandReview} />
      )}
    </div>
  );
}
