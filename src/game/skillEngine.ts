// 红中万能牌打牌分析引擎 — 从 skill 脚本 (mahjong.py) 1:1 移植
// 规则与 skill 完全一致：
//   - 红中(癞子/万能牌)可当任意牌使用，包括当将牌，共 4 张
//   - 牌组：1-9 万/筒/条 + 东南西北(红中)发白
//   - 胡牌：标准胡型 4 面子 + 1 将（无七对、十三幺等特殊牌型）
//   - 判定：向听数(0=听牌) + 有效进张数(摸到即推进)
// 副露扩展：面子目标 = 4 - melds，总张数 = 14 - 3*melds（一处参数化，数值与 skill 完全一致）
//
// 编码映射（skill 编码 ↔ 项目编码）：
//   万 1-9  -> 1-9      -> m1-m9
//   筒 1-9  -> 11-19    -> p1-p9
//   条 1-9  -> 21-29    -> s1-s9
//   东 南 西 北 发 白   -> 31/32/33/34/36/37 -> z1-z4/z6/z7
//   红中(癞子)          -> 50               -> z5
// 注：skill 字牌"中"(35) 在本游戏中被红中(癞子)取代，不出现在牌组中

export const LAIZI = 50;

// 展示顺序(与手牌摆放一致: 万→筒→条→字, 各花色按点数升序, 字牌按 东南西北中发白)
const DISPLAY_ORDER: Record<string, number> = { m: 0, p: 1, s: 2, z: 3 };
function displayOrder(code: string): number {
  return DISPLAY_ORDER[code[0]] * 100 + parseInt(code.slice(1), 10);
}

const SUIT_BASE: Record<string, number> = { m: 0, p: 10, s: 20 };
const ZI_OF: Record<string, number> = { z1: 31, z2: 32, z3: 33, z4: 34, z5: 50, z6: 36, z7: 37 };
const ZI_NAME: Record<number, string> = { 31: '东', 32: '南', 33: '西', 34: '北', 35: '中', 36: '发', 37: '白' };
const NUM_CN: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const DIG_CN: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

// 牌组全集（不含被红中取代的字牌"中"35）
export const ALL_TILES: number[] = (() => {
  const codes: number[] = [];
  for (let i = 1; i <= 37; i++) {
    if (i % 10 !== 0 && i !== 35) codes.push(i);
  }
  codes.push(LAIZI);
  return codes;
})();

export type Counts = Record<number, number>;

// ─── 编码映射 ───────────────────────────────

export function toSkillCode(code: string): number {
  if (code.length === 2 && code[0] === 'z') return ZI_OF[code] ?? 0;
  const suit = code[0];
  if (SUIT_BASE[suit] === undefined) return 0;
  const rank = parseInt(code.slice(1), 10);
  if (!Number.isFinite(rank) || rank < 1 || rank > 9) return 0;
  return SUIT_BASE[suit] + rank;
}

export function fromSkillCode(sc: number): string {
  if (sc === LAIZI) return 'z5';
  if (sc >= 31 && sc <= 37) {
    for (const [code, v] of Object.entries(ZI_OF)) if (v === sc) return code;
  }
  const suit = sc < 10 ? 'm' : sc < 20 ? 'p' : 's';
  return suit + (sc % 10);
}

export function skillName(sc: number): string {
  if (sc === LAIZI) return '红中';
  if (sc <= 9) return `${sc}万`;
  if (sc <= 19) return `${sc - 10}筒`;
  if (sc <= 29) return `${sc - 20}条`;
  return ZI_NAME[sc] ?? `?${sc}`;
}

export function codeName(code: string): string {
  return skillName(toSkillCode(code));
}

// 从项目编码列表构造 {skillCode: 张数}
export function makeCounts(codes: string[]): Counts {
  const counts: Counts = {};
  for (const c of codes) {
    const sc = toSkillCode(c);
    if (sc > 0) counts[sc] = (counts[sc] ?? 0) + 1;
  }
  return counts;
}

