/**
 * AI打法风格类型
 */

export type AIStyle = 'TAG' | 'LAG' | 'TAP' | 'LAP';

/**
 * AI风格配置
 * 
 * TAG (Tight-Aggressive) - 紧凶：少打牌，打就凶
 * LAG (Loose-Aggressive) - 松凶：多打牌，打就凶
 * TAP (Tight-Passive) - 紧弱：少打牌，被动跟注
 * LAP (Loose-Passive) - 松弱：多打牌，被动跟注（鱼玩家）
 */
export interface AIStyleConfig {
  name: string;
  description: string;
  
  // VPIP (Voluntarily Put money In Pot) - 主动入池率
  vpip: number; // 0-1, 越高越松
  
  // PFR (Pre-Flop Raise) - 翻牌前加注率
  pfr: number; // 0-1, 越高越激进
  
  // 攻击性因子 (Aggression Factor)
  aggression: number; // 0-3, (raise+bet)/(call)比例
  
  // 3-bet频率
  threeBetFrequency: number; // 0-1
  
  // 诈唬频率
  bluffFrequency: number; // 0-1
  
  // 慢打频率（隐藏强牌）
  slowPlayFrequency: number; // 0-1
  
  // 弃牌阈值调整（相对于基础值）
  foldThresholdAdjust: number; // -0.2 到 0.2
  
  // 加注阈值调整（相对于基础值）
  raiseThresholdAdjust: number; // -0.2 到 0.2
}

/**
 * 预定义风格配置
 */
export const AI_STYLES: Record<AIStyle, AIStyleConfig> = {
  // 紧凶 - 职业玩家风格
  TAG: {
    name: '紧凶',
    description: '只打强牌，打就凶狠',
    vpip: 0.35,              // 35% 入池率（从28%再提升）
    pfr: 0.28,               // 28% 加注率（从22%提升）
    aggression: 2.5,         // 高攻击性
    threeBetFrequency: 0.12,
    bluffFrequency: 0.20,    // 诈唬频率提升
    slowPlayFrequency: 0.05,
    foldThresholdAdjust: -0.08,  // 更不容易弃牌（从-0.02提升）
    raiseThresholdAdjust: -0.12  // 更容易加注
  },
  
  // 松凶 - 进攻型玩家
  LAG: {
    name: '松凶',
    description: '大量入池，激进施压',
    vpip: 0.50,              // 50% 入池率（从42%提升）
    pfr: 0.38,               // 38% 加注率（从32%提升）
    aggression: 3.0,         // 极高攻击性
    threeBetFrequency: 0.18,
    bluffFrequency: 0.40,    // 频繁诈唬
    slowPlayFrequency: 0.02, // 很少慢打
    foldThresholdAdjust: -0.20,  // 极难弃牌（从-0.15提升）
    raiseThresholdAdjust: -0.20  // 很容易加注
  },
  
  // 紧弱 - 保守型玩家
  TAP: {
    name: '紧弱',
    description: '选择性入池，被动跟注',
    vpip: 0.32,              // 32% 入池率（从25%提升）
    pfr: 0.15,               // 15% 加注率（从12%提升）
    aggression: 0.8,         // 低攻击性
    threeBetFrequency: 0.06,
    bluffFrequency: 0.10,    // 很少诈唬
    slowPlayFrequency: 0.12, // 经常慢打
    foldThresholdAdjust: -0.05,  // 不容易弃牌（从0.02改为负数）
    raiseThresholdAdjust: 0.05   // 不容易加注
  },
  
  // 松弱 - 娱乐玩家/鱼
  LAP: {
    name: '松弱',
    description: '大量跟注，很少加注',
    vpip: 0.65,              // 65% 入池率（从55%提升）
    pfr: 0.15,               // 15% 加注率（从12%提升）
    aggression: 0.5,         // 很低攻击性
    threeBetFrequency: 0.04,
    bluffFrequency: 0.12,    // 偶尔诈唬
    slowPlayFrequency: 0.15, // 频繁慢打（不会利用强牌）
    foldThresholdAdjust: -0.25,  // 极难弃牌（从-0.20提升）
    raiseThresholdAdjust: 0.10   // 很难加注
  }
};

/**
 * 为AI玩家随机分配风格（保持多样性）
 *
 * AI 现在只有一个难度：expert（最强模式）——风格分布以松凶（LAG）和紧凶（TAG）为主，
 * 偶尔出现紧弱（TAP），几乎不出现松弱（LAP）。
 */
