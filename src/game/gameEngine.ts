// 游戏引擎: 状态机与回合控制
import type {
  GameState, PlayerState, Seat, Tile, ActionOption, Meld, UserDecomposition, DecompositionBlock,
} from './types';
import { tileCode, tileName, SEAT_NAME } from './types';
import { dealWithCheck, initPlayers } from './deal';
import { buildDeck } from './tile';
import { shuffle } from './shuffle';
import { indexToTile } from './types';
import { sortHand } from './sort';
import { canWin, checkTing } from './win';
import {
  getActionsForDiscard, getSelfActions, getAllSelfActions, getQiangGangActions,
  applyPeng, applyMinggang, applyAngang, applyBugang,
} from './rules';
import { addLog, resetLog } from './logger';
import { nextSeat, HUMAN_SEAT } from './constants';
import { buildAdvice, detectMistake } from './advisor';
import { buildReview } from './review';

// 深拷贝状态(供React不可变更新)
function clone(state: GameState): GameState {
  return structuredClone(state);
}

// 创建初始空状态
export function createInitialState(): GameState {
  return {
    deck: [],
    wallTailIndex: 0,
    players: [],
    currentSeat: 1,
    banker: 0,
    phase: 'idle',
    lastDiscard: null,
    winner: null,
    isDraw: false,
    round: 0,
    log: [],
    pendingOptions: [],
    drawCount: 0,
    isFirstRound: true,
    selfActions: [],
    reactRemaining: [],
    discardSource: null,
    reactMode: null,
    qianggangVictim: null,
    qianggangTile: null,
    gangEvents: [],
    // 撤销/重做历史
    history: [],
    historyIndex: -1,
    drawnTileId: null,
    lastAdvice: null,
    lastMistake: null,
    review: null,
    lastCorrection: null,
  };
}

// ===== 撤销/重做历史 =====
const MAX_HISTORY = 20;

// 在执行一次可撤销动作前记录快照(返回新状态, 快照不含history避免嵌套膨胀)
export function pushHistory(state: GameState, action: string): GameState {
  const s = structuredClone(state);
  // 若在回退途中执行新动作, 丢弃之后的历史(标准undo栈语义)
  if (s.historyIndex < s.history.length - 1) {
    s.history = s.history.slice(0, s.historyIndex + 1);
  }
  const snapshot = structuredClone(s);
  snapshot.history = [];
  snapshot.historyIndex = -1;
  s.history.push({
    action,
    stateBefore: snapshot,
    timestamp: Date.now(),
  });
  if (s.history.length > MAX_HISTORY) s.history.shift();
  s.historyIndex = s.history.length - 1;
  return s;
}

// 撤销: 返回上一步状态(保留历史栈与指针以便重做), 无历史返回null
export function popHistory(state: GameState): GameState | null {
  if (state.historyIndex <= 0) return null;
  const newIdx = state.historyIndex - 1;
  const prev = state.history[newIdx];
  if (!prev) return null;
  const restored = structuredClone(prev.stateBefore);
  restored.history = state.history;
  restored.historyIndex = newIdx;
  return restored;
}

// 重做: 返回下一步状态, 无可重做返回null
export function redoHistory(state: GameState): GameState | null {
  if (state.historyIndex >= state.history.length - 1) return null;
  const newIdx = state.historyIndex + 1;
  const next = state.history[newIdx];
  if (!next) return null;
  const restored = structuredClone(next.stateBefore);
  restored.history = state.history;
  restored.historyIndex = newIdx;
  return restored;
}

