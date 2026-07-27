import Dexie, { Table } from 'dexie';
import { HandHistory, PlayerStats, GameConfig, GamePhase, ActionType } from '../types';

// 与 stores/gameStore.ts 中的 DecisionRecord 保持结构一致
// 这里独立声明是为了避免 database <-> gameStore 的循环依赖
export interface StoredDecisionRecord {
  handId: string;
  timestamp: number;
  phase: GamePhase;
  action: ActionType;
  amount: number;
  bestAction: ActionType;
  quality: number;
  evLoss: number;
  feedback: string;
  suggestion?: string;
  handSnapshot?: { pot: number; toCall: number; equity: number };
}

export interface StoredGame {
  id?: number;
  gameId: string;
  timestamp: number;
  config: GameConfig;
  history: HandHistory[];
  // 决策复盘数据：按 handId 存储该手所有决策记录（新增，兼容旧数据可为空）
  decisions?: Record<string, StoredDecisionRecord[]>;
}

export interface StoredStats {
  id?: number;
  playerId: string;
  stats: PlayerStats;
  lastUpdated: number;
}

export class GameDatabase extends Dexie {
  games!: Table<StoredGame, number>;
  stats!: Table<StoredStats, number>;

  constructor() {
    super('TexasHoldemGTO');
    
    this.version(1).stores({
      games: '++id, gameId, timestamp',
      stats: '++id, playerId, lastUpdated'
    });
  }

  // 保存游戏历史
  async saveGame(
    gameId: string,
    config: GameConfig,
    history: HandHistory[],
    decisions?: Record<string, StoredDecisionRecord[]>
  ): Promise<number> {
    return await this.games.add({
      gameId,
      timestamp: Date.now(),
      config,
      history,
      decisions,
    });
  }

  // 获取所有游戏记录
  async getAllGames(): Promise<StoredGame[]> {
    return await this.games.orderBy('timestamp').reverse().toArray();
  }

  // 获取最近的游戏记录
  async getRecentGames(limit: number = 10): Promise<StoredGame[]> {
    return await this.games.orderBy('timestamp').reverse().limit(limit).toArray();
  }

  // 根据ID获取游戏
  async getGameById(id: number): Promise<StoredGame | undefined> {
    return await this.games.get(id);
  }

  // 删除游戏记录
  async deleteGame(id: number): Promise<void> {
    await this.games.delete(id);
  }

  // 清空所有游戏记录
  async clearAllGames(): Promise<void> {
    await this.games.clear();
  }

  // 保存/更新玩家统计数据
  async savePlayerStats(playerId: string, stats: PlayerStats): Promise<number> {
    const existing = await this.stats.where('playerId').equals(playerId).first();
    
    if (existing) {
      await this.stats.update(existing.id!, {
        stats,
        lastUpdated: Date.now()
      });
      return existing.id!;
    } else {
      return await this.stats.add({
        playerId,
        stats,
        lastUpdated: Date.now()
      });
    }
  }

  // 获取玩家统计数据
  async getPlayerStats(playerId: string): Promise<PlayerStats | null> {
    const stored = await this.stats.where('playerId').equals(playerId).first();
    return stored ? stored.stats : null;
  }

  // 获取所有玩家统计
  async getAllStats(): Promise<StoredStats[]> {
    return await this.stats.toArray();
  }

  // 更新玩家统计（增量更新）
  async updatePlayerStats(playerId: string, updates: Partial<PlayerStats>): Promise<void> {
    const existing = await this.getPlayerStats(playerId);
    
    if (existing) {
      const updated = { ...existing, ...updates };
      await this.savePlayerStats(playerId, updated);
    }
  }

  // 重置玩家统计
  async resetPlayerStats(playerId: string): Promise<void> {
    const stored = await this.stats.where('playerId').equals(playerId).first();
    if (stored) {
      await this.stats.delete(stored.id!);
    }
  }

  // 获取数据库大小估算
  async getStorageSize(): Promise<number> {
    const games = await this.games.count();
    const stats = await this.stats.count();
    return games + stats;
  }
}

// 创建全局数据库实例
export const db = new GameDatabase();