// 从中文文本解析（skill 输入格式，分隔符可忽略）
export function parseHandText(text: string): Counts {
  const counts: Counts = {};
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (' \t,，、;；:：'.includes(ch)) { i++; continue; }
    if (text.startsWith('红中', i)) {
      counts[LAIZI] = (counts[LAIZI] ?? 0) + 1;
      i += 2;
      continue;
    }
    // 字牌
    let ziSc = 0;
    for (const [scStr, nm] of Object.entries(ZI_NAME)) {
      if (nm === ch) { ziSc = Number(scStr); break; }
    }
    if (ziSc > 0) {
      counts[ziSc] = (counts[ziSc] ?? 0) + 1;
      i++;
      continue;
    }
    // 数字
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9]/.test(text[j])) j++;
      const digits = text.slice(i, j);
      if (j < n && '万筒条'.includes(text[j])) {
        const base = text[j] === '万' ? 0 : text[j] === '筒' ? 10 : 20;
        for (const d of digits) {
          const v = parseInt(d, 10);
          const sc = base + v;
          counts[sc] = (counts[sc] ?? 0) + 1;
        }
        i = j + 1;
        continue;
      }
      throw new Error(`数字 "${digits}" 后缺少花色（万/筒/条）`);
    }
    if (NUM_CN[ch] !== undefined) {
      if (i + 1 < n && '万筒条'.includes(text[i + 1])) {
        const sc = (text[i + 1] === '万' ? 0 : text[i + 1] === '筒' ? 10 : 20) + NUM_CN[ch];
        counts[sc] = (counts[sc] ?? 0) + 1;
        i += 2;
        continue;
      }
      throw new Error(`「${ch}」后缺少花色（万/筒/条）`);
    }
    throw new Error(`无法识别的字符：「${ch}」`);
  }
  return counts;
}

export function countsToList(counts: Counts): string[] {
  const out: string[] = [];
  for (const sc of Object.keys(counts).map(Number).sort((a, b) => a - b)) {
    for (let k = 0; k < counts[sc]; k++) out.push(fromSkillCode(sc));
  }
  return out;
}

// ─── 缓存 ───────────────────────────────────

const cache = new Map<string, number>();

function cacheKey(counts: Counts, laizi: number, melds: number): string {
  const keys = Object.keys(counts).map(Number).sort((a, b) => a - b);
  let s = '';
  for (const k of keys) s += k + ':' + counts[k] + ',';
  return `${s}|${laizi}|${melds}`;
}

// ─── 胡牌判定(14-3*melds 张，含癞子) ─────────

function mentsuOk(c: Counts, laizi: number): boolean {
  function dfs(i: number, L: number): boolean {
    while (i <= 37 && !c[i]) i++;
    if (i > 37) return L % 3 === 0;
    const cnt = c[i];
    // 1) 刻子(可补癞子)
    if (cnt >= 3) {
      c[i] -= 3;
      if (dfs(i, L)) { c[i] += 3; return true; }
      c[i] += 3;
    }
    if (cnt >= 2 && L >= 1) {
      c[i] -= 2;
      if (dfs(i, L - 1)) { c[i] += 2; return true; }
      c[i] += 2;
    }
    if (cnt >= 1 && L >= 2) {
      c[i] -= 1;
      if (dfs(i, L - 2)) { c[i] += 1; return true; }
      c[i] += 1;
    }
    // 2) 顺子(仅数牌，癞子可补任意位置: 起点/中间/末尾)
    if (i < 30) {
      const blockStart = i <= 9 ? 1 : i <= 19 ? 11 : 21; // 万1-9 / 筒11-19 / 条21-29
      const blockEnd = blockStart + 8;
      for (let pos = 0; pos < 3; pos++) {
        const s = i - pos; // 顺子起点
        if (s < blockStart || s + 2 > blockEnd) continue;
        const have: number[] = [];
        for (let k = 0; k < 3; k++) {
          if (c[s + k] > 0) have.push(s + k);
        }
        const need = 3 - have.length;
        if (need <= L) {
          for (const d of have) c[d] -= 1;
          if (dfs(i, L - need)) {
            for (const d of have) c[d] += 1;
            return true;
          }
          for (const d of have) c[d] += 1;
        }
      }
    }
    return false; // 不允许丢弃浮牌：12 张必须全部组成面子
  }
  return dfs(1, laizi);
}

