// 辅助决策引擎: 向听计算 + 最优打法建议 + 失误检测
// 综合考虑: 自身手牌结构、桌面已出牌(各家弃牌/碰杠)、剩余牌概率、策略库经验
import type { GameState, PlayerState, Seat, Tile, AdviceData, MistakeAlert, ScenarioAnalysis, DiscardScenario } from './types';
import { tileCode, isHongZhong, tileName, tileIndex, indexToTile } from './types';
import { canWin, checkTing } from './win';
import { calcShantenFromBase } from './shanten';
import { getStrategyHint, getAllStrategyHints, getStrategyLibStats } from './strategyLib';
import type { StrategyContext } from './strategyLib';
import { loadCorrections, correctionWeightedAdvice, hintFromCorrections } from './correctionLib';

export { calcShantenFromBase };
export function calcShanten(hand: Tile[], meldsCount: number): number {
  return calcShantenFromBase(hand, meldsCount);
}

const ALL_CODES: string[] = [];
for (let i = 0; i < 34; i++) {
  ALL_CODES.push(tileCode(indexToTile(i)));
}

// 构建桌面已见牌统计(不含自己手牌,用于危险度与剩余张数估算)
function buildPublicSeen(state: GameState): number[] {
  const seen = new Array(34).fill(0);
  for (const p of state.players) {
    for (const t of p.discards) {
      if (!isHongZhong(t)) seen[tileIndex(t)]++;
    }
    for (const m of p.melds) {
      for (const t of m.tiles) {
        if (!isHongZhong(t)) seen[tileIndex(t)]++;
      }
    }
  }
  return seen;
}

// 手牌中某代码数量(非红中)
function countCode(hand: Tile[], code: string): number {
  let c = 0;
  for (const t of hand) {
    if (!isHongZhong(t) && tileCode(t) === code) c++;
  }
  return c;
}

// 单张牌保留价值(越高越该留)
function keepScore(tile: Tile, hand: Tile[], publicSeen: number[]): number {
  if (isHongZhong(tile)) return 999;
  const code = tileCode(tile);
  const cnt = countCode(hand, code);
  let score = 0;
  if (cnt >= 4) score += 95;
  else if (cnt === 3) score += 85;
  else if (cnt === 2) score += 55;
  else score += 0;

  if (tile.suit !== 'z') {
    const rank = tile.rank;
    const hasPrev = hand.some((t) => !isHongZhong(t) && tileCode(t) === `${tile.suit}${rank - 1}`);
    const hasNext = hand.some((t) => !isHongZhong(t) && tileCode(t) === `${tile.suit}${rank + 1}`);
    if (hasPrev && hasNext) score += 45;
    else if (hasPrev || hasNext) score += 28;
    else if (rank === 1 || rank === 9) score += 0;
    else if (rank === 2 || rank === 8) score += 6;
    else score += 12;
  } else {
    if (cnt === 1) score += 4;
  }
  // 该牌剩余可摸张数越少越无价值
  const remain = 4 - countCode(hand, code) - publicSeen[tileIndex(tile)];
  score += remain * 2;
  return score;
}

