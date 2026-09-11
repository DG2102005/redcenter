// 胡牌判定核心算法(红中百搭)
// 标准牌型: 4组面子(顺子/刻子) + 1对将
// 红中(z5)为万能百搭牌，可替代任意牌参与组成面子或将
//
// 算法: 递归拆牌法 + 红中分配
//   1. 统计非红中牌的计数与红中数量
//   2. 枚举将(对子)的组成方式(2实/1实1百搭/2百搭)
//   3. 剩余牌递归拆分为面子，红中作为百搭填补缺位

import type { Tile } from './types';
import { tileIndex, isHongZhong } from './types';

const N = 34; // 牌型种类数

// 构建计数数组与红中数量
export function buildCounts(tiles: Tile[]): { counts: number[]; wild: number } {
  const counts = new Array(N).fill(0);
  let wild = 0;
  for (const t of tiles) {
    if (isHongZhong(t)) {
      wild++;
    } else {
      counts[tileIndex(t)]++;
    }
  }
  return { counts, wild };
}

// 判断索引对应的牌能否组成顺子(同花色且点数<=7)
function canShuntsu(idx: number): boolean {
  if (idx >= 27) return false; // 字牌不能顺子
  const rank = (idx % 9) + 1;
  return rank <= 7;
}

// 判断从 startIdx 开始的三连是否同花色
function sameSuit(startIdx: number): boolean {
  if (startIdx >= 27) return false;
  const rank = (startIdx % 9) + 1;
  return rank <= 7; // 起点rank<=7才能向后延伸3张
}

// 递归: 能否用 counts+wild 组成 k 个面子(每个3张)，全部消耗
// 算法: 完全穷举, 不使用贪心策略, 保证100%正确性
//   - 找到最低非空索引 c (c 必须被消耗)
//   - 选项A: c 作为刻子的一部分 (用 t 张实牌c + (3-t) 张红中, t∈{1,2,3})
//   - 选项B: c 作为顺子的一部分 (c 非字牌)
//            c 可在顺子(start, start+1, start+2)的第 0/1/2 个位置
//            c 位置必用实牌, 其他2个位置自由选择实牌或红中(枚举4种组合)
export function canMelds(counts: number[], wild: number, k: number): boolean {
  if (k === 0) {
    // 所有非红中牌必须用完
    for (let i = 0; i < N; i++) {
      if (counts[i] !== 0) return false;
    }
    return true;
  }

  // 找到最低的非空索引(规范优先处理最低, 保证c被消耗)
  let c = -1;
  for (let i = 0; i < N; i++) {
    if (counts[i] > 0) { c = i; break; }
  }

  if (c === -1) {
    // 没有非红中牌了, 剩余红中必须正好组成 k 个刻子(每个3张红中)
    return wild === 3 * k;
  }

  const have = counts[c];

  // 选项A: 把 c 作为刻子的一部分
  // 用 t 张实牌c + (3-t) 张红中, t ∈ {1,2,3} (t>=1 保证 c 被消耗)
  const maxRealA = Math.min(have, 3);
  for (let t = maxRealA; t >= 1; t--) {
    const wildCost = 3 - t;
    if (wild >= wildCost) {
      counts[c] -= t;
      if (canMelds(counts, wild - wildCost, k - 1)) {
        counts[c] += t;
        return true;
      }
      counts[c] += t;
    }
  }

  // 选项B: 把 c 作为顺子的一部分 (仅 c < 27, 即非字牌)
  // 字牌(东南西北中发白)不能组成顺子, 只能刻子
  if (c < 27) {
    // 同花色块: 万[0..8] 筒[9..17] 条[18..26]
    const blockStart = Math.floor(c / 9) * 9;
    const blockEnd = blockStart + 9; // 不含
    // 枚举顺子起点 start, 要求 start..start+2 同花色且包含 c
    // start ∈ [c-2, c], 但需保证 start >= blockStart 且 start+2 < blockEnd
    for (let start = Math.max(blockStart, c - 2); start <= c; start++) {
      if (start + 2 >= blockEnd) continue; // 跨花色, 跳过
      const positions = [start, start + 1, start + 2];
      // c 必须在 positions 中
      const cIdx = positions.indexOf(c);
      if (cIdx < 0) continue;

      // 枚举其他2个位置(非 c 位置)的实牌/红中分配, 共 2^2=4 种组合
      // mask: bit0=第一个非c位置(1=实牌, 0=红中), bit1=第二个非c位置
      const otherIdx: number[] = [];
      for (let j = 0; j < 3; j++) if (j !== cIdx) otherIdx.push(j);

      for (let mask = 0; mask < 4; mask++) {
        let wildCost = 0;
        let feasible = true;
        const consume: number[] = []; // 实牌位置(红中位置记为 -1)

        // c 位置必用实牌
        consume.push(c);

        // 其他2个位置按 mask 决定
        for (let mi = 0; mi < 2; mi++) {
          const j = otherIdx[mi];
          const useReal = (mask >> mi) & 1;
          if (useReal) {
            if (counts[positions[j]] < 1) {
              feasible = false;
              break;
            }
            consume.push(positions[j]);
          } else {
            wildCost++;
            consume.push(-1);
          }
        }

        if (!feasible || wild < wildCost) continue;

        // 消耗实牌
        for (const pos of consume) if (pos >= 0) counts[pos]--;
        if (canMelds(counts, wild - wildCost, k - 1)) {
          for (const pos of consume) if (pos >= 0) counts[pos]++;
          return true;
        }
        // 还原
        for (const pos of consume) if (pos >= 0) counts[pos]++;
      }
    }
  }

  return false;
}

