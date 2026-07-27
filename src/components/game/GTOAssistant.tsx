import { motion } from 'framer-motion';
import { Player, GameState } from '../../types';
import { GTOSolver } from '../../engine/gto/GTOSolver';
import { opponentModel } from '../../engine/gto/OpponentModel';
import { ACTION_NAMES } from '../../constants';
import { useGameStore } from '../../stores/gameStore';

interface GTOAssistantProps {
  player: Player;
  gameState: GameState;
}

const STYLE_LABELS: Record<string, { name: string; color: string; icon: string }> = {
  unknown: { name: '观察中', color: 'text-text-muted', icon: '❓' },
  nit:     { name: '岩石',   color: 'text-info',       icon: '🪨' },
  tag:     { name: '紧凶',   color: 'text-primary',    icon: '🎯' },
  lag:     { name: '松凶',   color: 'text-warning',    icon: '⚔️' },
  fish:    { name: '鱼',     color: 'text-info',       icon: '🐟' },
  maniac:  { name: '狂人',   color: 'text-error',      icon: '🔥' },
  'calling-station': { name: '跟注站', color: 'text-warning', icon: '📞' },
};

export function GTOAssistant({ player, gameState }: GTOAssistantProps) {
  const assistantMode = useGameStore(s => s.assistantMode);
  const setAssistantMode = useGameStore(s => s.setAssistantMode);

  const { strategies, context, recommendedRaiseSize, mode } = GTOSolver.getFullAnalysis(
    player, gameState, { mode: assistantMode }
  );
  const recommended = strategies[0];

  const equityPct = Math.round(context.equity * 100);
  const potOddsPct = Math.round(context.potOdds * 100);
  const handStrengthPct = Math.round(context.handStrength * 100);
  const drawEquityPct = Math.round(context.drawEquity * 100);
  const oddsOK = context.toCall === 0 || context.equity >= context.potOdds;

  const phaseNames: Record<string, string> = {
    preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
  };
  const positionNames: Record<string, string> = {
    early: '前位', middle: '中位', late: '后位', blinds: '盲注位'
  };

  const opponentProfiles = mode === 'expert'
    ? gameState.players
        .filter(p => p.id !== player.id && p.type === 'ai')
        .map(p => ({ player: p, profile: opponentModel.getProfile(p.id) }))
    : [];

  return (
    <motion.div
      className="bg-gradient-to-br from-background-dark to-background rounded-2xl border border-white/10 p-6 shadow-2xl h-full overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 标题 + 模式切换 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-primary/20 rounded-lg text-2xl">🧠</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold">GTO 策略助手</h3>
          <p className="text-xs text-text-muted">基于博弈论最优解</p>
        </div>
      </div>

      {/* 模式切换 */}
      <div className="mb-5 grid grid-cols-2 gap-2 p-1 bg-background/50 rounded-lg border border-white/5">
        <button
          onClick={() => setAssistantMode('normal')}
          className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
            mode === 'normal' ? 'bg-primary text-white shadow' : 'text-text-muted hover:bg-white/5'
          }`}
        >
          🎓 普通模式
        </button>
        <button
          onClick={() => setAssistantMode('expert')}
          className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
            mode === 'expert' ? 'bg-warning text-white shadow' : 'text-text-muted hover:bg-white/5'
          }`}
        >
          ⚡ 专家模式
        </button>
      </div>

      {/* 推荐动作 */}
      {recommended && (
        <div className="mb-5 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl border border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-warning text-lg">💡</span>
            <span className="text-sm font-semibold text-text-muted">推荐动作</span>
            {mode === 'expert' && (
              <span className="ml-auto text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded">
                含对手画像
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="text-2xl font-bold text-primary">
              {ACTION_NAMES[recommended.action as keyof typeof ACTION_NAMES]}
            </div>
            {recommended.action === 'raise' && (
              <div className="text-sm text-text-muted">
                建议规模 ≈ ${Math.round(recommendedRaiseSize)}
              </div>
            )}
          </div>
          <div className="text-xs text-text-secondary mb-3 leading-relaxed">
            {recommended.reasoning}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">采取频率</span>
            <span className="font-semibold">{Math.round(recommended.frequency * 100)}%</span>
          </div>
          <div className="w-full bg-background-dark rounded-full h-2 mt-1">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${recommended.frequency * 100}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
          </div>
        </div>
      )}

      {/* 核心：权益 vs 底池赔率 */}
      <div className="mb-5 p-4 bg-background/50 rounded-lg border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-info text-lg">📊</span>
          <span className="text-sm font-semibold">权益 vs 底池赔率</span>
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-muted">我方胜率 (Equity)</span>
            <span className="font-semibold text-primary">{equityPct}%</span>
          </div>
          <div className="w-full bg-background-dark rounded-full h-2">
            <div className="bg-primary h-2 rounded-full" style={{ width: `${equityPct}%` }} />
          </div>
        </div>

        {context.toCall > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted">所需胜率 (Pot Odds)</span>
              <span className={`font-semibold ${oddsOK ? 'text-primary' : 'text-error'}`}>
                {potOddsPct}%
              </span>
            </div>
            <div className="w-full bg-background-dark rounded-full h-2">
              <div
                className={`h-2 rounded-full ${oddsOK ? 'bg-warning' : 'bg-error'}`}
                style={{ width: `${potOddsPct}%` }}
              />
            </div>
          </div>
        )}

        <div className={`mt-3 text-xs px-3 py-2 rounded ${oddsOK ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
          {context.toCall === 0
            ? '✓ 无需跟注，可以免费看下一街'
            : oddsOK
              ? `✓ 权益 (${equityPct}%) ≥ 赔率所需 (${potOddsPct}%)，跟注有利`
              : `✗ 权益 (${equityPct}%) < 赔率所需 (${potOddsPct}%)，跟注亏 EV`}
        </div>
      </div>

      {/* 策略分布 */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-info text-lg">📈</span>
          <span className="text-sm font-semibold">策略分布 (混合策略)</span>
        </div>
        <div className="space-y-2">
          {strategies.map((strategy, index) => (
            <motion.div
              key={`${strategy.action}-${index}`}
              className="p-3 bg-background/50 rounded-lg border border-white/5"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">
                  {ACTION_NAMES[strategy.action as keyof typeof ACTION_NAMES]}
                </span>
                <span className={`text-xs font-semibold ${
                  strategy.expectedValue > 0 ? 'text-primary'
                    : strategy.expectedValue < 0 ? 'text-error' : 'text-text-muted'
                }`}>
                  EV: {strategy.expectedValue > 0 ? '+' : ''}{Math.round(strategy.expectedValue)}
                </span>
              </div>
              <div className="text-[11px] text-text-muted mb-1 leading-snug">
                {strategy.reasoning}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background-dark rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-primary to-primary-600 h-1.5 rounded-full"
                    style={{ width: `${strategy.frequency * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-muted w-10 text-right">
                  {Math.round(strategy.frequency * 100)}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 专家模式：对手画像 */}
      {mode === 'expert' && opponentProfiles.length > 0 && (
        <div className="mb-5 p-4 bg-warning/5 rounded-lg border border-warning/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-warning text-lg">👁️</span>
            <span className="text-sm font-semibold">对手画像 (VPIP / PFR)</span>
          </div>
          <div className="space-y-2">
            {opponentProfiles.map(({ player: opp, profile }) => {
              const style = STYLE_LABELS[profile.style] || STYLE_LABELS.unknown;
              return (
                <div key={opp.id} className="p-2 bg-background/40 rounded border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">{opp.name}</span>
                    <span className={`text-[11px] ${style.color}`}>
                      {style.icon} {style.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div>
                      <div className="text-text-muted">VPIP</div>
                      <div className="font-semibold">{Math.round(profile.vpip * 100)}%</div>
                    </div>
                    <div>
                      <div className="text-text-muted">PFR</div>
                      <div className="font-semibold">{Math.round(profile.pfr * 100)}%</div>
                    </div>
                    <div>
                      <div className="text-text-muted">3B</div>
                      <div className="font-semibold">{Math.round(profile.threeBet * 100)}%</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Fold→Cbet</div>
                      <div className="font-semibold">{Math.round(profile.foldToCbet * 100)}%</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-text-muted mt-1">
                    观察样本：{profile.handsObserved} 手
                    {profile.handsObserved < 8 && ' (样本不足，画像仅供参考)'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 手牌 & 局势 */}
      <div className="p-4 bg-background/50 rounded-lg border border-white/5 space-y-2 text-xs">
        <h4 className="text-sm font-semibold mb-2">局势分析</h4>

        <div className="flex justify-between">
          <span className="text-text-muted">阶段</span>
          <span className="font-medium">{phaseNames[context.phase] || context.phase}</span>
        </div>

        {context.handName && (
          <div className="flex justify-between">
            <span className="text-text-muted">当前成牌</span>
            <span className="font-medium text-warning">{context.handName}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-text-muted">成牌强度</span>
          <span className="font-medium">{handStrengthPct}%</span>
        </div>

        {context.drawEquity > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">听牌权益</span>
            <span className="font-medium text-info">+{drawEquityPct}%</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-text-muted">位置</span>
          <span className="font-medium">{positionNames[context.position] || context.position}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">底池</span>
          <span className="font-medium text-warning">${Math.round(context.pot)}</span>
        </div>

        {context.toCall > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">还需跟注</span>
            <span className="font-medium text-error">${Math.round(context.toCall)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-text-muted">有效筹码</span>
          <span className="font-medium">${Math.round(context.effectiveStack)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">SPR</span>
          <span className="font-medium">
            {context.spr > 20 ? '深筹码' : context.spr > 6 ? '中等' : context.spr > 3 ? '浅' : '推底池'}
            <span className="text-text-muted ml-1">({context.spr.toFixed(1)})</span>
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">对手数</span>
          <span className="font-medium">{context.activeOpponents} 人</span>
        </div>

        {context.isFacingBet && (
          <div className="flex justify-between">
            <span className="text-text-muted">场面</span>
            <span className="font-medium text-error">
              面对下注 ({context.bettorCount}次加注)
            </span>
          </div>
        )}
      </div>

      {/* 教学提示 */}
      <div className="mt-4 p-3 bg-info/10 border border-info/30 rounded-lg">
        <p className="text-[11px] text-text-muted leading-relaxed">
          💡 <b>普通模式</b>：假设对手为理性玩家，仅按 GTO 计算；<b>专家模式</b>：结合累计观察到的对手 VPIP / PFR / Fold-to-Cbet 动态调整弃牌率估算。
        </p>
      </div>
    </motion.div>
  );
}