export function assignRandomStyle(_difficulty: string): AIStyle {
  return weightedRandom([
    { style: 'TAG', weight: 4 },
    { style: 'LAG', weight: 5 },
    { style: 'TAP', weight: 1 },
    { style: 'LAP', weight: 0 }
  ]);
}

/**
 * 加权随机选择
 */
function weightedRandom(options: Array<{ style: AIStyle; weight: number }>): AIStyle {
  const totalWeight = options.reduce((sum, opt) => sum + opt.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const option of options) {
    random -= option.weight;
    if (random <= 0) {
      return option.style;
    }
  }
  
  return options[0].style;
}

/**
 * 获取风格的显示名称（带emoji）
 */
export function getStyleDisplayName(style: AIStyle): string {
  const config = AI_STYLES[style];
  const emoji = {
    TAG: '🎯',
    LAG: '🔥',
    TAP: '🛡️',
    LAP: '🐟'
  }[style];
  
  return `${emoji} ${config.name}`;
}

// ============================================================
// 以下为「AI 风格设置」相关的扩展 API（用户可在 UI 中控制）
// ============================================================

/** 风格权重（0-100 的整数），值越大越易被抽到；全 0 时回退到默认分布 */
export type AIStyleWeights = Record<AIStyle, number>;

/** 座位级别的覆盖：'random' 表示按权重随机；否则锁定为具体风格 */
export type AIStyleOverride = AIStyle | 'random';

/** 默认权重（等同旧 assignRandomStyle 的分布） */
export const DEFAULT_STYLE_WEIGHTS: AIStyleWeights = {
  TAG: 4,
  LAG: 5,
  TAP: 1,
  LAP: 0,
};

/**
 * 预设方案（整桌一键切换）
 * key -> 权重分布 + 中文说明，便于 UI 展示
 */
export const STYLE_PRESETS: Record<
  string,
  { name: string; description: string; weights: AIStyleWeights }
> = {
  default: {
    name: '默认',
    description: '以松凶/紧凶为主，偶尔紧弱',
    weights: { TAG: 4, LAG: 5, TAP: 1, LAP: 0 },
  },
  balanced: {
    name: '均匀分布',
    description: '四种风格等概率出现',
    weights: { TAG: 1, LAG: 1, TAP: 1, LAP: 1 },
  },
  all_lag: {
    name: '全松凶（施压训练）',
    description: '训练面对激进多路进攻',
    weights: { TAG: 0, LAG: 1, TAP: 0, LAP: 0 },
  },
  all_tag: {
    name: '全紧凶（价值训练）',
    description: '训练面对稳健对手的价值榨取',
    weights: { TAG: 1, LAG: 0, TAP: 0, LAP: 0 },
  },
  all_fish: {
    name: '全鱼（新手陪练）',
    description: '对手大量跟注、被动打法',
    weights: { TAG: 0, LAG: 0, TAP: 0, LAP: 1 },
  },
  aggressive_table: {
    name: '激进桌',
    description: '松凶+紧凶各半，几乎没有被动玩家',
    weights: { TAG: 1, LAG: 1, TAP: 0, LAP: 0 },
  },
  passive_table: {
    name: '被动桌',
    description: '紧弱+松弱为主，训练价值下注',
    weights: { TAG: 0, LAG: 0, TAP: 1, LAP: 1 },
  },
};

/**
 * 按自定义权重分配一个风格；若权重全为 0 则回退到默认权重
 */
export function pickStyleByWeights(weights: AIStyleWeights): AIStyle {
  const total = weights.TAG + weights.LAG + weights.TAP + weights.LAP;
  const w = total > 0 ? weights : DEFAULT_STYLE_WEIGHTS;
  return weightedRandom([
    { style: 'TAG', weight: w.TAG },
    { style: 'LAG', weight: w.LAG },
    { style: 'TAP', weight: w.TAP },
    { style: 'LAP', weight: w.LAP },
  ]);
}

/**
 * 组合决策：如果传入了明确风格则直接返回；否则按权重随机
 */
export function resolveStyle(
  override: AIStyleOverride | undefined,
  weights: AIStyleWeights
): AIStyle {
  if (override && override !== 'random') return override;
  return pickStyleByWeights(weights);
}