// ===== 牌型自动分解 =====
// 在保持原手牌顺序的前提下, 将手牌切成若干"块"(meld/pair/taatsu/float),
// 块与块之间在UI上以间隔区分。优先级: 成牌(顺子/刻子) > 对子 > 搭子 > 散张。
// 红中(癞子)散张尽量并入末尾的搭子/对子块, 组成"红中+搭"的强搭子。
export function decomposeHand(hand: Tile[], melds: Meld[]): UserDecomposition {
  const blocks: DecompositionBlock[] = [];
  const n = hand.length;
  let i = 0;

  // 判断从 idx 开始是否有 n 张同花色连续(顺子)或相同(刻子/对子)
  const sameRun = (idx: number, count: number): boolean => {
    if (idx + count > n) return false;
    const code = tileCode(hand[idx]);
    for (let k = 1; k < count; k++) {
      if (tileCode(hand[idx + k]) !== code) return false;
    }
    return true;
  };
  const seqRun = (idx: number): boolean => {
    if (idx + 3 > n) return false;
    const a = hand[idx], b = hand[idx + 1], c = hand[idx + 2];
    if (a.suit === 'z') return false;
    return a.suit === b.suit && a.suit === c.suit && a.rank + 1 === b.rank && b.rank + 1 === c.rank;
  };
  // 搭子: 同花色相邻(rank差1)或嵌张(rank差2)
  const isTaatsu = (idx: number): boolean => {
    if (idx + 2 > n) return false;
    const a = hand[idx], b = hand[idx + 1];
    if (a.suit === 'z') return false;
    if (a.suit !== b.suit) return false;
    return b.rank - a.rank === 1 || b.rank - a.rank === 2;
  };

  // 第一步: 从左到右贪心切块(成牌→对子→搭子→散张)
  while (i < n) {
    const t0 = hand[i];
    const isHz = t0.suit === 'z' && t0.rank === 5; // 红中
    if (sameRun(i, 3) || seqRun(i)) {
      blocks.push({ kind: 'meld', tiles: hand.slice(i, i + 3) });
      i += 3;
    } else if (sameRun(i, 2)) {
      blocks.push({ kind: 'pair', tiles: hand.slice(i, i + 2) });
      i += 2;
    } else if (!isHz && isTaatsu(i)) {
      blocks.push({ kind: 'taatsu', tiles: hand.slice(i, i + 2) });
      i += 2;
    } else {
      blocks.push({ kind: 'float', tiles: [t0] });
      i += 1;
    }
  }

  // 第二步: 将散张并入左邻非成牌块(568万→一整块, 124筒→一整块)
  mergeFloatsIntoNeighbor(blocks);

  // 第三步: 红中并入末尾的非成牌块(搭子/对子/散张)
  mergeHongZhong(blocks);

  // 向听数与成牌判定(近似)
  const meldsCount = melds.length;
  const meldN = blocks.filter((b) => b.kind === 'meld').length;
  const pairN = blocks.filter((b) => b.kind === 'pair').length;
  const taaN = blocks.filter((b) => b.kind === 'taatsu').length;
  const totalMeld = meldsCount + meldN;
  // 向听近似: 目标4面子+1将; 每缺1面子+2向听, 已有雀头-1, 搭子顶面子
  const needMeld = Math.max(0, 4 - totalMeld);
  const shanten = Math.max(0, needMeld * 2 - (pairN >= 1 ? 1 : 0) - Math.min(needMeld, taaN));
  const isValidMahjong = totalMeld === 4 && pairN >= 1 && blocks.every((b) => b.kind === 'meld' || b.kind === 'pair');

  // 牌分类标记
  const tileClasses = new Map<Tile, 'set' | 'loose'>();
  for (const b of blocks) {
    const cls: 'set' | 'loose' = b.kind === 'meld' || b.kind === 'pair' ? 'set' : 'loose';
    for (const t of b.tiles) tileClasses.set(t, cls);
  }

  return { blocks, shanten, isValidMahjong, tileClasses };
}

// 将散张(float)并入左邻的非成牌块(若能与之组成搭子/对子), 使"568万"这样的浮牌+搭子保持一整块
function mergeFloatsIntoNeighbor(blocks: DecompositionBlock[]): void {
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'float') continue;
    const prev = blocks[i - 1];
    if (prev.kind === 'meld') continue; // 成牌块边界不动
    const lastTile = prev.tiles[prev.tiles.length - 1];
    const ft = b.tiles[0];
    if (ft.suit !== lastTile.suit) continue;
    // 与左邻最后一张同码(对子)或差1/2(搭子) → 并入
    const diff = Math.abs(ft.rank - lastTile.rank);
    if (diff === 0 || diff === 1 || diff === 2) {
      blocks[i - 1] = { kind: 'taatsu', tiles: [...prev.tiles, ...b.tiles] };
      blocks.splice(i, 1);
      i--; // 重新检查(可能继续并入更多浮牌)
    }
  }
}

