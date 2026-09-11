// 手牌区域(人类玩家)
// 特性:
//   - 默认自动理牌(万→筒→条→字升序，新摸的牌也排进去)
//   - 分解模式: 可拖拽牌重排(吸附插入)，或点击牌切换间隔
//   - 分解结果(blocks)按当前顺序分组，组与组之间留间隔
//   - 分组优先级: 成牌 > 对子 > 搭子; 未能分解的散张原地不动
//   - 模式: 出牌(默认) / 分解(拖拽重排·点击切换间隔)
import { useEffect, useMemo, useState } from 'react';
import type { Tile as TileType, Meld } from '../game/types';
import { decomposeHand } from '../game/gameEngine';
import { sortHand } from '../game/sort';
import { Tile } from './Tile';

interface Props {
  hand: TileType[];
  onDiscard: (tileId: number) => void;
  interactive: boolean;
  drawnTileId?: number | null;   // 新摸的牌(高亮)
  melds?: Meld[];                // 副露(用于分解)
}

export function HandRow({
  hand, onDiscard, interactive, drawnTileId, melds = [],
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<'play' | 'decompose'>('play');
  // 用户手动设置的间隔位置
  const [gaps, setGaps] = useState<boolean[] | null>(null);
  // 拖拽相关: 用户自定义顺序(tileId数组)，空数组=用默认排序
  const [order, setOrder] = useState<number[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const handKey = hand.map((t) => t.id).join(',');

  // 手牌变化(摸/出牌)时重置全部状态
  useEffect(() => {
    setSelected(null);
    setMode('play');
    setGaps(null);
    setOrder([]);
    setDragId(null);
    setDropIdx(null);
  }, [handKey]);

  // 展示用手牌: 用户拖拽顺序 > 默认排序(新摸牌也排进去)
  const displayHand = useMemo(() => {
    if (order.length > 0) {
      const map = new Map(hand.map((t) => [t.id, t]));
      return order.map((id) => map.get(id)!).filter(Boolean);
    }
    return sortHand([...hand]);
  }, [hand, order]);

  // 分解基于当前展示顺序(已包含新摸牌排序或用户排列)
  const auto = useMemo(() => decomposeHand(displayHand, melds), [displayHand, melds]);

  // 由自动分解块推导默认间隔
  const autoGaps = useMemo(() => {
    const g: boolean[] = [];
    let lastTileIdx = -1;
    for (const b of auto.blocks) {
      const start = lastTileIdx + 1;
      const end = start + b.tiles.length - 1;
      if (end < displayHand.length - 1) g[end] = true;
      lastTileIdx = end;
    }
    for (let i = 0; i < displayHand.length - 1; i++) {
      if (g[i] === undefined) g[i] = false;
    }
    return g;
  }, [auto, displayHand.length]);

  const effectiveGaps = gaps ?? autoGaps;
  const showGaps = mode === 'decompose';

  // 点击牌
  const handleClick = (t: TileType) => {
    if (mode === 'decompose') {
      // 分解模式: 切换该牌右侧的间隔
      const idx = displayHand.findIndex((x) => x.id === t.id);
      if (idx < 0 || idx >= displayHand.length - 1) return;
      setGaps((prev) => {
        const base = prev ?? autoGaps;
        const next = base.slice();
        next[idx] = !next[idx];
        return next;
      });
      return;
    }
    // 出牌模式
    if (!interactive) return;
    if (selected === t.id) {
      onDiscard(t.id);
      setSelected(null);
    } else {
      setSelected(t.id);
    }
  };

  // ---- 拖拽 ----
  const handleDragStart = (e: React.DragEvent, tileId: number) => {
    if (mode !== 'decompose') return;
    setDragId(tileId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(tileId));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    if (mode !== 'decompose' || dragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    if (mode !== 'decompose' || dragId == null) return;
    e.preventDefault();
    const current = displayHand.map((t) => t.id);
    const from = current.indexOf(dragId);
    if (from < 0) { setDragId(null); setDropIdx(null); return; }
    const next = current.slice();
    const [moved] = next.splice(from, 1);
    let insertAt = idx;
    if (from < idx) insertAt = idx - 1; // 移除后索引前移
    next.splice(insertAt, 0, moved);
    setOrder(next);
    setGaps(null); // 重排后重置为自动间隔
    setDragId(null);
    setDropIdx(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropIdx(null);
  };

  return (
    <div className="hand-wrap">
      <div className="hand-row">
        {displayHand.map((t, i) => {
          const isDrawn = drawnTileId != null && t.id === drawnTileId;
          const hasGapBefore = showGaps && i > 0 && effectiveGaps[i - 1];
          const isDragging = dragId === t.id;
          const showDropBefore = dropIdx === i && dragId != null && dragId !== t.id;
          return (
            <span
              key={t.id}
              className={`tile-slot${hasGapBefore ? ' gap-before' : ''}${showDropBefore ? ' drop-before' : ''}${isDragging ? ' dragging' : ''}`}
              draggable={mode === 'decompose'}
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
            >
              <Tile
                tile={t}
                size={46}
                selected={selected === t.id}
                onClick={() => handleClick(t)}
                highlight={isDrawn}
              />
              {isDrawn && <span className="drawn-mark" title="新摸">新</span>}
            </span>
          );
        })}
      </div>
      <div className="hand-toolbar">
        <span className="hand-hint">
          {mode === 'decompose'
            ? '分解模式: 拖拽牌重排·点击牌切换间隔·再点"分解牌型"关闭'
            : selected !== null ? '再次点击确认出牌' : '点击选择要打出的牌'}
        </span>
        <button
          className={`hand-mode-btn${mode === 'decompose' ? ' active' : ''}`}
          onClick={() => {
            setMode((m) => (m === 'play' ? 'decompose' : 'play'));
            if (mode === 'play') { setGaps(null); setOrder([]); }
          }}
        >
          分解牌型
        </button>
      </div>
    </div>
  );
}