function isWinImpl(counts: Counts, laizi: number, melds: number): boolean {
  const key = cacheKey(counts, laizi, melds);
  const hit = cache.get(key);
  if (hit !== undefined) return hit === 1;
  const c = { ...counts };
  const total = Object.values(c).reduce((s, x) => s + x, 0) + laizi;
  let result = false;
  if (total === 14 - 3 * melds) {
    // 枚举将牌(2 同牌 / 1真+1癞 / 2癞)，其余 (12-3*melds) 张须拆成 (4-melds) 面子
    for (let i = 1; i <= 37; i++) {
      const n = c[i] ?? 0;
      if (n >= 2) {
        const cc = { ...c };
        cc[i] -= 2;
        if (cc[i] === 0) delete cc[i];
        if (mentsuOk(cc, laizi)) { result = true; break; }
      }
      if (n >= 1 && laizi >= 1) {
        const cc = { ...c };
        cc[i] -= 1;
        if (cc[i] === 0) delete cc[i];
        if (mentsuOk(cc, laizi - 1)) { result = true; break; }
      }
    }
    if (!result && laizi >= 2 && mentsuOk(c, laizi - 2)) result = true;
  }
  cache.set(key, result ? 1 : 0);
  return result;
}

export function isWin(counts: Counts, laizi: number, melds = 0): boolean {
  return isWinImpl(counts, laizi, melds);
}

// ─── 向听数(13-3*melds 张，含癞子) ──────────

function shantenImpl(counts: Counts, laizi: number, melds: number): number {
  const key = cacheKey(counts, laizi, melds);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = { ...counts };
  const mTarget = 4 - melds; // 面子目标
  let best = 8 + 6 * melds;  // 上限：2*mTarget+1

  // 癞子收尾分配：f=补面子 h=补雀头 p=补搭子（向听 = 2*mTarget - 2F - H - P，与 skill 公式同构）
  function finish(F: number, H: number, P: number, L: number): void {
    const maxf = Math.min(mTarget - F, Math.floor(L / 3));
    for (let f = 0; f <= maxf; f++) {
      const lf = L - 3 * f;
      for (let h = 0; h <= 1; h++) {
        if (h && (H === 1 || lf < 2)) continue;
        const lp = lf - 2 * h;
        let p = Math.min(lp, mTarget - (F + f) - P);
        if (p < 0) p = 0;
        let s = 2 * mTarget - (2 * (F + f) + (H + h) + (P + p));
        if (s < 0) s = 0;
        if (s < best) best = s;
      }
    }
  }

  function dfs(i: number, F: number, H: number, P: number, L: number, cc: Counts): void {
    if (F > mTarget || P > mTarget - F) return;
    while (i <= 37 && !cc[i]) i++;
    if (i > 37) { finish(F, H, P, L); return; }
    const cnt = cc[i];
    // 1) 刻子
    if (cnt >= 3) {
      cc[i] -= 3;
      dfs(i, F + 1, H, P, L, cc);
      cc[i] += 3;
    }
    // 2) 顺子(可用癞子补任意位置: 起点/中间/末尾)
    if (i < 30) {
      const blockStart = i <= 9 ? 1 : i <= 19 ? 11 : 21; // 万1-9 / 筒11-19 / 条21-29
      const blockEnd = blockStart + 8;
      for (let pos = 0; pos < 3; pos++) {
        const s = i - pos; // 顺子起点
        if (s < blockStart || s + 2 > blockEnd) continue;
        const have: number[] = [];
        for (let k = 0; k < 3; k++) {
          if (cc[s + k] > 0) have.push(s + k);
        }
        const need = 3 - have.length;
        if (need <= L) {
          for (const d of have) cc[d] -= 1;
          dfs(i, F + 1, H, P, L - need, cc);
          for (const d of have) cc[d] += 1;
        }
      }
    }
    // 3) 雀头 / 搭子
    // 搭子类型: 对子(cnt>=2) / 相邻搭子(i,i+1) / 嵌张搭子(i,i+2, 如24万进3、13筒进2、68筒进7)
    if (H === 0) {
      if (cnt >= 2) {
        cc[i] -= 2;
        dfs(i, F, H + 1, P, L, cc);
        cc[i] += 2;
      }
      if (cnt >= 2) {
        cc[i] -= 2;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 2;
      }
      if (i < 30 && [1, 2, 3, 4, 5, 6, 7, 8].includes(i % 10) && cnt >= 1 && cc[i + 1] >= 1) {
        cc[i] -= 1; cc[i + 1] -= 1;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 1; cc[i + 1] += 1;
      }
      if (i < 30 && [1, 2, 3, 4, 5, 6, 7].includes(i % 10) && cnt >= 1 && cc[i + 2] >= 1) {
        cc[i] -= 1; cc[i + 2] -= 1;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 1; cc[i + 2] += 1;
      }
    } else {
      if (cnt >= 2) {
        cc[i] -= 2;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 2;
      }
      if (i < 30 && [1, 2, 3, 4, 5, 6, 7, 8].includes(i % 10) && cnt >= 1 && cc[i + 1] >= 1) {
        cc[i] -= 1; cc[i + 1] -= 1;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 1; cc[i + 1] += 1;
      }
      if (i < 30 && [1, 2, 3, 4, 5, 6, 7].includes(i % 10) && cnt >= 1 && cc[i + 2] >= 1) {
        cc[i] -= 1; cc[i + 2] -= 1;
        dfs(i, F, H, P + 1, L, cc);
        cc[i] += 1; cc[i + 2] += 1;
      }
    }
    // 4) 搭子：单张 + 癞子
    if (cnt >= 1 && L >= 1) {
      cc[i] -= 1;
      dfs(i, F, H, P + 1, L - 1, cc);
      cc[i] += 1;
    }
    // 5) 浮牌：整张丢弃
    if (cnt >= 1) {
      cc[i] = 0;
      dfs(i + 1, F, H, P, L, cc);
      cc[i] = cnt;
    }
  }

  dfs(1, 0, 0, 0, laizi, c);
  cache.set(key, best);
  return best;
}