// 主胡牌判定: tiles 为当前暗手牌，meldsCount 为已副露的碰/杠组数
// 暗手牌张数应为 (4 - meldsCount)*3 + 2
// 支持两种胡法:
//   1. 推倒胡(标准): 4组面子(顺子/刻子) + 1对将
//   2. 七小对(七对子): 7组对子(必须为暗手,即 meldsCount === 0)
// 红中百搭可代替任意牌参与组成
//
// 性能优化: LRU缓存(命中率高,因checkTing会调用canWin 34次,
//   每次仅最后1张牌不同,前缀重复;缓存键用code排序,避免Tile实例id差异)
const WIN_CACHE_MAX = 2000;
const winCache = new Map<string, boolean>();

export function canWin(tiles: Tile[], meldsCount: number): boolean {
  const needMelds = 4 - meldsCount;
  const expectedLen = needMelds * 3 + 2;
  if (tiles.length !== expectedLen) return false;

  // 缓存键: meldsCount + 手牌code排序(忽略Tile.id差异,因胡牌判定只看code)
  const codes = tiles.map((t) => t.suit + t.rank).sort();
  const cacheKey = `${meldsCount}|${codes.join(',')}`;
  const cached = winCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { counts, wild } = buildCounts(tiles);
  let result = false;

  // 1) 七小对判定(仅未副露时): 7组对子
  if (meldsCount === 0 && canSevenPairs(counts, wild)) {
    result = true;
  }

  // 2) 推倒胡判定: 4面子 + 1将
  if (!result) {
    // 2.1) 2张实牌同c
    for (let c = 0; c < N; c++) {
      if (counts[c] >= 2) {
        counts[c] -= 2;
        if (canMelds(counts, wild, needMelds)) {
          counts[c] += 2;
          result = true;
          break;
        }
        counts[c] += 2;
      }
    }
  }
  // 2.2) 1张实牌c + 1张红中
  if (!result && wild >= 1) {
    for (let c = 0; c < N; c++) {
      if (counts[c] >= 1) {
        counts[c] -= 1;
        if (canMelds(counts, wild - 1, needMelds)) {
          counts[c] += 1;
          result = true;
          break;
        }
        counts[c] += 1;
      }
    }
  }
  // 2.3) 2张红中作为将
  if (!result && wild >= 2) {
    if (canMelds(counts, wild - 2, needMelds)) {
      result = true;
    }
  }

  // LRU写入(超限时清最早条目)
  if (winCache.size >= WIN_CACHE_MAX) {
    const firstKey = winCache.keys().next().value;
    if (firstKey !== undefined) winCache.delete(firstKey);
  }
  winCache.set(cacheKey, result);
  return result;
}

// 清空缓存(供测试或新局重置使用)
export function clearWinCache(): void {
  winCache.clear();
}

// 七小对(七对子)判定: 用 counts+wild 凑成7对(共14张)
// 规则:
//   - 每对消耗2张同款牌
//   - 红中可代替任意1张牌,补单张成对(消耗1红中+1实牌)
//   - 2张红中可自凑1对
//   - 4张同款可拆为2对
// counts为非红中牌计数, wild为红中数
function canSevenPairs(counts: number[], wild: number): boolean {
  let realPairs = 0;       // 实牌组成的对子数
  let leftoverSingles = 0; // 实牌剩余单张数(无法成对)
  for (let c = 0; c < N; c++) {
    realPairs += Math.floor(counts[c] / 2);
    leftoverSingles += counts[c] % 2;
  }
  const need = 7 - realPairs;  // 还需凑的对子数
  if (need < 0) return false; // 实牌对子超过7,不可能
  if (need === 0) return wild === 0 && leftoverSingles === 0; // 必须没有多余牌

  // 用 a 对"红中+单实牌", b 对"2红中自凑"
  // 约束: a + b = need, a <= leftoverSingles, a + 2b <= wild
  // 由 b = need - a 代入: a + 2(need-a) <= wild => a >= 2*need - wild
  // 所以 a 的可行范围: max(0, 2*need - wild) <= a <= min(leftoverSingles, need)
  const aLow = Math.max(0, 2 * need - wild);
  const aHigh = Math.min(leftoverSingles, need);
  return aLow <= aHigh;
}

// 听牌判定: tiles 为13-3M张暗手牌，返回所有可胡的牌型代码
import { indexToTile, tileCode } from './types';

export function checkTing(tiles: Tile[], meldsCount: number): string[] {
  const needMelds = 4 - meldsCount;
  const baseLen = needMelds * 3 + 1; // 听牌时少1张
  if (tiles.length !== baseLen) return [];

  const results: string[] = [];
  const seen = new Set<string>();
  for (let idx = 0; idx < N; idx++) {
    const candidate = indexToTile(idx);
    const test = tiles.concat(candidate);
    if (canWin(test, meldsCount)) {
      const code = tileCode(candidate);
      if (!seen.has(code)) {
        seen.add(code);
        results.push(code);
      }
    }
  }
  return results;
}

// 自摸判定: 摸牌后检查能否胡
export function checkSelfDrawWin(hand: Tile[], meldsCount: number): boolean {
  return canWin(hand, meldsCount);
}

// 计数版精确向听数(供测试/离线工具使用), counts[31] 为红中数
export { calcShantenFromCounts } from './shanten';