// 将末尾连续的红中散张并入最后一个非成牌块(使其成为带红中的强搭子)
function mergeHongZhong(blocks: DecompositionBlock[]): void {
  // 从后往前找: 若最后几个块是红中 float, 将其并入它之前的非meld块
  const isHzBlock = (b: DecompositionBlock): boolean =>
    b.kind === 'float' && b.tiles[0].suit === 'z' && b.tiles[0].rank === 5;

  let lastIdx = blocks.length - 1;
  while (lastIdx >= 0 && isHzBlock(blocks[lastIdx])) lastIdx--;
  // 收集所有末尾红中
  const hzTiles: Tile[] = [];
  for (let k = blocks.length - 1; k > lastIdx; k--) hzTiles.unshift(...blocks[k].tiles);
  if (hzTiles.length === 0) return;
  blocks.splice(lastIdx + 1); // 移除末尾红中块

  // 目标: 并入它之前的最后一个非meld块(如果有)
  let target = -1;
  for (let k = blocks.length - 1; k >= 0; k--) {
    if (blocks[k].kind !== 'meld') { target = k; break; }
  }
  if (target >= 0) {
    blocks[target] = { kind: 'taatsu', tiles: [...blocks[target].tiles, ...hzTiles] };
  } else {
    // 全是成牌, 红中自成一组
    blocks.push({ kind: 'pair', tiles: hzTiles });
  }
}

// 开始新局
export function startNewRound(state: GameState, banker?: Seat): GameState {
  const s = createInitialState();
  s.round = state.round + 1;
  resetLog();
  const b: Seat = banker ?? state.banker ?? 0;
  s.banker = b;
  const { deck, hands } = dealWithCheck(b);
  s.deck = deck;
  s.wallTailIndex = deck.length - 1;
  s.players = initPlayers(hands, b);
  s.currentSeat = b;
  s.isFirstRound = true;
  s.phase = 'discard'; // 庄家已有14张，需出牌
  // 记录发牌日志
  addLog(s.log, 'system', `第${s.round}局开始`, `庄家:${SEAT_NAME[b]}`);
  for (let i = 0; i < 4; i++) {
    const p = s.players[i];
    addLog(s.log, p.seat, '发牌', p.hand.map((t) => tileName(t)).join(' '));
  }
  // 庄家自检暗杠/补杠(开局扫描全部手牌)
  s.selfActions = getAllSelfActions(s.players[b]);
  // 若人类是庄家，开局即给出建议
  if (b === HUMAN_SEAT) {
    s.lastAdvice = buildAdvice(s, b);
  }
  return s;
}

// 自选手牌开局(模拟对弈): 人类自选14张牌, AI正常从牌池发13张
export function startCustomRound(state: GameState, humanCodes: string[], banker?: Seat): GameState {
  const s = createInitialState();
  s.round = state.round + 1;
  resetLog();
  const b: Seat = banker ?? HUMAN_SEAT;
  s.banker = b;

  // 拼一个完整牌库: 先按人类所选牌序, 从牌库中取出对应牌的真实实例(每张id唯一),
  // 与"开始游戏"的随机发牌完全一致, 避免 id 重复导致出牌/点名错乱
  const fullDeck = shuffle(buildDeck());
  const count: Record<string, number> = {};
  for (const c of humanCodes) count[c] = (count[c] || 0) + 1;
  let humanHand: Tile[] = [];
  const remaining: typeof fullDeck = [];
  for (const t of fullDeck) {
    const code = tileCode(t);
    if ((count[code] || 0) > 0) {
      count[code]--;
      humanHand.push(t);
    } else {
      remaining.push(t);
    }
  }
  humanHand = sortHand(humanHand);

  // 给AI发13张
  const hands: Tile[][] = [[], [], [], []];
  hands[HUMAN_SEAT] = humanHand;
  let ptr = 0;
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    if (seat === HUMAN_SEAT) continue;
    hands[seat] = remaining.slice(ptr, ptr + 13);
    ptr += 13;
  }
  s.deck = remaining.slice(ptr);
  s.wallTailIndex = s.deck.length - 1;
  s.players = initPlayers(hands, b);
  s.currentSeat = b;
  s.isFirstRound = true;
  s.phase = 'discard';
  addLog(s.log, 'system', `第${s.round}局开始(自选手牌)`, `庄家:${SEAT_NAME[b]}`);
  for (let i = 0; i < 4; i++) {
    const p = s.players[i];
    addLog(s.log, p.seat, '发牌', p.hand.map((t) => tileName(t)).join(' '));
  }
  s.selfActions = getAllSelfActions(s.players[b]);
  if (b === HUMAN_SEAT) {
    s.lastAdvice = buildAdvice(s, b);
  }
  return s;
}

