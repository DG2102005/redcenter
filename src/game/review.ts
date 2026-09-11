// 复盘报告生成: 局终分析 + 关键决策 + 改进建议
import type { GameState, Seat, ReviewReport, Tile } from './types';
import { tileName, SEAT_NAME } from './types';

// 简易关键决策提取(基于日志)
// 关键决策 = 涉及人类出牌的决策点, 评估其向听变化
export function buildReview(state: GameState): ReviewReport {
  const finalHands = state.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    hand: p.hand.slice(),
    melds: p.melds.map((m) => ({ type: m.type, tiles: m.tiles.slice() })),
    discards: p.discards.slice(),
  }));

  // 从日志提取人类的关键决策点
  const keyDecisions: ReviewReport['keyDecisions'] = [];
  for (const entry of state.log) {
    if (entry.seat !== 1) continue; // 仅人类
    if (entry.action === '出牌') {
      // 简化分析: 根据当时牌局阶段给评注
      const phase = entry.time < state.log.length / 3 ? '前期' : entry.time < state.log.length * 2 / 3 ? '中期' : '后期';
      const analysis = `${phase}出牌: ${entry.detail}`;
      const suggestion = phase === '前期'
        ? '前期应优先打出孤张与边张，保留中张与组合潜力牌'
        : phase === '后期'
        ? '后期需注意安全度，避免打出未见过的生张'
        : '中期保持手牌结构灵活，向听牌推进';
      keyDecisions.push({
        time: entry.time,
        seat: 1,
        action: entry.action,
        analysis,
        suggestion,
      });
    }
  }
  // 取前10个关键决策避免过长
  const sampled = keyDecisions.filter((_, i) => i % Math.max(1, Math.ceil(keyDecisions.length / 10)) === 0).slice(0, 10);

  // 总结
  let summary: string;
  if (state.isDraw) {
    summary = `第${state.round}局流局。共摸牌${state.drawCount}次。建议复盘听牌时机与舍牌安全性。`;
  } else {
    const winner = state.winner!;
    const winnerName = SEAT_NAME[winner];
    if (winner === 1) {
      summary = `第${state.round}局您自摸胡牌！共摸牌${state.drawCount}次。复盘关键推进决策，巩固优势打法。`;
    } else {
      summary = `第${state.round}局${winnerName}胡牌。您未能在${state.drawCount}次摸牌内听牌胡牌，建议复盘舍牌策略与听牌时机。`;
    }
  }

  // 改进建议
  const improvements: string[] = [];
  const human = state.players[1];
  // 1) 红中是否被打出过
  const discardedHZ = human.discards.some((t) => t.suit === 'z' && t.rank === 5);
  if (discardedHZ) {
    improvements.push('本局曾打出红中百搭牌，建议保留红中至关键组合或听牌阶段');
  }
  // 2) 副露情况
  if (human.melds.length === 0 && state.players.some((p, i) => i !== 1 && p.melds.length > 1)) {
    improvements.push('未做任何副露而对手副露较多，可考虑选择性碰杠加速推进');
  }
  // 3) 是否早听
  if (state.winner !== 1 && !state.isDraw) {
    improvements.push('对手先胡牌，复盘是否可在中后期加快向听推进');
  }
  if (improvements.length === 0) {
    improvements.push('整体决策合理，继续保持中张保留与红中百搭的灵活运用');
  }

  return {
    round: state.round,
    winner: state.winner,
    isDraw: state.isDraw,
    totalDraws: state.drawCount,
    finalHands,
    keyDecisions: sampled,
    summary,
    improvements,
  };
}

// 格式化复盘报告为文本(供复制)
export function formatReviewText(r: ReviewReport): string {
  const lines: string[] = [];
  lines.push('===== 复盘报告 =====');
  lines.push(r.summary);
  lines.push('');
  lines.push('--- 终局各家手牌(全部公开) ---');
  for (const h of r.finalHands) {
    lines.push(`【${SEAT_NAME[h.seat]} ${h.name}】`);
    lines.push(`  手牌: ${h.hand.map((t) => tileName(t)).join(' ')}`);
    if (h.melds.length > 0) {
      lines.push(`  副露: ${h.melds.map((m) => `[${m.type}:${m.tiles.map((t) => tileName(t)).join('')}]`).join(' ')}`);
    }
    if (h.discards.length > 0) {
      lines.push(`  弃牌: ${h.discards.map((t) => tileName(t)).join(' ')}`);
    }
  }
  lines.push('');
  lines.push('--- 关键决策点 ---');
  for (const d of r.keyDecisions) {
    lines.push(`[${d.time}] ${SEAT_NAME[d.seat]} ${d.action}: ${d.analysis}`);
    lines.push(`  → ${d.suggestion}`);
  }
  lines.push('');
  lines.push('--- 改进建议 ---');
  r.improvements.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('==================');
  return lines.join('\n');
}