// 生成建议(在玩家需要出牌时调用)
export function buildAdvice(state: GameState, seat: Seat): AdviceData {
  const player = state.players[seat];
  const hand = player.hand;
  const publicSeen = buildPublicSeen(state);
  const meldsCount = player.melds.length;

  // 当前向听(按听牌长度对齐)
  const baseLen = (4 - meldsCount) * 3 + 1;
  let baseHand = hand;
  if (hand.length === baseLen + 1) {
    // 14张,先虚拟去掉新摸的牌评估(实际建议基于全部14张选最优弃牌)
    baseHand = hand;
  }
  const currentTing = checkTing(baseHand.length === baseLen ? baseHand : baseHand.slice(0, baseLen), meldsCount);
  const shanten = currentTing.length > 0 ? 0 : calcShantenFromBase(baseHand.length === baseLen ? baseHand : baseHand.slice(0, baseLen), meldsCount);

  const candidates: AdviceData['candidates'] = [];
  for (const t of hand) {
    if (isHongZhong(t)) {
      // 红中原则上不打
      candidates.push({
        code: tileCode(t), name: tileName(t), score: -999,
        afterShanten: shanten, afterTing: currentTing,
        note: '百搭牌，通常不应打出',
      });
      continue;
    }
    const rest = hand.filter((x) => x.id !== t.id);
    const afterTing = checkTing(rest, meldsCount);
    const afterShanten = afterTing.length > 0 ? 0 : calcShantenFromBase(rest, meldsCount);
    // 评分: 向听越低越好(负权重), 听牌张数越多越好, 保留价值越低越该打
    const remain = 4 - countCode(hand, tileCode(t)) - publicSeen[tileIndex(t)];
    let score = -afterShanten * 1000 + afterTing.length * 50 - keepScore(t, hand, publicSeen) * 0.3 + remain * 3;
    candidates.push({
      code: tileCode(t), name: tileName(t), score,
      afterShanten, afterTing,
      note: afterTing.length > 0 ? `打出后听 ${afterTing.length} 张` : (afterShanten === 0 ? '维持听牌' : `向听${afterShanten}`),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const recommend = best ? { tileId: hand.find((t) => tileCode(t) === best.code)!.id, code: best.code, name: best.name } : null;

  // 生成理由说明(分层: 当前状态 + 推荐路线 + 具体打法 + 扣牌提示)
  const phase: 'early' | 'mid' | 'late' = state.deck.length > 60 ? 'early' : state.deck.length > 30 ? 'mid' : 'late';
  const hongZhongCount = hand.filter((t) => isHongZhong(t)).length;
  const pairCount = countPairs(hand);
  const isTenpai = currentTing.length > 0;

  // 1) 推荐路线(七小对 vs 推倒胡)
  let routeAdvice = '';
  if (meldsCount === 0 && pairCount >= 5) {
    routeAdvice = `🎯 路线: 七小对(已${pairCount}对+${hongZhongCount}红中)`;
    if (pairCount >= 6) routeAdvice += ' [已近听牌]';
    else if (pairCount === 5) routeAdvice += ' [再摸2对可胡]';
    routeAdvice += '。';
  } else if (pairCount <= 2 && hongZhongCount >= 1) {
    routeAdvice = `🎯 路线: 推倒胡(${pairCount}对+${hongZhongCount}红中,红中优先补将)。`;
  }

  // 2) 当前状态描述
  let stateDesc: string;
  if (shanten === 0 && currentTing.length > 0) {
    const tingNames = currentTing.map((c) => tileName(indexToTile(ALL_CODES.indexOf(c))));
    stateDesc = `当前听牌,可胡: ${tingNames.join('、')}(${currentTing.length}张可胡)。`;
  } else if (shanten === 1) {
    stateDesc = `一向听,建议打出【${best?.name}】可推进至听牌。`;
  } else {
    stateDesc = `当前${shanten}向听,建议打出【${best?.name}】(保留价值最低,打出后向听${best?.afterShanten})。`;
  }

  // 3) 打出后听牌信息
  let afterInfo = '';
  if (best && best.afterTing.length > 0) {
    const afterNames = best.afterTing.map((c) => tileName(indexToTile(ALL_CODES.indexOf(c))));
    afterInfo = ` 打出后可听: ${afterNames.join('、')}。`;
  }

  // 4) 扣牌提示(基于下家舍牌规律)
  let defenseHint = '';
  if (phase === 'late' && !isTenpai) {
    const nextSeat = ((seat + 1) % 4) as Seat;
    const nextDiscards = state.players[nextSeat].discards;
    if (nextDiscards.length >= 3) {
      // 推断下家缺什么花色(连续打同花色=缺该花色)
      const suitCount: Record<string, number> = { m: 0, p: 0, s: 0, z: 0 };
      for (const d of nextDiscards) {
        if (!isHongZhong(d)) suitCount[d.suit]++;
      }
      const sortedSuits = Object.entries(suitCount).sort((a, b) => b[1] - a[1]);
      const mostDiscardSuit = sortedSuits[0][0];
      const suitName = mostDiscardSuit === 'm' ? '万' : mostDiscardSuit === 'p' ? '筒' : mostDiscardSuit === 's' ? '条' : '字';
      defenseHint = `🛡️ 扣牌: 下家已打${suitName}子${sortedSuits[0][1]}张(可能缺该花色),可放心打${suitName}子;扣住少见的中张防其碰杠。`;
    }
  }

  // 5) 构建策略上下文获取匹配策略
  const strategyCtx: StrategyContext = {
    handCode: hand.map(tileCode).sort().join(','),
    phase,
    hongZhongCount,
    pairCount,
    meldsCount,
    isTenpai,
    shanten,
    seatIsDealer: player.isDealer,
  };
  const allHints = getAllStrategyHints(strategyCtx);

  // 拼接最终 reason: 路线 + 状态 + 听牌 + 扣牌 + 策略
  let reason = '';
  if (routeAdvice) reason += routeAdvice + ' ';
  reason += stateDesc;
  reason += afterInfo;
  if (defenseHint) reason += ' ' + defenseHint;
  // 策略提示只取最高优先级1条(避免冗长)
  if (allHints.length > 0) {
    reason += ` 💡 ${allHints[0].tip}`;
  }

  const baseAdvice: AdviceData = {
    seat,
    recommendDiscard: recommend,
    reason,
    tingTiles: currentTing,
    shanten,
    candidates: candidates.slice(0, 6),
    strategyHints: allHints,
  };

  // 校正加权: 读取最近100条校正,个性化调整候选排序和原因
  try {
    const corrections = loadCorrections().slice(-100);
    const weighted = correctionWeightedAdvice(baseAdvice, corrections);
    weighted.reason += hintFromCorrections(corrections);
    return weighted;
  } catch {
    return baseAdvice;
  }
}

// 统计手牌中对子数量(非红中同代码出现≥2次算1对)
function countPairs(hand: Tile[]): number {
  const codeCount: Record<string, number> = {};
  for (const t of hand) {
    if (isHongZhong(t)) continue;
    const c = tileCode(t);
    codeCount[c] = (codeCount[c] || 0) + 1;
  }
  let pairs = 0;
  for (const c of Object.keys(codeCount)) {
    if (codeCount[c] >= 2) pairs++;
  }
  return pairs;
}

// 失误检测: 玩家实际打出的牌与建议对比
export function detectMistake(state: GameState, seat: Seat, discarded: Tile): MistakeAlert | null {
  const advice = state.lastAdvice;
  if (!advice || !advice.recommendDiscard) return null;
  const rec = advice.recommendDiscard;
  if (rec.code === tileCode(discarded)) return null; // 听从建议

  // 评估玩家打出牌后的向听 vs 建议牌打出后的向听
  const player = state.players[seat];
  // 玩家已出牌,手牌是出牌后剩余(已排序)
  const actualHand = player.hand;
  const meldsCount = player.melds.length;
  const actualTing = checkTing(actualHand, meldsCount);
  const actualShanten = actualTing.length > 0 ? 0 : calcShantenFromBase(actualHand, meldsCount);

  // 建议牌打出后的向听(从advice.candidates找)
  const recCand = advice.candidates.find((c) => c.code === rec.code);
  const recShanten = recCand?.afterShanten ?? advice.shanten;

  // 判定失误:
  // 1) 打出后向听变差(更高)
  // 2) 或打出红中
  // 3) 或建议牌打出能听而玩家打出的不能
  let issue = '';
  let isMistake = false;
  if (isHongZhong(discarded)) {
    issue = '打出了百搭红中，红中通常应保留以备组合';
    isMistake = true;
  } else if (actualShanten > recShanten) {
    issue = `打出后向听${actualShanten}，比建议打出【${rec.name}】(向听${recShanten})更远`;
    isMistake = true;
  } else if (actualShanten === recShanten && recCand && recCand.afterTing.length > 0 && actualTing.length === 0) {
    issue = `建议打出【${rec.name}】可听牌(听${recCand.afterTing.length}张)，实际打出后未听牌`;
    isMistake = true;
  } else if (actualShanten === 0 && recCand && recCand.afterTing.length > actualTing.length) {
    issue = `听牌张数偏少: 实际听${actualTing.length}张，建议打法则听${recCand.afterTing.length}张`;
    isMistake = actualTing.length < recCand.afterTing.length - 1;
  }

  if (!isMistake) return null;
  return {
    seat,
    discardedCode: tileCode(discarded),
    discardedName: tileName(discarded),
    issue,
    betterCode: rec.code,
    betterName: rec.name,
    reason: advice.reason,
  };
}

// 计算某张牌的危险度(后期点炮风险,虽本玩法仅自摸,但反映该牌对他人潜在价值)
export function dangerLevel(state: GameState, tile: Tile): number {
  const publicSeen = buildPublicSeen(state);
  const idx = tileIndex(tile);
  const seen = publicSeen[idx];
  // 已见越多,剩余越少,危险度越低
  return Math.max(0, 4 - seen - 1); // 0=安全, 3=极危险(从未见过)
}

// ========== 手牌结构分析(面子/对子/连坎搭/搭子/孤张) ==========
interface HandStructure {
  melds: number;   // 成型面子(刻子+顺子)
  pairs: number;   // 对子(含红中虚拟对)
  kanchan: number; // 连坎复合搭(357/246/468, 间隔2的3张)
  taatsu: number;  // 普通搭子(两面/嵌张/边张, 含红中补)
  singles: number; // 孤张
}

function analyzeStructure(hand: Tile[]): HandStructure {
  const counts = new Array(34).fill(0);
  let wild = 0;
  for (const t of hand) {
    if (isHongZhong(t)) wild++;
    else counts[tileIndex(t)]++;
  }
  const st: HandStructure = { melds: 0, pairs: 0, kanchan: 0, taatsu: 0, singles: 0 };

  // 1) 刻子
  for (let i = 0; i < 34; i++) {
    while (counts[i] >= 3) { st.melds++; counts[i] -= 3; }
  }
  // 2) 顺子(贪心, 低位优先)
  for (let b = 0; b < 3; b++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < 7; r++) {
        const i = b * 9 + r;
        if (counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
          counts[i]--; counts[i + 1]--; counts[i + 2]--;
          st.melds++; changed = true;
        }
      }
    }
  }
  // 3) 对子
  for (let i = 0; i < 34; i++) {
    st.pairs += counts[i] >> 1;
    counts[i] %= 2;
  }
  // 4) 连坎搭(间隔2的3张: 357/246/468)
  for (let b = 0; b < 3; b++) {
    for (let r = 0; r < 5; r++) {
      const i = b * 9 + r;
      if (counts[i] > 0 && counts[i + 2] > 0 && counts[i + 4] > 0) {
        counts[i]--; counts[i + 2]--; counts[i + 4]--;
        st.kanchan++;
      }
    }
  }
  // 5) 普通二张搭子(相邻/间隔2)
  for (let b = 0; b < 3; b++) {
    for (let r = 0; r < 8; r++) {
      const i = b * 9 + r;
      while (counts[i] > 0 && counts[i + 1] > 0) { counts[i]--; counts[i + 1]--; st.taatsu++; }
    }
    for (let r = 0; r < 7; r++) {
      const i = b * 9 + r;
      while (counts[i] > 0 && counts[i + 2] > 0) { counts[i]--; counts[i + 2]--; st.taatsu++; }
    }
  }
  // 6) 红中补齐: 1红+1孤张=1搭, 2红=1虚对
  let singlesCount = 0;
  for (let i = 0; i < 34; i++) singlesCount += counts[i];
  const fills = Math.min(singlesCount, wild);
  st.taatsu += fills;
  singlesCount -= fills;
  const wildLeft = wild - fills;
  if (wildLeft >= 2) st.pairs++;
  if (wildLeft % 2 === 1) st.singles++;
  st.singles += singlesCount;
  return st;
}

// 四大极速听牌模型检测
// 一对三成牌 / 两对半 / 四人抬轿 / 六人抬轿(双红中+4搭+1对)
function detectModel(st: HandStructure, wild: number): string | null {
  if (wild >= 2 && st.pairs >= 1 && st.melds + st.taatsu >= 4) return '六人抬轿';
  if (st.pairs === 0 && st.melds + st.taatsu === 4) return '四人抬轿';
  if (st.pairs >= 2 && st.taatsu >= 1) return '两对半';
  if (st.melds === 3 && st.pairs >= 1) return '一对三成';
  return null;
}

// ========== 辅助决策: 按需场景分析 ==========

// 牌代码(m1等)转线性索引(0-33)
export function codeToIndex(code: string): number {
  const tile = indexToTile(ALL_CODES.indexOf(code));
  // indexToTile 通过 idx 计算 suit+rank, 反过来用 tileIndex
  return tileIndex(tile);
}

// 从代码数组构建 Tile 对象(用于渲染手牌)
export function buildHandFromCodes(codes: string[]): Tile[] {
  let idCounter = 10000;
  return codes.map((code) => {
    const idx = ALL_CODES.indexOf(code);
    if (idx < 0) return null;
    const t = indexToTile(idx);
    return { id: idCounter++, suit: t.suit, rank: t.rank };
  }).filter((t): t is Tile => t !== null);
}

// 核心分析: 给定手牌代码+牌桌信息,生成多个弃牌场景对比
// 目标: 最快听牌、最早自摸、进张最多(去重统计, 计入各家已见)
export function analysisFromHandCodes(
  handCodes: string[],
  meldCount = 0,
  allDiscards: string[] = [],
): ScenarioAnalysis {
  const meldsCount = meldCount;
  const hand = buildHandFromCodes(handCodes);

  // 当前向听数(精确: 平胡/七小对取min, 红中百搭)
  let currentShanten: number;
  if (hand.length === 14) {
    currentShanten = canWin(hand, meldsCount) ? -1 : calcShantenFromBase(hand, meldsCount);
  } else if (hand.length === 13) {
    currentShanten = calcShantenFromBase(hand, meldsCount);
  } else {
    currentShanten = 99;
  }

  // 已见牌 = 其他三家舍牌+碰杠(由调用方传入), 自身手牌不重复扣减
  const seenCount = new Array(34).fill(0);
  for (const code of allDiscards) {
    const idx = ALL_CODES.indexOf(code);
    if (idx >= 0) seenCount[idx]++;
  }

  // 剩余可摸 = 4 − 打出后手牌持有 − 其他三家已见 − (弃出同码1张)
  // 红中同样计入(万能百搭, 摸到即有用)
  function remainOf(code: string, rest: Tile[], ownDiscarded: boolean): number {
    const idx = ALL_CODES.indexOf(code);
    if (idx < 0) return 0;
    let inHand = 0;
    for (const t of rest) {
      if (code === 'z5' ? isHongZhong(t) : tileCode(t) === code) inHand++;
    }
    let r = 4 - inHand - seenCount[idx];
    if (ownDiscarded) r -= 1;
    return Math.max(0, r);
  }

  // 有效进张(去重): 摸进后向听必须严格降低, 同门只统计1次
  function calcImprovements(rest: Tile[], afterSh: number): Array<{ code: string; remain: number }> {
    const result: Array<{ code: string; remain: number }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < 34; i++) {
      const candidate = indexToTile(i);
      const test = rest.concat(candidate);
      const testSh = calcShantenFromBase(test, meldsCount); // 14张: 已胡=-1 或 弃一后向听
      if (testSh >= afterSh) continue; // 未推进
      const code = tileCode(candidate);
      if (seen.has(code)) continue; // 去重: 重叠搭子共享进张只计1次
      seen.add(code);
      const rem = remainOf(code, rest, false);
      if (rem > 0) result.push({ code, remain: rem });
    }
    return result;
  }

  const scenarios: DiscardScenario[] = [];
  const handStructure = analyzeStructure(hand);
  const handWild = hand.filter(isHongZhong).length;
  const curModel = detectModel(handStructure, handWild);

  for (const t of hand) {
    if (isHongZhong(t)) continue; // 红中绝不打

    const code = tileCode(t);
    const rest = hand.filter((x) => x.id !== t.id);
    const restWild = rest.filter(isHongZhong).length;

    // 打出后的向听
    const afterTing = checkTing(rest, meldsCount);
    const afterShanten = afterTing.length > 0 ? 0 : calcShantenFromBase(rest, meldsCount);

    // 进张统计: 听牌展示可胡, 非听统计去重有效进张
    let improvements: Array<{ code: string; remain: number }> = [];
    let tingTiles: string[] = [];
    let tileCount = 0;
    if (afterShanten === 0) {
      tingTiles = afterTing;
      const seen = new Set<string>();
      for (const c of afterTing) {
        if (seen.has(c)) continue;
        seen.add(c);
        tileCount += remainOf(c, rest, false);
      }
    } else {
      improvements = calcImprovements(rest, afterShanten);
      tileCount = improvements.reduce((s, x) => s + x.remain, 0);
    }
    const improvementCodes = improvements.map((x) => x.code);
    const categoryCount = afterShanten === 0 ? tingTiles.length : improvements.length;

    // 丢张损失: 弃牌仍留在牌墙的张数(弃了就再也用不上)
    const loss = remainOf(code, rest, true);

    // 结构对比: 打出后哪些核心结构被拆
    const stRest = analyzeStructure(rest);
    let corePenalty = 0;
    // 拆对子: 原对子<=2 时保对优先(1-2对拆搭不拆对; 3对+才允许拆对)
    if (handStructure.pairs > stRest.pairs && handStructure.pairs <= 2) corePenalty += 1;
    // 拆连坎复合搭
    if (handStructure.kanchan > stRest.kanchan) corePenalty += 1;
    // 破坏极速模型
    const newModel = detectModel(stRest, restWild);
    if (curModel && !newModel) corePenalty += 1;

    // 打分(终极公式): 向听 > 去重门数 > 张数 > 丢张/结构惩罚 > 模型奖励
    const expectedValue =
      -afterShanten * 1000
      + (afterShanten === 0 ? 200 : 0)
      + categoryCount * 12
      + tileCount * 3
      - loss * 10
      - corePenalty * 120
      + (newModel ? 80 : 0)
      + (meldsCount === 0 && stRest.pairs >= 4 ? 60 : 0); // 七小对双线保对

    // 推理理由
    let reasoning = '';
    if (afterShanten === 0) {
      reasoning = `听${tingTiles.length}门${tileCount}张`;
    } else {
      reasoning = `${afterShanten}向听,进${improvements.length}门${tileCount}张`;
    }
    if (newModel) reasoning += ` [${newModel}]`;
    if (corePenalty > 0) reasoning += ' [拆核心]';

    scenarios.push({
      discardCode: code,
      discardName: tileName(t),
      shantenAfter: afterShanten,
      improvementCodes,
      tingTiles,
      categoryCount,
      tileCount,
      expectedValue,
      score: expectedValue, // 兼容旧调用方(题库编辑器)
      incomingNames: afterShanten === 0
        ? tingTiles.map((c) => tileName(indexToTile(ALL_CODES.indexOf(c))))
        : improvements.map((x) => tileName(indexToTile(ALL_CODES.indexOf(x.code)))),
      dangerLevel: 0,
      reasoning,
    });
  }

  // 排序: 向听低 → 去重进张多 → 可胡门多
  scenarios.sort((a, b) => {
    if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
    if (b.tileCount !== a.tileCount) return b.tileCount - a.tileCount;
    return b.tingTiles.length - a.tingTiles.length;
  });

  return {
    handCodes: handCodes.slice(),
    currentShanten,
    scenarios: scenarios.slice(0, 6),
  };
}