// 摸牌
export function drawTile(state: GameState, seat: Seat): GameState {
  const s = clone(state);
  if (s.deck.length === 0) {
    // 流局
    s.phase = 'gameover';
    s.isDraw = true;
    addLog(s.log, 'system', '牌堆已摸完，流局');
    s.review = buildReview(s);
    return s;
  }
  const tile = s.deck.shift()!;
  // 新牌追加到末尾，不参与自动理牌(等待玩家确认出牌后再整理)
  s.players[seat].hand.push(tile);
  s.drawnTileId = tile.id;
  s.drawCount++;
  addLog(s.log, seat, '摸牌', tileName(tile));
  // 首巡过后取消首巡标记
  if (s.drawCount > 4) s.isFirstRound = false;
  // 自摸胡判定
  if (canWin(s.players[seat].hand, s.players[seat].melds.length)) {
    if (!s.players[seat].isHuman) {
      // AI: 立即自动胡
      s.phase = 'gameover';
      s.winner = seat;
      s.drawnTileId = null;
      addLog(s.log, seat, '自摸胡牌', s.players[seat].hand.map((t) => tileName(t)).join(' '));
      s.review = buildReview(s);
      return s;
    }
    // 人类: 不强制胡, 提供"自摸胡"选项 + 保留暗杠/补杠选项
    const huAction: ActionOption = { type: 'hu', seat };
    const selfActs = getSelfActions(s.players[seat], tile);
    s.selfActions = [huAction, ...selfActs];
    s.currentSeat = seat;
    s.pendingOptions = [];
    s.phase = 'discard'; // 等待玩家手动点"胡"或选择放弃
    // 能胡时不生成建议(避免干扰玩家选择)
    s.lastAdvice = null;
    return s;
  }
  // 不能胡: 正常进入出牌阶段, 检查暗杠/补杠
  s.currentSeat = seat;
  s.selfActions = getSelfActions(s.players[seat], tile);
  s.pendingOptions = [];
  s.phase = 'discard';
  // 给人类生成最优打法建议
  if (seat === HUMAN_SEAT) {
    s.lastAdvice = buildAdvice(s, seat);
    s.lastMistake = null;
  }
  return s;
}

// 出牌
export function discardTile(state: GameState, seat: Seat, tileId: number): GameState {
  const s = clone(state);
  const player = s.players[seat];
  const idx = player.hand.findIndex((t) => t.id === tileId);
  if (idx < 0) return s;
  const [tile] = player.hand.splice(idx, 1);
  player.discards.push(tile);
  // 出牌后对剩余手牌自动整理(万→筒→条→字升序，同牌成组)
  player.hand = sortHand(player.hand);
  s.lastDiscard = { seat, tile };
  s.pendingOptions = [];
  s.selfActions = [];
  s.drawnTileId = null;
  addLog(s.log, seat, '出牌', tileName(tile));
  // 人类出牌后检测是否失误(对比上一条建议)
  if (seat === HUMAN_SEAT && s.lastAdvice) {
    s.lastMistake = detectMistake(s, seat, tile);
  }
  // 人类出牌后(13张)检查听牌, 若已听牌则保留听牌提示
  if (seat === HUMAN_SEAT) {
    const tingTiles = checkTing(player.hand, player.melds.length);
    if (tingTiles.length > 0) {
      const tingNames = tingTiles.map((c) => tileName(codeToTile(c)));
      s.lastAdvice = {
        seat,
        recommendDiscard: null,
        reason: `听牌中, 可胡: ${tingNames.join('、')}`,
        tingTiles,
        shanten: 0,
        candidates: [],
      };
    } else {
      s.lastAdvice = null;
    }
  } else {
    s.lastAdvice = null;
  }
  // 检查其他三家是否碰/杠
  return processDiscardReact(s, seat);
}

