// 校正经验库: 用户对系统建议的校正/认同记录 (localStorage 持久化)
// 用于: 专家Tab趋势分析 / 个性化建议加权 / 局势评分
import type { UserCorrection, SituationScore, CorrectionTrend, AdviceData } from './types';
import type { StrategyContext } from './strategyLib';

export const CORRECTION_STORAGE_KEY = 'hongzhong_correction_log_v1';

// ========== localStorage 抽象(与 strategyLib.ts 同模式,隔离存储) ==========
const memStore: Record<string, string> = {};
function getStorage(): Storage | null {
  try {
    const ls = (typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : undefined);
    if (ls && typeof ls.setItem === 'function' && typeof ls.getItem === 'function') return ls as Storage;
  } catch { /* noop */ }
  return null;
}
function storageGet(key: string): string | null {
  const s = getStorage();
  if (s) return s.getItem(key);
  return memStore[key] ?? null;
}
function storageSet(key: string, val: string): void {
  const s = getStorage();
  if (s) s.setItem(key, val);
  else memStore[key] = val;
}

function randomId(): string {
  // crypto.randomUUID 优先, 回退时间戳+随机
  try {
    if (typeof (globalThis as any).crypto?.randomUUID === 'function') {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch { /* noop */ }
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ========== CRUD ==========
export function loadCorrections(): UserCorrection[] {
  const raw = storageGet(CORRECTION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list: UserCorrection[]): void {
  storageSet(CORRECTION_STORAGE_KEY, JSON.stringify(list));
}

export function saveCorrection(c: Omit<UserCorrection, 'id' | 'time'>): UserCorrection {
  const record: UserCorrection = {
    ...c,
    id: randomId(),
    time: Date.now(),
  };
  const list = loadCorrections();
  list.push(record);
  saveAll(list);
  return record;
}

export function deleteCorrection(id: string): boolean {
  const list = loadCorrections();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  saveAll(list);
  return true;
}

export function clearCorrections(): void {
  saveAll([]);
}

export function exportCorrections(): string {
  return JSON.stringify(loadCorrections(), null, 2);
}

export function importCorrections(jsonText: string): { ok: number; fail: number } {
  let arr: any[];
  try {
    const parsed = JSON.parse(jsonText);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { ok: 0, fail: 1 };
  }
  const existing = loadCorrections();
  const existingIds = new Set(existing.map((c) => c.id));
  let ok = 0;
  let fail = 0;
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') { fail++; continue; }
    // 字段要求
    if (!('agree' in raw) || !('userReason' in raw)) { fail++; continue; }
    const record: UserCorrection = {
      id: raw.id && !existingIds.has(raw.id) ? String(raw.id) : randomId(),
      time: typeof raw.time === 'number' ? raw.time : Date.now(),
      roundId: Number(raw.roundId) || 0,
      seat: (raw.seat as any) ?? 1,
      systemRecommendCode: raw.systemRecommendCode ?? null,
      systemRecommendName: raw.systemRecommendName ?? null,
      systemShanten: Number(raw.systemShanten) || 0,
      systemReason: String(raw.systemReason || ''),
      candidatesAtTime: Array.isArray(raw.candidatesAtTime) ? raw.candidatesAtTime : [],
      userChoiceCode: raw.userChoiceCode ?? null,
      userChoiceName: raw.userChoiceName ?? null,
      agree: !!raw.agree,
      userReason: String(raw.userReason),
      handCodes: Array.isArray(raw.handCodes) ? raw.handCodes.filter((x: any) => typeof x === 'string') : [],
      meldsCount: Number(raw.meldsCount) || 0,
      hongZhongCount: Number(raw.hongZhongCount) || 0,
      pairCount: Number(raw.pairCount) || 0,
      phase: (['early', 'mid', 'late'] as const).includes(raw.phase) ? raw.phase : 'mid',
      isTenpai: !!raw.isTenpai,
      deckRemaining: Number(raw.deckRemaining) || 0,
    };
    existing.push(record);
    existingIds.add(record.id);
    ok++;
  }
  saveAll(existing);
  return { ok, fail };
}

// ========== 趋势分析 ==========
export function getCorrectionTrend(): CorrectionTrend {
  const all = loadCorrections();
  const agreeCount = all.filter((c) => c.agree).length;
  const total = all.length;
  const agreeRate = total === 0 ? 0 : agreeCount / total;

  // 分歧类型: 根据"系统建议牌 vs 用户选择"归类
  // 简化规则: 按花色差异 / 中张vs边张 / 红中相关
  const disagree = all.filter((c) => !c.agree);
  const catCounts: Record<string, number> = {};
  for (const c of disagree) {
    const cat = categorizeDisagreement(c);
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }
  const topDisagree = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const recent = all.slice(-5).reverse(); // 倒序(最近第1)
  return { totalCorrections: total, agreeRate, topDisagreeCategories: topDisagree, recent };
}

function categorizeDisagreement(c: UserCorrection): string {
  const s = c.systemRecommendCode;
  const u = c.userChoiceCode;
  if (s === u) return '同牌选择分歧';
  if (!s || !u) return '未指定';
  const sSuit = s[0];
  const uSuit = u[0];
  const sRank = parseInt(s.slice(1));
  const uRank = parseInt(u.slice(1));
  // 红中相关
  if (s === 'z5' && u !== 'z5') return '倾向不打红中';
  if (u === 'z5' && s !== 'z5') return '倾向打红中';
  // 花色差
  if (sSuit !== uSuit) return `花色偏好分歧(${sSuitName(sSuit)} vs ${sSuitName(uSuit)})`;
  // 中边差
  const sSide = sRank === 1 || sRank === 9 ? '边张' : sRank >= 3 && sRank <= 7 ? '中张' : '次边张';
  const uSide = uRank === 1 || uRank === 9 ? '边张' : uRank >= 3 && uRank <= 7 ? '中张' : '次边张';
  if (sSide !== uSide) return `中边偏好分歧(${sSide}→${uSide})`;
  return '同花色同类型分歧';
}

function sSuitName(s: string): string {
  return s === 'm' ? '万' : s === 'p' ? '筒' : s === 's' ? '条' : '字牌';
}

// ========== 局势评分(4维) ==========
export function computeSituationScore(ctx: StrategyContext, corrections: UserCorrection[]): SituationScore {
  // 1. 进攻分: 向听越低越高(听牌=100)
  const shanten = Math.max(0, Math.min(4, ctx.shanten));
  const offense = Math.round(Math.max(0, 100 - shanten * 25));

  // 2. 防守分: 基于副露数+副露时防分下降(简化模型)
  let defense = 90 - ctx.meldsCount * 5; // 副露越多,防守位越暴露
  if (ctx.phase === 'late') defense -= 10;
  // 用户校正中常与"防守/扣牌"相关→提分
  const defCorr = corrections.filter((c) =>
    !c.agree && (c.userReason.includes('扣') || c.userReason.includes('防') || c.userReason.includes('生张') || c.userReason.includes('对手需要'))
  ).length;
  defense += defCorr * 2;
  defense = clamp(defense);

  // 3. 牌效分: 基于对子数+红中数+连接度(简化)
  // 对子3-4最佳;红中1-2最佳;向听低也加分
  const pairScore = ctx.pairCount >= 3 && ctx.pairCount <= 4 ? 30 : ctx.pairCount >= 2 ? 20 : 10;
  const hzScore = ctx.hongZhongCount >= 1 && ctx.hongZhongCount <= 2 ? 25 : ctx.hongZhongCount >= 3 ? 30 : 10;
  const tenpaiBonus = ctx.isTenpai ? 20 : (4 - shanten) * 5;
  const tileEfficiency = clamp(pairScore + hzScore + tenpaiBonus + 10);

  // 4. 红中运用健康度
  let hzHealth = 50;
  if (ctx.hongZhongCount === 0) hzHealth = 40;
  else if (ctx.hongZhongCount === 1) hzHealth = ctx.pairCount >= 1 ? 80 : 60;
  else if (ctx.hongZhongCount === 2) hzHealth = 90;
  else hzHealth = 95;
  // 如果用户常不同意"打红中"建议,提高对红中保留的健康分(个性化)
  const disagreeHZ = corrections.filter((c) => !c.agree && c.systemRecommendCode === 'z5').length;
  if (disagreeHZ > 0 && ctx.hongZhongCount >= 1) hzHealth = clamp(hzHealth + disagreeHZ * 3);
  const hongzhongHealth = clamp(hzHealth);

  const overall = Math.round((offense + defense + tileEfficiency + hongzhongHealth) / 4);

  // 标签
  const tags: string[] = [];
  if (ctx.isTenpai) tags.push('听牌中');
  else if (shanten === 1) tags.push('一向听');
  else if (shanten >= 3) tags.push('牌型偏散');
  if (ctx.pairCount >= 5) tags.push('七小对潜力');
  if (ctx.pairCount >= 3 && ctx.pairCount <= 4) tags.push('对子充足');
  if (ctx.pairCount <= 1) tags.push('缺将风险');
  if (ctx.hongZhongCount >= 2) tags.push('红中充足');
  if (ctx.hongZhongCount === 0) tags.push('无红中');
  if (ctx.meldsCount >= 2) tags.push('已多副露');
  if (hongzhongHealth >= 85) tags.push('红中运用优');
  if (hongzhongHealth <= 50) tags.push('红中运用待改进');

  return { offense, defense, tileEfficiency, hongzhongHealth, overall, tags };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ========== 校正加权(个性化建议) ==========
/**
 * 基于用户校正历史加权建议:
 *  如果某牌 code 在过去用户的"选择牌"中出现频率高→加分
 *  如果某牌 code 在过去"系统建议但用户反对"的系统建议中出现→减分
 *  权重随时间衰减(最近的比旧的影响大)
 */
export function correctionWeightedAdvice(advice: AdviceData, corrections: UserCorrection[]): AdviceData {
  if (!advice || corrections.length === 0) return advice;
  if (!advice.candidates || advice.candidates.length === 0) return advice;

  // 建牌code的bias表(加分/减分)
  const bias: Record<string, number> = {};
  const total = corrections.length;
  for (let i = 0; i < total; i++) {
    const c = corrections[i];
    // 越近权重越高(线性)
    const w = 0.4 + (i / Math.max(1, total - 1)) * 0.8; // 0.4~1.2
    if (c.userChoiceCode) {
      bias[c.userChoiceCode] = (bias[c.userChoiceCode] ?? 0) + 0.8 * w;
    }
    if (!c.agree && c.systemRecommendCode) {
      // 用户反对过系统打X,则打X的权重下降
      bias[c.systemRecommendCode] = (bias[c.systemRecommendCode] ?? 0) - 1.2 * w;
    }
  }

  // 应用到candidates(重算score+重排序)
  const weighted = advice.candidates.map((c) => {
    const b = bias[c.code] ?? 0;
    // 原 score 已经是大数(可能是afterShanten*100+afterTing*10等),bias*10保证在可感知范围
    return { ...c, score: c.score + b * 10 };
  });
  weighted.sort((a, b) => b.score - a.score);

  // 更新 recommendDiscard 到新的Top1
  const top = weighted[0];
  const newRec = advice.recommendDiscard && top.code === advice.recommendDiscard.code
    ? advice.recommendDiscard
    : { tileId: -1, code: top.code, name: top.name };

  // 原因中追加个性化提示
  const newReason = appendCorrectionHint(advice.reason, corrections);

  return {
    ...advice,
    candidates: weighted,
    recommendDiscard: newRec,
    reason: newReason,
  };
}

function appendCorrectionHint(reason: string, corrections: UserCorrection[]): string {
  if (corrections.length < 3) return reason;
  // 最近10条统计
  const recent = corrections.slice(-10);
  const disagree = recent.filter((c) => !c.agree).length;
  const agree = recent.length - disagree;
  const hzDisagree = recent.filter((c) => !c.agree && c.systemRecommendCode === 'z5').length;

  const hints: string[] = [];
  if (agree >= disagree * 2) hints.push('近期你认同率高,系统建议已贴近你的偏好。');
  else if (disagree >= 4) hints.push(`近期已纠正${disagree}次,系统已按你的打法调整。`);
  if (hzDisagree >= 2) hints.push(`你倾向保留红中(${hzDisagree}次纠正打红中)`);
  if (hints.length === 0) return reason;
  return reason + ' [个性化] ' + hints.join(' / ');
}

// 供 advisor.ts 调用
export function hintFromCorrections(corrections: UserCorrection[]): string {
  if (corrections.length < 5) return '';
  const trend = getCorrectionTrend();
  const tips: string[] = [];
  if (trend.agreeRate >= 0.75) tips.push(`系统与你偏好契合度${Math.round(trend.agreeRate * 100)}%`);
  if (trend.topDisagreeCategories.length > 0) tips.push(`常见分歧:${trend.topDisagreeCategories[0]}`);
  if (tips.length === 0) return '';
  return ` 【个性化】${tips.join(' · ')}`;
}