export function shanten(counts: Counts, laizi: number, melds = 0): number {
  return shantenImpl(counts, laizi, melds);
}

// ─── 有效进张 / 听牌 ────────────────────────

export interface TileRemain {
  code: string;   // 项目编码
  name: string;   // 中文名
  remain: number; // 剩余估算张数(4 - 手中张数)
}

function remaining(counts13: Counts, laizi13: number, sc: number, seen?: Counts): number {
  const seenN = seen ? (seen[sc] ?? 0) : 0;
  if (sc === LAIZI) return 4 - laizi13 - seenN;
  return 4 - (counts13[sc] ?? 0) - seenN;
}

// 已听牌(向听 0)：返回可胡的牌列表(按手牌摆放顺序)
export function winningTiles(counts13: Counts, laizi13: number, melds = 0, seen?: Counts): TileRemain[] {
  const wins: TileRemain[] = [];
  for (const sc of ALL_TILES) {
    let c14: Counts;
    let l14: number;
    if (sc === LAIZI) {
      c14 = { ...counts13 };
      l14 = laizi13 + 1;
    } else {
      c14 = { ...counts13 };
      c14[sc] = (c14[sc] ?? 0) + 1;
      l14 = laizi13;
    }
    if (isWin(c14, l14, melds)) {
      const r = remaining(counts13, laizi13, sc, seen);
      if (r > 0) wins.push({ code: fromSkillCode(sc), name: skillName(sc), remain: r });
    }
  }
  wins.sort((a, b) => displayOrder(a.code) - displayOrder(b.code));
  return wins;
}

// 向听 s>0：返回有效进张(摸到后将向听降到 s-1)
export function advancingTiles(counts13: Counts, laizi13: number, s: number, melds = 0, seen?: Counts): TileRemain[] {
  const adv: TileRemain[] = [];
  for (const sc of ALL_TILES) {
    if (remaining(counts13, laizi13, sc, seen) <= 0) continue;
    const c14: Counts = { ...counts13 };
    c14[sc] = (c14[sc] ?? 0) + 1;
    const l14 = laizi13 + (sc === LAIZI ? 1 : 0);
    let found = false;
    for (const yStr of Object.keys(c14)) {
      const y = Number(yStr);
      if (c14[y] <= 0) continue;
      let c13b = { ...c14 };
      let l13b = l14;
      if (y === LAIZI) {
        l13b = l14 - 1;
      } else {
        c13b[y] -= 1;
        if (c13b[y] === 0) delete c13b[y];
      }
      if (shanten(c13b, l13b, melds) === s - 1) { found = true; break; }
    }
    if (found) adv.push({ code: fromSkillCode(sc), name: skillName(sc), remain: remaining(counts13, laizi13, sc, seen) });
  }
  adv.sort((a, b) => displayOrder(a.code) - displayOrder(b.code));
  return adv;
}

// ─── 打牌推荐 ───────────────────────────────