// 牌型代码转 Tile(用于显示听牌中文名)
function codeToTile(code: string): Tile {
  const suit = code[0] as Tile['suit'];
  const rank = parseInt(code.slice(1), 10);
  return { id: -1, suit, rank };
}

// 处理出牌后的碰/杠反应(按逆时针顺序: 下家→对家→上家)
function processDiscardReact(state: GameState, discarder: Seat): GameState {
  const s = state;
  const order: Seat[] = [
    nextSeat(discarder),
    ((discarder + 2) % 4) as Seat,
    ((discarder + 1) % 4) as Seat, // 上家(prevSeat), 原实现误写为(d+3)%4与下家重复
  ];
  s.discardSource = discarder;
  return processReactQueue(s, order, 0);
}

function processReactQueue(state: GameState, order: Seat[], startIdx: number): GameState {
  const s = state;
  for (let i = startIdx; i < order.length; i++) {
    const seat = order[i];
    const player = s.players[seat];
    const discard = s.lastDiscard!.tile;
    const opts = getActionsForDiscard(player, discard, s.discardSource!);
    if (opts.length === 0) continue;
    if (player.isHuman) {
      // 等待人类选择
      s.pendingOptions = opts;
      s.reactRemaining = order.slice(i + 1);
      s.phase = 'react';
      s.reactMode = 'discard';
      return s;
    }
    // AI决策
    const decision = aiDecideAction(opts, player, s);
    if (decision !== 'pass') {
      return applyAction(s, decision, true);
    }
    // AI放弃，继续
  }
  // 无人操作，轮到下家摸牌
  return advanceToDraw(s);
}

// 推进到下家摸牌
function advanceToDraw(state: GameState): GameState {
  const s = state;
  s.currentSeat = nextSeat(s.discardSource ?? s.currentSeat);
  s.pendingOptions = [];
  s.selfActions = [];
  s.lastDiscard = null;
  s.reactRemaining = [];
  s.phase = 'draw';
  return s;
}

export function humanPassReact(state: GameState): GameState {
  const s = clone(state);
  const remaining = s.reactRemaining ?? [];
  // 补杠反应(抢杠)走抢杠队列, 出牌反应(碰/杠)走原队列
  if (s.reactMode === 'qianggang') {
    return processQianggangQueue(s, remaining, 0);
  }
  return processReactQueue(s, remaining, 0);
}

// 应用操作(碰/杠/抢杠胡)
export function applyAction(state: GameState, option: ActionOption, isReact: boolean): GameState {
  const s = clone(state);
  const player = s.players[option.seat];
  // 抢杠胡: 人类点击"抢杠"按钮(补杠反应中)
  if (option.type === 'hu' && s.qianggangVictim !== null) {
    return applyQianggangHu(s, option.seat);
  }
  // 碰/杠会取走刚打出的牌，从打出者弃牌区移除
  if (isReact && s.lastDiscard) {
    const ds = s.discardSource!;
    const dplayer = s.players[ds];
    // 移除最后一张弃牌(即被取走的牌)
    if (dplayer.discards.length > 0) dplayer.discards.pop();
  }
  if (option.type === 'peng') {
    applyPeng(player, option.meld!);
    addLog(s.log, option.seat, '碰', tileName(option.tile!));
    s.currentSeat = option.seat;
    s.pendingOptions = [];
    s.selfActions = [];
    s.lastDiscard = null;
    s.phase = 'discard';
    return s;
  }
  // 杠(明杠/暗杠/补杠)统一处理: 副露 + 杠后补牌(末尾)
  if (option.type === 'minggang') {
    applyMinggang(player, option.meld!);
    addLog(s.log, option.seat, '明杠', tileName(option.tile!));
    recordGang(s, option.seat, 'minggang');
  } else if (option.type === 'angang') {
    applyAngang(player, option.meld!);
    addLog(s.log, option.seat, '暗杠', tileName(option.meld!.tiles[0]));
    recordGang(s, option.seat, 'angang');
  } else if (option.type === 'bugang') {
    applyBugang(player, option.meld!);
    addLog(s.log, option.seat, '补杠', tileName(option.tile!));
    // 补杠可能被其他家抢杠胡: 先检查抢杠, 无人抢杠计分为成立(补杠也属明杠计3分)
    s.currentSeat = option.seat;
    s.pendingOptions = [];
    s.selfActions = [];
    s.lastDiscard = null;
    return checkQiangGang(s, option.seat, option.tile!);
  }
  s.currentSeat = option.seat;
  // 杠后补牌(从牌堆末尾摸一张)
  return gangRinshan(s, option.seat);
}

