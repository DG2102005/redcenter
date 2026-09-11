// 选牌开局: 自由选14张手牌 → 直接与AI对弈(复用 startCustomGame)
import { useMemo, useState } from 'react';
import { Tile } from './Tile';
import { indexToTile, tileCode, tileName } from '../game/types';
import type { Tile as TileType, Suit } from '../game/types';
import { sortHand } from '../game/sort';

interface Props {
  onClose: () => void;
  onStart: (codes: string[]) => void;
}

const ALL_CODES: string[] = (() => {
  const codes: string[] = [];
  for (let i = 0; i < 34; i++) codes.push(tileCode(indexToTile(i)));
  return codes;
})();

const ROWS: { label: string; codes: string[] }[] = [
  { label: '万', codes: ALL_CODES.slice(0, 9) },
  { label: '筒', codes: ALL_CODES.slice(9, 18) },
  { label: '条', codes: ALL_CODES.slice(18, 27) },
  { label: '字', codes: ALL_CODES.slice(27, 34) },
];

function tileOf(code: string): TileType {
  return { id: -1, suit: code[0] as Suit, rank: parseInt(code.slice(1), 10) };
}

export function HandPicker({ onClose, onStart }: Props) {
  const [codes, setCodes] = useState<string[]>([]);

  const handTiles = useMemo(() => sortHand(codes.map(tileOf)), [codes]);
  const handCount = codes.length;

  const used = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of codes) m[c] = (m[c] ?? 0) + 1;
    return m;
  }, [codes]);

  const poolAvail = (code: string): number => 4 - (used[code] ?? 0);

  const addTile = (code: string) => {
    if (handCount >= 14 || poolAvail(code) <= 0) return;
    setCodes((prev) => [...prev, code]);
  };

  const removeTile = (tile: TileType) => {
    const code = tileCode(tile);
    setCodes((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i] === code) return prev.filter((_, k) => k !== i);
      }
      return prev;
    });
  };

  const clearAll = () => setCodes([]);

  const randomFill = () => {
    const need = 14 - handCount;
    if (need <= 0) return;
    const pool: string[] = [];
    for (const c of ALL_CODES) {
      for (let i = 0; i < poolAvail(c); i++) pool.push(c);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setCodes((prev) => [...prev, ...pool.slice(0, need)]);
  };

  return (
    <div className="quiz-analysis-overlay" onClick={onClose}>
      <div className="adv-overlay-card picker-card" onClick={(e) => e.stopPropagation()}>
        <div className="adv-overlay-head">
          <span>🎯 选牌开局</span>
          <button className="adv-overlay-close" onClick={onClose}>✕</button>
        </div>

        <div className="picker-tip">从牌池选 14 张手牌（每种最多 4 张），选好后点击左下角"开始AI对弈"；点击手牌可移除</div>

        <div className="tile-pool" style={{ marginBottom: 14 }}>
          {ROWS.map((row) => (
            <div key={row.label} className="tile-pool-row">
              <span className="picker-suit">{row.label}</span>
              {row.codes.map((code) => {
                const avail = poolAvail(code);
                const disabled = avail <= 0 || handCount >= 14;
                return (
                  <div
                    key={code}
                    className={`tile-pool-item ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && addTile(code)}
                    title={tileName(tileOf(code))}
                  >
                    <Tile tile={tileOf(code)} size={32} />
                    <div className={`tile-pool-count ${avail === 0 ? 'zero' : ''}`}>{avail}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="simulator-section-title">我的手牌 ({handCount}/14)</div>
        <div className="simulator-hand" style={{ minHeight: 76, marginBottom: 14 }}>
          {handTiles.length === 0 ? (
            <span className="simulator-hand-empty">点击上方牌池自由选牌</span>
          ) : (
            handTiles.map((t, i) => (
              <div
                key={`${tileCode(t)}-${i}`}
                className="picker-hand-tile"
                onClick={() => removeTile(t)}
                title={`点击移除${tileName(t)}`}
              >
                <Tile tile={t} size={40} />
              </div>
            ))
          )}
        </div>

        <div className="simulator-toolbar">
          <button className="quiz-toolbar-btn" onClick={clearAll} disabled={handCount === 0}>✕ 清空</button>
          <button className="quiz-toolbar-btn" onClick={randomFill} disabled={handCount >= 14}>🎲 随机补齐</button>
          <button className="quiz-toolbar-btn" onClick={onClose}>取消</button>
          <button
            className="quiz-toolbar-btn primary"
            disabled={handCount !== 14}
            onClick={() => onStart(codes)}
          >
            🀄 开始AI对弈
          </button>
        </div>
      </div>
    </div>
  );
}