export interface SkillScenario {
  discardCode: string;     // 打出的牌(项目编码)
  discardName: string;     // 中文名
  shantenAfter: number;    // 打出后向听
  isTenpai: boolean;       // 是否听牌
  tiles: TileRemain[];     // 听牌=可胡牌；非听=有效进张
  categoryCount: number;   // 去重门数
  tileCount: number;       // 张数合计
}

export interface SkillAnalysis {
  handCodes: string[];       // 传入的手牌
  melds: number;
  currentShanten: number;    // 当前手牌向听(打出一张后最优)
  isWinNow: boolean;         // 当前 14-3*melds 张已胡
  scenarios: SkillScenario[];
  note: string;              // 规则提示
}

// 手牌应为 14-3*melds 张(摸牌后待打一张)
// seen: 已见牌(各家舍牌/副露), 用于扣除剩余张数
export function analyzeHand(codes: string[], melds = 0, seen?: Counts): SkillAnalysis {
  const counts = makeCounts(codes);
  const total = Object.values(counts).reduce((s, x) => s + x, 0);
  if (total !== 14 - 3 * melds) {
    throw new Error(`手牌应为 ${14 - 3 * melds} 张(摸牌后待打一张)，当前 ${total} 张`);
  }
  const laizi = counts[LAIZI] ?? 0;
  const countsNoHz = { ...counts };
  delete countsNoHz[LAIZI];

  const isWinNow = isWin(countsNoHz, laizi, melds);
  if (isWinNow) {
    return {
      handCodes: codes.slice(),
      melds,
      currentShanten: -1,
      isWinNow: true,
      scenarios: [],
      note: '标准胡型(4面子+1将，红中可当任意牌)',
    };
  }

  const rows: SkillScenario[] = [];
  const cand = new Set<number>();
  for (const k of Object.keys(countsNoHz)) cand.add(Number(k));
  if (laizi > 0) cand.add(LAIZI);

  for (const y of cand) {
    let c13: Counts;
    let l13: number;
    if (y === LAIZI) {
      c13 = { ...countsNoHz };
      l13 = laizi - 1;
    } else {
      c13 = { ...countsNoHz };
      c13[y] -= 1;
      if (c13[y] === 0) delete c13[y];
      l13 = laizi;
    }
    const s = shanten(c13, l13, melds);
    const tiles = s === 0 ? winningTiles(c13, l13, melds, seen) : advancingTiles(c13, l13, s, melds, seen);
    rows.push({
      discardCode: fromSkillCode(y),
      discardName: skillName(y),
      shantenAfter: s,
      isTenpai: s === 0,
      tiles,
      categoryCount: tiles.length,
      tileCount: tiles.reduce((sum, t) => sum + t.remain, 0),
    });
  }

  rows.sort((a, b) => {
    if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
    // 同等向听下: 优先总张数多(充分考虑重复进张), 再比门数
    if (b.tileCount !== a.tileCount) return b.tileCount - a.tileCount;
    if (b.tiles.length !== a.tiles.length) return b.tiles.length - a.tiles.length;
    return toSkillCode(a.discardCode) - toSkillCode(b.discardCode);
  });

  return {
    handCodes: codes.slice(),
    melds,
    currentShanten: rows.length > 0 ? rows[0].shantenAfter : 99,
    isWinNow: false,
    scenarios: rows,
    note: '标准胡型(4面子+1将，红中可当任意牌)',
  };
}

// 13-3*melds 张手牌(已打出一张)：仅当前状态，无候选
// seen: 已见牌(各家舍牌/副露), 用于扣除剩余张数
export function analyzePartialHand(codes: string[], melds = 0, seen?: Counts): {
  shanten: number;
  isTenpai: boolean;
  tiles: TileRemain[];
  tileCount: number;
} {
  const counts = makeCounts(codes);
  const laizi = counts[LAIZI] ?? 0;
  const countsNoHz = { ...counts };
  delete countsNoHz[LAIZI];
  const s = shanten(countsNoHz, laizi, melds);
  const tiles = s === 0 ? winningTiles(countsNoHz, laizi, melds, seen) : advancingTiles(countsNoHz, laizi, s, melds, seen);
  return {
    shanten: s,
    isTenpai: s === 0,
    tiles,
    tileCount: tiles.reduce((sum, t) => sum + t.remain, 0),
  };
}