// 记录杠分事件(杠家 +6/+3, 其他三家 -2/-1)
function recordGang(state: GameState, seat: Seat, type: 'angang' | 'minggang' | 'bugang'): void {
  const selfDelta = type === 'angang' ? 6 : 3;
  const otherDelta = type === 'angang' ? -2 : -1;
  const time = state.log.length;
  state.gangEvents.push({ time, seat, gangSeat: seat, type, delta: selfDelta });
  for (let i = 0; i < 4; i++) {
    const os = i as Seat;
    if (os !== seat) state.gangEvents.push({ time, seat: os, gangSeat: seat, type, delta: otherDelta });
  }
}

// 检查其他三家能否抢杠胡(补杠后调用)
function checkQiangGang(state: GameState, victim: Seat, tile: Tile): GameState {
  const s = state;
  s.qianggangVictim = victim;
  s.qianggangTile = tile;
  const order: Seat[] = [
    nextSeat(victim),
    ((victim + 2) % 4) as Seat,
    ((victim + 1) % 4) as Seat, // 上家, 原实现误写为(victim+3)%4与下家重复
  ];
  return processQianggangQueue(s, order, 0);
}

// 抢杠判定队列(逆时针): 人类等待选择, AI能胡必抢
function processQianggangQueue(state: GameState, order: Seat[], startIdx: number): GameState {
  const s = state;
  const victim = s.qianggangVictim!;
  const tile = s.qianggangTile!;
  for (let i = startIdx; i < order.length; i++) {
    const seat = order[i];
    const player = s.players[seat];
    const opts = getQiangGangActions(player, tile, victim);
    if (opts.length === 0) continue;
    if (player.isHuman) {
      // 等待人类决定是否抢杠
      s.pendingOptions = opts;
      s.reactRemaining = order.slice(i + 1);
      s.phase = 'react';
      s.reactMode = 'qianggang';
      return s;
    }
    // AI: 能抢必抢
    return applyQianggangHu(s, seat);
  }
  // 无人抢杠 → 补杠成立: 计明杠分 + 岭上补牌
  s.qianggangVictim = null;
  s.qianggangTile = null;
  recordGang(s, victim, 'bugang');
  return gangRinshan(s, victim);
}

// 执行抢杠胡: 杠取消(副露回退为碰), 抢杠者胡牌
function applyQianggangHu(state: GameState, seat: Seat): GameState {
  const s = clone(state);
  const victim = s.qianggangVictim;
  const tile = s.qianggangTile;
  if (victim === null || tile === null) return s;
  // 杠被抢不成立: 回退补杠副露为碰
  const vp = s.players[victim];
  const idx = vp.melds.findIndex((m) => m.type === 'bugang');
  if (idx >= 0) {
    const m = vp.melds[idx];
    vp.melds[idx] = { type: 'peng', tiles: m.tiles.slice(0, 3), sourceSeat: m.sourceSeat };
  }
  s.phase = 'gameover';
  s.winner = seat;
  s.drawnTileId = null;
  s.pendingOptions = [];
  s.selfActions = [];
  s.lastDiscard = null;
  addLog(s.log, seat, '抢杠胡牌', `${SEAT_NAME[victim]}补杠被抢 · ${tileName(tile)}`);
  s.review = buildReview(s);
  return s;
}

