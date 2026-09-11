// 碰杠规则判定
import type { Tile, PlayerState, ActionOption, Seat, Meld } from './types';
import { tileCode, isHongZhong } from './types';
import { canWin } from './win';

// 判断手牌中某种牌(非红中)的数量
function countInHand(hand: Tile[], code: string): number {
  let c = 0;
  for (const t of hand) {
    if (!isHongZhong(t) && tileCode(t) === code) c++;
  }
  return c;
}

// 找到手牌中指定代码的牌(返回实例)
function findInHand(hand: Tile[], code: string, n: number): Tile[] {
  const result: Tile[] = [];
  for (const t of hand) {
    if (!isHongZhong(t) && tileCode(t) === code) {
      result.push(t);
      if (result.length === n) break;
    }
  }
  return result;
}

// 他人出牌后，某玩家可执行的操作(碰/明杠/胡)
// 注意: 推倒胡仅支持自摸胡，他人出牌不可胡(点炮)，故这里不返回 hu(对他人出牌)
// 但"碰/杠后自摸"另算。这里仅判定碰/明杠。
export function getActionsForDiscard(
  player: PlayerState,
  discard: Tile,
  sourceSeat: Seat
): ActionOption[] {
  const options: ActionOption[] = [];
  if (isHongZhong(discard)) {
    // 红中作为百搭牌打出时，他人不可碰杠(因为百搭牌不固定为某张)
    // 但红中本身是z5字牌，理论上可被当作z5碰/杠。为符合"百搭牌"语义，
    // 红中被打出时按字牌z5处理碰杠(玩家可选择是否碰杠红中)。
    const code = tileCode(discard);
    const cnt = countInHand(player.hand, code);
    if (cnt >= 2) {
      const tiles = findInHand(player.hand, code, 2).concat(discard);
      options.push({
        type: 'peng',
        tile: discard,
        seat: player.seat,
        meld: { type: 'peng', tiles, sourceSeat },
      });
    }
    if (cnt >= 3) {
      const tiles = findInHand(player.hand, code, 3).concat(discard);
      options.push({
        type: 'minggang',
        tile: discard,
        seat: player.seat,
        meld: { type: 'minggang', tiles, sourceSeat },
      });
    }
    return options;
  }

  const code = tileCode(discard);
  const cnt = countInHand(player.hand, code);

  // 碰: 手中有2张同款
  if (cnt >= 2) {
    const tiles = findInHand(player.hand, code, 2).concat(discard);
    options.push({
      type: 'peng',
      tile: discard,
      seat: player.seat,
      meld: { type: 'peng', tiles, sourceSeat },
    });
  }
  // 明杠: 手中有3张同款
  if (cnt >= 3) {
    const tiles = findInHand(player.hand, code, 3).concat(discard);
    options.push({
      type: 'minggang',
      tile: discard,
      seat: player.seat,
      meld: { type: 'minggang', tiles, sourceSeat },
    });
  }
  return options;
}

// 自己摸牌后可执行的操作(暗杠/补杠)
// 注意: 暗杠需扫描整手牌(任一牌型满4张即可杠), 不限于刚摸的那张
export function getSelfActions(player: PlayerState, drawn: Tile): ActionOption[] {
  const options: ActionOption[] = [];
  const hand = player.hand;
  // 按代码分组统计(含刚摸的牌), 排除红中(百搭不可杠)
  const groups: Record<string, Tile[]> = {};
  for (const t of hand) {
    if (isHongZhong(t)) continue;
    const code = tileCode(t);
    if (!groups[code]) groups[code] = [];
    groups[code].push(t);
  }
  // 暗杠: 手牌中任一牌型满4张(无论是否刚摸到)
  for (const code of Object.keys(groups)) {
    if (groups[code].length >= 4) {
      options.push({
        type: 'angang',
        tile: groups[code][3],
        seat: player.seat,
        meld: { type: 'angang', tiles: groups[code].slice(0, 4) },
      });
    }
  }
  // 补杠: 已碰过某牌, 现在手中有第4张(含刚摸的)
  for (const meld of player.melds) {
    if (meld.type === 'peng') {
      const code = tileCode(meld.tiles[0]);
      if (groups[code] && groups[code].length >= 1) {
        options.push({
          type: 'bugang',
          tile: groups[code][0],
          seat: player.seat,
          meld: { type: 'bugang', tiles: [...meld.tiles, groups[code][0]] },
        });
      }
    }
  }
  return options;
}

