// 复盘回放面板: 浏览收藏牌局的人类决策时间线 + 手动演绎(从任意节点继续)
import { useState } from 'react';
import type { SavedRound } from '../game/savedRounds';
import { buildReplayNodes } from '../game/savedRounds';
import { deleteSavedRound, clearSavedRounds } from '../game/savedRounds';
import { SEAT_NAME, tileName } from '../game/types';
import type { Tile as TileType } from '../game/types';
import { Tile } from './Tile';
import { sortHand } from '../game/sort';

interface Props {
  rounds: SavedRound[];
  onReload: () => void;
  onPlayFrom: (state: SavedRound['state'], label: string) => void; // 从某节点继续演绎
}

const TYPE_CN: Record<string, string> = {
  hu: '自摸胡',
  peng: '碰',
  gang: '杠',
  minggang: '明杠',
  angang: '暗杠',
  bugang: '补杠',
  discard: '出牌',
};

const CODE_RE = /\b(m[1-9]|p[1-9]|s[1-9]|z[1-7])\b/g;

// 历史动作标签中的牌代号 → 具体牌名(兼容历史收藏数据); 动作类型 → 中文
function prettyLabel(label: string): string {
  let s = label;
  for (const [k, v] of Object.entries(TYPE_CN)) {
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  }
  return s.replace(CODE_RE, (m) =>
    tileName({ id: -1, suit: m[0] as TileType['suit'], rank: parseInt(m.slice(1), 10) }),
  );
}

export function ReviewReplay({ rounds, onReload, onPlayFrom }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodeIdx, setNodeIdx] = useState(0);

  const selected = rounds.find((r) => r.id === selectedId) ?? null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setNodeIdx(0);
  };

  const handleDelete = (id: string) => {
    deleteSavedRound(id);
    if (selectedId === id) {
      setSelectedId(null);
      setNodeIdx(0);
    }
    onReload();
  };

  const handleClear = () => {
    clearSavedRounds();
    setSelectedId(null);
    setNodeIdx(0);
    onReload();
  };

  const nodes = selected ? buildReplayNodes(selected) : [];

  const renderHand = (tiles: TileType[]) => (
    <div className="replay-hand">
      {sortHand(tiles).map((t, i) => (
        <Tile key={i} tile={t} size={24} />
      ))}
    </div>
  );

  return (
    <div className="review-replay">
      <div className="replay-head">
        <span>📚 收藏牌局({rounds.length})</span>
        {rounds.length > 0 && (
          <button className="replay-btn danger" onClick={handleClear}>清空</button>
        )}
      </div>

      {rounds.length === 0 && (
        <div className="replay-empty">对弈结束后点击"收藏本局"即可保存, 供复盘与演绎</div>
      )}

      {rounds.length > 0 && (
        <div className="replay-list">
          {rounds.map((r) => (
            <div key={r.id} className={`replay-item${selectedId === r.id ? ' active' : ''}`} onClick={() => handleSelect(r.id)}>
              <div className="replay-item-head">
                <span>第{r.round}局 · {r.resultLabel}</span>
                <span className="replay-time">{new Date(r.savedAt).toLocaleTimeString()}</span>
                <button className="replay-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}>✕</button>
              </div>
              {selectedId === r.id && (
                <div className="replay-detail">
                  {/* 时间线 */}
                  <div className="replay-timeline">
                    {nodes.map((n, i) => (
                      <button
                        key={i}
                        className={`timeline-node${nodeIdx === i ? ' active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setNodeIdx(i); }}
                      >
                        {i === 0 ? '开局' : prettyLabel(n.label)}
                      </button>
                    ))}
                  </div>

                  {/* 当前节点牌面 */}
                  {nodes[nodeIdx] && (() => {
                    const n = nodes[nodeIdx];
                    const st = n.state;
                    const human = st.players[1];
                    return (
                      <div className="replay-node-state">
                        <div className="replay-node-label">
                          {`第${nodeIdx + 1}步 · ${prettyLabel(n.label)}`}
                        </div>
                        {human && (
                          <>
                            <div className="replay-row">
                              <span className="replay-label">我的手牌</span>
                              {renderHand(human.hand)}
                            </div>
                            {human.melds.length > 0 && (
                              <div className="replay-row">
                                <span className="replay-label">副露</span>
                                {human.melds.map((m, mi) => (
                                  <span key={mi} className="meld-tag">{tileName(m.tiles[0])}×{m.tiles.length}</span>
                                ))}
                              </div>
                            )}
                            <div className="replay-row">
                              <span className="replay-label">弃牌</span>
                              <span className="replay-discards">
                                {human.discards.map((t) => tileName(t)).join(' ') || '无'}
                              </span>
                            </div>
                          </>
                        )}
                        {st.phase === 'gameover' && (
                          <div className="replay-result">
                            {st.isDraw ? '流局' : `${SEAT_NAME[st.winner!]}胡牌`}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 演绎操作 */}
                  <div className="replay-actions">
                    <button
                      className="replay-btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = nodes[nodeIdx];
                        if (n && selected) onPlayFrom(n.state, `${selected.round}局 · ${n.label}`);
                      }}
                      title="从该节点开始自由演绎不同打法"
                    >
                      ▶ 从此刻继续演绎
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