// 杠后补牌(岭上开花判定)
function gangRinshan(state: GameState, seat: Seat): GameState {
  const s = state;
  if (s.deck.length === 0) {
    // 无牌可补，直接进入出牌
    s.phase = 'discard';
    s.pendingOptions = [];
    s.selfActions = [];
    return s;
  }
  const tile = s.deck.pop()!; // 从末尾补
  // 补牌同样追加到末尾，不立即整理
  s.players[seat].hand.push(tile);
  s.drawnTileId = tile.id;
  addLog(s.log, seat, '杠后补牌', tileName(tile));
  // 岭上开花(自摸)判定
  if (canWin(s.players[seat].hand, s.players[seat].melds.length)) {
    if (!s.players[seat].isHuman) {
      // AI: 立即岭上开花胡
      s.phase = 'gameover';
      s.winner = seat;
      s.drawnTileId = null;
      addLog(s.log, seat, '岭上开花胡牌', s.players[seat].hand.map((t) => tileName(t)).join(' '));
      s.review = buildReview(s);
      return s;
    }
    // 人类: 提供"岭上开花胡"选项, 玩家可手动确认
    const huAction: ActionOption = { type: 'hu', seat };
    const selfActs = getSelfActions(s.players[seat], tile);
    s.selfActions = [huAction, ...selfActs];
    s.pendingOptions = [];
    s.phase = 'discard';
    s.lastAdvice = null;
    return s;
  }
  // 重新检查自摸操作
  s.selfActions = getSelfActions(s.players[seat], tile);
  s.pendingOptions = [];
  s.phase = 'discard';
  if (seat === HUMAN_SEAT) {
    s.lastAdvice = buildAdvice(s, seat);
  }
  return s;
}

// 人类选择自摸操作(胡/暗杠/补杠)或放弃直接出牌
export function applySelfAction(state: GameState, option: ActionOption): GameState {
  const s = clone(state);
  const player = s.players[option.seat];
  if (option.type === 'hu') {
    // 玩家手动点击"自摸"按钮 → 胡牌
    s.phase = 'gameover';
    s.winner = option.seat;
    s.drawnTileId = null;
    s.selfActions = [];
    s.pendingOptions = [];
    addLog(s.log, option.seat, '自摸胡牌', player.hand.map((t) => tileName(t)).join(' '));
    s.review = buildReview(s);
    return s;
  }
  if (option.type === 'angang') {
    applyAngang(player, option.meld!);
    addLog(s.log, option.seat, '暗杠', tileName(option.meld!.tiles[0]));
    recordGang(s, option.seat, 'angang');
    return gangRinshan(s, option.seat);
  }
  if (option.type === 'bugang') {
    applyBugang(player, option.meld!);
    addLog(s.log, option.seat, '补杠', tileName(option.tile!));
    // 补杠可能被抢杠: 检查各家能否抢杠, 无人抢杠才计分补牌
    return checkQiangGang(s, option.seat, option.tile!);
  }
  // 人类放弃自摸胡后直接出牌(不应到达这里, 保留原逻辑兜底)
  return gangRinshan(s, option.seat);
}

// 人类放弃自摸胡(从 selfActions 中移除 hu 选项, 保留暗杠/补杠)
// 玩家放弃后, 本巡仍可正常出牌, 下次摸到能胡的牌仍可再次胡
export function humanPassSelfAction(state: GameState): GameState {
  const s = clone(state);
  s.selfActions = s.selfActions.filter((o) => o.type !== 'hu');
  return s;
}

// ===== AI 决策占位(实际在 aiEngine.ts 实现，此处转发) =====
import { aiDecideAction, aiDecideDiscard, aiDecideSelfAction } from './aiEngine';
export { aiDecideAction, aiDecideDiscard, aiDecideSelfAction };

// AI玩家执行一轮摸出牌(供hook调用)
export function aiPlayTurn(state: GameState): GameState {
  let s = state;
  if (s.phase === 'draw') {
    s = drawTile(s, s.currentSeat);
  }
  if (s.phase === 'gameover') return s;
  // 处理自摸操作(暗杠/补杠)
  if (s.phase === 'discard' && !s.players[s.currentSeat].isHuman) {
    const player = s.players[s.currentSeat];
    if (s.selfActions && s.selfActions.length > 0) {
      const dec = aiDecideSelfAction(s.selfActions, player, s);
      if (dec !== 'pass') {
        s = applySelfAction(s, dec);
        if (s.phase === 'gameover') return s;
        // 杠后可能又有自摸操作，循环
        return aiPlayTurn(s);
      }
    }
    // 选择出牌
    const tileId = aiDecideDiscard(player, s);
    s = discardTile(s, s.currentSeat, tileId);
  }
  return s;
}