// 扫描全部手牌的自摸操作(用于庄家开局)
export function getAllSelfActions(player: PlayerState): ActionOption[] {
  const options: ActionOption[] = [];
  const hand = player.hand;
  // 按代码分组
  const groups: Record<string, Tile[]> = {};
  for (const t of hand) {
    if (isHongZhong(t)) continue;
    const code = tileCode(t);
    if (!groups[code]) groups[code] = [];
    groups[code].push(t);
  }
  // 暗杠: 任一代码有4张
  for (const code of Object.keys(groups)) {
    if (groups[code].length >= 4) {
      options.push({
        type: 'angang',
        tile: groups[code][3],
        seat: player.seat,
        meld: { type: 'angang', tiles: groups[code].slice(0, 4) },
      });
    }
  }
  // 补杠: 已碰过的牌，手中有第4张
  for (const meld of player.melds) {
    if (meld.type === 'peng') {
      const code = tileCode(meld.tiles[0]);
      if (groups[code] && groups[code].length >= 1) {
        options.push({
          type: 'bugang',
          tile: groups[code][0],
          seat: player.seat,
          meld: { type: 'bugang', tiles: [...meld.tiles, groups[code][0]] },
        });
      }
    }
  }
  return options;
}

// 他人补杠时, 某玩家可抢杠胡: 手牌+被补的那张牌可成胡即允许抢杠
export function getQiangGangActions(
  player: PlayerState,
  tile: Tile,
  victimSeat: Seat
): ActionOption[] {
  if (player.hand.length === 0) return [];
  const test = player.hand.concat(tile);
  if (canWin(test, player.melds.length)) {
    return [{ type: 'hu', tile, seat: player.seat }];
  }
  return [];
}

// 执行碰操作: 从手牌移除2张，添加副露
export function applyPeng(player: PlayerState, meld: Meld): void {
  // meld.tiles 包含 2张手牌 + 1张弃牌
  const handTiles = meld.tiles.filter((t) => t.id !== meld.tiles![meld.tiles!.length - 1].id);
  // 更稳妥: 移除前2张对应的实例
  const toRemove = meld.tiles.slice(0, 2);
  for (const t of toRemove) {
    const idx = player.hand.findIndex((h) => h.id === t.id);
    if (idx >= 0) player.hand.splice(idx, 1);
  }
  player.melds.push(meld);
}

// 执行明杠
export function applyMinggang(player: PlayerState, meld: Meld): void {
  const toRemove = meld.tiles.slice(0, 3); // 3张手牌
  for (const t of toRemove) {
    const idx = player.hand.findIndex((h) => h.id === t.id);
    if (idx >= 0) player.hand.splice(idx, 1);
  }
  player.melds.push(meld);
}

// 执行暗杠
export function applyAngang(player: PlayerState, meld: Meld): void {
  const toRemove = meld.tiles.slice(0, 4);
  for (const t of toRemove) {
    const idx = player.hand.findIndex((h) => h.id === t.id);
    if (idx >= 0) player.hand.splice(idx, 1);
  }
  player.melds.push(meld);
}

// 执行补杠(碰→杠)
export function applyBugang(player: PlayerState, meld: Meld): void {
  // meld.tiles = 原碰3张 + 新摸1张
  const newTile = meld.tiles[meld.tiles.length - 1];
  const idx = player.hand.findIndex((h) => h.id === newTile.id);
  if (idx >= 0) player.hand.splice(idx, 1);
  // 找到原碰副露并升级
  const pengIdx = player.melds.findIndex(
    (m) => m.type === 'peng' && tileCode(m.tiles[0]) === tileCode(newTile)
  );
  if (pengIdx >= 0) {
    player.melds[pengIdx] = { type: 'bugang', tiles: meld.tiles };
  }
}
