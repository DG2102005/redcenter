// 对局日志系统
import type { LogEntry, GameState, Seat, Tile } from './types';
import { tileName, SEAT_NAME } from './types';

let logCounter = 0;

export function resetLog(): void {
  logCounter = 0;
}

export function addLog(
  log: LogEntry[],
  seat: Seat | 'system',
  action: string,
  detail?: string
): LogEntry {
  const entry: LogEntry = {
    time: logCounter++,
    seat,
    action,
    detail,
  };
  log.push(entry);
  return entry;
}

// 格式化日志为可读文本
export function formatLog(entry: LogEntry): string {
  const who = entry.seat === 'system' ? '系统' : SEAT_NAME[entry.seat];
  let line = `[${String(entry.time).padStart(3, '0')}] ${who} ${entry.action}`;
  if (entry.detail) line += ` (${entry.detail})`;
  return line;
}

// 导出整局日志为文本(供复制复盘)
export function exportLog(state: GameState): string {
  const lines: string[] = [];
  lines.push(`===== 红中推倒胡 对局日志 =====`);
  lines.push(`局数: ${state.round}  庄家: ${SEAT_NAME[state.banker]}`);
  lines.push('');
  for (const e of state.log) {
    lines.push(formatLog(e));
  }
  if (state.winner !== null) {
    lines.push(`===== 本局结束: ${SEAT_NAME[state.winner]} 胡牌 =====`);
  } else if (state.isDraw) {
    lines.push(`===== 本局结束: 流局 =====`);
  }
  return lines.join('\n');
}

// 工具: 牌名拼接
export function handNames(tiles: Tile[]): string {
  return tiles.map((t) => tileName(t)).join(' ');
}
