// 选牌推演 — 自由选牌 → 真实舍牌 → 自动进张分析 → 自摸推演
import { useMemo, useState, useCallback } from 'react';
import { Tile as TileComp } from '../components/Tile';
import { AdvisorScenarios } from '../components/AdvisorTab';
import { analyzeHand, analyzePartialHand, codeName } from '../game/skillEngine';
import { indexToTile, tileCode, tileName, SUIT_NAME, isHongZhong, HONGZHONG_CODE } from '../game/types';
import { sortHand } from '../game/sort';
import type { Tile, Suit } from '../game/types';
import type { SkillAnalysis } from '../game/skillEngine';
import { saveSimulator, loadSimulator } from './storage';

interface Props {
  onBack: () => void;
}

// ─── 常量区 ────────────────────────────────
const ALL_CODES: string[] = (() => {
  const codes: string[] = [];
  for (let i = 0; i < 34; i++) {
    const t = indexToTile(i);
    codes.push(tileCode(t));
  }
  return codes;
})();

const ROWS: { label: string; codes: string[]; wild?: boolean }[] = [
  { label: '百搭', codes: [HONGZHONG_CODE], wild: true },
  { label: '万', codes: ALL_CODES.slice(0, 9) },
  { label: '筒', codes: ALL_CODES.slice(9, 18) },
  { label: '条', codes: ALL_CODES.slice(18, 27) },
  { label: '字', codes: ALL_CODES.slice(27, 34).filter((c) => c !== HONGZHONG_CODE) },
];

const SUIT_EMOJI: Record<string, string> = { m: '🀋', p: '🀚', s: '🀐', z: '🀀' };

/** 编码 → 构造牌(仅用于渲染, id 无意义) */
function tileOf(code: string): Tile {
  return { id: -1, suit: code[0] as Suit, rank: parseInt(code.slice(1), 10) };
}

// 进张分析结果
interface DrawImprovement {
  code: string;
  name: string;
  count: number;           // 牌池中剩余张数
  shantenAfter: number;    // 摸入后的向听数
  isSelfDraw: boolean;     // 摸入后是否自摸胡
}

// 推演阶段
type Phase = 'select' | 'discarded' | 'drawn';

// ─── 分析函数 ──────────────────────────────

/** 分析：手牌(13张)摸入某张牌后，向听数是否改善，是否自摸 */
function analyzeDrawImprovements(
  discardingHandCodes: string[],
  poolCounts: Record<string, number>,
): DrawImprovement[] {
  const results: DrawImprovement[] = [];

  for (const code of ALL_CODES) {
    if (poolCounts[code] <= 0) continue;
    const testHand = [...discardingHandCodes, code];
    if (testHand.length !== 14) continue;
    try {
      const a = analyzeHand(testHand);
      results.push({
        code,
        name: code,
        count: poolCounts[code],
        shantenAfter: a.currentShanten,
        isSelfDraw: a.isWinNow,
      });
    } catch {
      // skip invalid
    }
  }

  // 排序: 自摸胡 > 能改善向听 > 维持不变
  results.sort((a, b) => {
    if (a.isSelfDraw !== b.isSelfDraw) return a.isSelfDraw ? -1 : 1;
    if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
    return b.count - a.count;
  });

  return results;
}

/** 当前手牌的向听数 */
function getCurrentShanten(codes: string[]): number {
  if (codes.length === 14) {
    try { return analyzeHand(codes).currentShanten; } catch { return 99; }
  }
  if (codes.length === 13) {
    try { return analyzePartialHand(codes).shanten; } catch { return 99; }
  }
  return 99;
}

// ─── 组件 ──────────────────────────────────

export function Simulator({ onBack }: Props) {
  // 从 localStorage 恢复
  const initial = useMemo(() => {
    const saved = loadSimulator();
    return { codes: saved.selectedCodes ?? [], discard: saved.selectedDiscardCode ?? null };
  }, []);

  const [handCodes, setHandCodes] = useState<string[]>(initial.codes);
  const [addHistory, setAddHistory] = useState<string[]>([]);

  // 推演阶段: select(选牌中) | discarded(已舍牌,展示进张) | drawn(已摸牌,展示结果)
  const [phase, setPhase] = useState<Phase>(initial.discard ? 'discarded' : 'select');

  // 舍牌记录
  const [discardedCode, setDiscardedCode] = useState<string | null>(initial.discard);
  const [discardedTile, setDiscardedTile] = useState<Tile | null>(null);
  // 舍牌前的向听数
  const [shantenBeforeDiscard, setShantenBeforeDiscard] = useState<number>(99);
  // 舍牌后手牌(13张)的向听数
  const [shantenAfterDiscard, setShantenAfterDiscard] = useState<number>(99);

  // 进张分析结果
  const [improvements, setImprovements] = useState<DrawImprovement[]>([]);

  // 摸牌结果
  const [drawnCode, setDrawnCode] = useState<string | null>(null);
  const [drawnIsSelfDraw, setDrawnIsSelfDraw] = useState(false);

  // 智能辅助决策弹层
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [skillAnalysis, setSkillAnalysis] = useState<SkillAnalysis | null>(null);

  // 确认撤回
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

  // ── 牌池剩余张数 ──
  // 计算时考虑手牌 + 已舍牌
  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of ALL_CODES) counts[c] = 4;
    for (const c of handCodes) {
      if (counts[c] !== undefined) counts[c]--;
    }
    if (discardedCode && counts[discardedCode] !== undefined) counts[discardedCode]--;
    return counts;
  }, [handCodes, discardedCode]);

  const sortedHandTiles = useMemo(() => sortHand(handCodes.map(tileOf)), [handCodes]);
  const handCount = handCodes.length;
  const handFull = handCount >= 14;

  // ── 持久化 ──
  const persist = useCallback((codes: string[]) => {
    saveSimulator({ selectedCodes: codes, selectedDiscardCode: discardedCode ?? undefined });
  }, [discardedCode]);

  // ── 打开辅助决策面板 ──
  const openAnalysis = useCallback(() => {
    if (handCodes.length !== 14) return;
    setSkillAnalysis(analyzeHand(handCodes));
    setShowAnalysis(true);
  }, [handCodes]);

  // ── 点击牌池: 添加手牌 ──
  const handlePoolClick = (code: string) => {
    if (handFull) return;
    if (poolCounts[code] <= 0) return;
    const next = [...handCodes, code];
    setHandCodes(next);
    setAddHistory((prev) => [...prev, code]);
    setPhase('select');
    setDiscardedCode(null);
    setDiscardedTile(null);
    setImprovements([]);
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
    persist(next);
  };

  // ── 点击手牌: 真实舍出(满14张时) ──
  const handleHandClick = (tile: Tile) => {
    const code = tileCode(tile);

    if (handCount < 14) {
      // 手牌不足14张: 撤回
      for (let i = handCodes.length - 1; i >= 0; i--) {
        if (handCodes[i] === code) { setConfirmRevoke(i); return; }
      }
      return;
    }

    // 满14张: 红中不可舍
    if (isHongZhong(tile)) return;

    // 如果在推演后阶段，先重置
    if (phase !== 'select') {
      setPhase('select');
      setImprovements([]);
      setDrawnCode(null);
      setDrawnIsSelfDraw(false);
    }

    // 记录舍牌前的向听数
    const beforeShanten = getCurrentShanten(handCodes);

    // 真实舍出: 从 handCodes 中移除
    setHandCodes((prev) => {
      const idx = findLastIndex(prev, code);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      persist(next);
      return next;
    });

    setDiscardedCode(code);
    setDiscardedTile(tile);
    setShantenBeforeDiscard(beforeShanten);

    // 舍牌后的手牌(13张)
    const afterCodes = handCodes.filter((_, i) => {
      const lastIdx = findLastIndex(handCodes, code);
      return i !== lastIdx;
    });

    const afterShanten = afterCodes.length > 0 ? getCurrentShanten(afterCodes) : 99;
    setShantenAfterDiscard(afterShanten);

    // 计算剩余牌池
    const tempCounts: Record<string, number> = {};
    for (const c of ALL_CODES) tempCounts[c] = poolCounts[c];
    if (tempCounts[code] > 0) tempCounts[code]++;

    // 分析进张
    const imp = analyzeDrawImprovements(afterCodes, tempCounts);
    setImprovements(imp);
    setPhase('discarded');
  };

  // ── 双击/右键手牌: 撤回 ──
  const handleHandDoubleClick = (tile: Tile) => {
    const code = tileCode(tile);
    for (let i = handCodes.length - 1; i >= 0; i--) {
      if (handCodes[i] === code) { setConfirmRevoke(i); return; }
    }
  };

  const handleHandContextMenu = (tile: Tile, e: React.MouseEvent) => {
    e.preventDefault();
    const code = tileCode(tile);
    for (let i = handCodes.length - 1; i >= 0; i--) {
      if (handCodes[i] === code) { setConfirmRevoke(i); return; }
    }
  };

  // ── 确认撤回卡片 ──
  const handleConfirmRevoke = () => {
    if (confirmRevoke === null) return;
    setHandCodes((prev) => {
      const next = prev.filter((_, i) => i !== confirmRevoke);
      persist(next);
      return next;
    });
    setAddHistory((prev) => prev.slice(0, -1));
    setConfirmRevoke(null);
    setPhase('select');
    setDiscardedCode(null);
    setDiscardedTile(null);
    setImprovements([]);
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
  };

  // ── 重置 ──
  const handleReset = () => {
    if (!confirm('确认清空所有手牌?')) return;
    setHandCodes([]);
    setAddHistory([]);
    setPhase('select');
    setDiscardedCode(null);
    setDiscardedTile(null);
    setImprovements([]);
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
    saveSimulator({ selectedCodes: [], selectedDiscardCode: undefined });
  };

  // ── 撤回(栈) ──
  const handleUndo = () => {
    if (addHistory.length === 0) return;
    const last = addHistory[addHistory.length - 1];
    setHandCodes((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i] === last) { next.splice(i, 1); break; }
      }
      persist(next);
      return next;
    });
    setAddHistory((prev) => prev.slice(0, -1));
    setPhase('select');
    setDiscardedCode(null);
    setDiscardedTile(null);
    setImprovements([]);
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
  };

  // ── 撤销舍牌(恢复手牌) ──
  const handleUnDiscard = () => {
    if (!discardedCode) return;
    setHandCodes((prev) => {
      const next = [...prev, discardedCode];
      persist(next);
      return next;
    });
    setPhase('select');
    setDiscardedCode(null);
    setDiscardedTile(null);
    setImprovements([]);
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
  };

  // ── 摸进某张牌 ──
  const handleDrawTile = (imp: DrawImprovement) => {
    if (phase !== 'discarded') return;
    // 摸入
    setHandCodes((prev) => {
      const next = [...prev, imp.code];
      persist(next);
      return next;
    });
    setDrawnCode(imp.code);
    setDrawnIsSelfDraw(imp.isSelfDraw);
    setPhase('drawn');
  };

  // ── 重新开始推演 ──
  const handleRetry = () => {
    if (!discardedCode) return;
    // 收回摸进的牌
    if (drawnCode) {
      setHandCodes((prev) => {
        const idx = findLastIndex(prev, drawnCode);
        if (idx === -1) return prev;
        const next = [...prev];
        next.splice(idx, 1);
        persist(next);
        return next;
      });
    }
    setDrawnCode(null);
    setDrawnIsSelfDraw(false);
    setPhase('discarded');
  };

  // ── 随机摸牌 ──
  const handleRandomDraw = () => {
    if (handCount < 14) {
      const need = 14 - handCount;
      const available: string[] = [];
      for (const c of ALL_CODES) {
        for (let i = 0; i < poolCounts[c]; i++) available.push(c);
      }
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      const drawn = available.slice(0, need);
      const next = [...handCodes, ...drawn];
      setHandCodes(next);
      setAddHistory((prev) => [...prev, ...drawn]);
      setPhase('select');
      setDiscardedCode(null);
      setDiscardedTile(null);
      setImprovements([]);
      setDrawnCode(null);
      setDrawnIsSelfDraw(false);
      persist(next);
    }
  };

  return (
    <div className="simulator-container">
      <div className="simulator-header">
        <h2>🧪 选牌推演</h2>
        <button className="quiz-back-btn" onClick={onBack}>← 返回</button>
      </div>

      <div className="simulator-section-title">
        💡 点击牌池添加手牌(最多14张) → 手牌满后<b>点击手牌</b>真实舍出 → 分析进张 → 摸牌推演自摸
      </div>

      {/* 牌池区 */}
      {phase === 'select' && (
        <div className="tile-pool">
          {ROWS.map((row) => (
            <div key={row.label} className={`tile-pool-row${row.wild ? ' tile-pool-row-wild' : ''}`}>
              <span style={{ width: 24, fontSize: 14, color: 'var(--gold)', alignSelf: 'flex-end', marginRight: 4, fontWeight: 600 }}>{row.label}</span>
              {row.codes.map((code) => {
                const cnt = poolCounts[code];
                const disabled = cnt <= 0 || handFull;
                return (
                  <div
                    key={code}
                    className={`tile-pool-item ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && handlePoolClick(code)}
                  >
                    <TileComp tile={tileOf(code)} size={32} />
                    <div className={`tile-pool-count ${cnt === 0 ? 'zero' : ''}`}>{cnt}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* 手牌区 */}
      <div>
        <div className="simulator-section-title">
          我的手牌 ({handCount}/14)
          {handFull && phase === 'select' && (
            <span style={{ fontSize: 12, color: 'var(--gold)', marginLeft: 12 }}>
              ← 点击手牌选择舍出
            </span>
          )}
        </div>
        <div className="simulator-hand" style={{ minHeight: 100 }}>
          {sortedHandTiles.length === 0 ? (
            <span className="simulator-hand-empty">手牌(0张) - 点击上方牌池自由选牌</span>
          ) : (
            sortedHandTiles.map((t, i) => {
              const code = tileCode(t);
              const isHong = isHongZhong(t);
              const isDiscarded = discardedCode === code;
              return (
                <div
                  key={i}
                  style={{
                    cursor: isHong && phase === 'select' && !handFull ? 'default' : 'pointer',
                    position: 'relative',
                    transition: 'transform 0.15s',
                    transform: isDiscarded ? 'translateY(-14px)' : undefined,
                    opacity: isDiscarded ? 0.3 : 1,
                  }}
                  onClick={() => handleHandClick(t)}
                  onDoubleClick={() => handleHandDoubleClick(t)}
                  onContextMenu={(e) => handleHandContextMenu(t, e)}
                  title={
                    isHong
                      ? '红中(百搭) — 不可舍'
                      : handFull && phase === 'select'
                        ? `舍出【${code}】进行推演 | 双击/右键撤回`
                        : '双击/右键撤回这张牌'
                  }
                >
                  {isDiscarded && (
                    <div style={{
                      position: 'absolute',
                      top: -22,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--accent)',
                      color: '#fff',
                      padding: '1px 8px',
                      borderRadius: 8,
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}>
                      已舍出
                    </div>
                  )}
                  <TileComp tile={t} size={40} />
                  {isDiscarded && (
                    <div style={{
                      position: 'absolute',
                      bottom: -3,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: 'var(--accent)',
                      borderRadius: '0 0 4px 4px',
                    }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 舍牌结果区: 进张分析 */}
      {phase === 'discarded' && discardedCode && (
        <div className="discard-detail-panel">
          <div className="discard-detail-header">
            <span>
              🎯 舍出 <b style={{ color: 'var(--accent)' }}>{codeName(discardedCode)}</b> 后,当前向听:
              <b style={{
                color: shantenAfterDiscard === 0 ? 'var(--green)' : shantenAfterDiscard === 1 ? 'var(--gold)' : '#aaa',
                marginLeft: 6,
              }}>
                {shantenAfterDiscard === 0 ? '听牌!' : shantenAfterDiscard === 1 ? '一向听' : `${shantenAfterDiscard}向听`}
              </b>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="quiz-toolbar-btn" onClick={handleUnDiscard} style={{ fontSize: 11, padding: '2px 10px' }}>
                ↶ 撤销舍牌
              </button>
            </div>
          </div>

          {improvements.length > 0 && (
            <div>
              <div className="discard-detail-subtitle">
                📥 可进张牌型 — 点击摸入进行推演
              </div>
              <div className="simulator-incoming-grid">
                {(['m','p','s','z'] as Suit[]).map((suit) => {
                  const suitImps = improvements
                    .filter((imp) => imp.code[0] === suit)
                    .sort((a, b) => parseInt(a.code.slice(1), 10) - parseInt(b.code.slice(1), 10));
                  if (suitImps.length === 0) return null;
                  return (
                    <div key={suit} className="simulator-incoming-row">
                      <div className="simulator-incoming-suit">{SUIT_NAME[suit]}</div>
                      <div className="simulator-incoming-tiles">
                        {suitImps.map((imp) => {
                          const tile = tileOf(imp.code);
                          return (
                            <div
                              key={imp.code}
                              className={`simulator-incoming-tile ${imp.isSelfDraw ? 'self-draw' : imp.shantenAfter < shantenAfterDiscard ? 'improve' : ''}`}
                              onClick={() => handleDrawTile(imp)}
                            >
                              <TileComp tile={tile} size={44} />
                              <div className="simulator-incoming-tooltip">
                                <div className="simulator-incoming-name">{tileName(tile)}</div>
                                <div className="simulator-incoming-meta">
                                  {imp.isSelfDraw
                                    ? '🎉 自摸胡!'
                                    : imp.shantenAfter < shantenAfterDiscard
                                      ? `→ ${imp.shantenAfter <= 0 ? '听牌' : imp.shantenAfter + '向听'}`
                                      : '维持不变'}
                                </div>
                                <div className="simulator-incoming-meta">剩余 {imp.count} 张</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {improvements.length === 0 && (
            <div className="empty-state" style={{ marginTop: 16 }}>牌池已空,无可用进张牌</div>
          )}
        </div>
      )}

      {/* 摸牌结果: 自摸判定 */}
      {phase === 'drawn' && drawnCode && (
        <div className="discard-detail-panel" style={{
          borderColor: drawnIsSelfDraw ? '#2ecc71' : 'var(--gold)',
        }}>
          <div className="discard-detail-header">
            <span>
              {drawnIsSelfDraw ? '🎉' : '📥'} 摸入 <b style={{ color: drawnIsSelfDraw ? '#2ecc71' : 'var(--gold)' }}>{drawnCode ? codeName(drawnCode) : ''}</b>
              {drawnIsSelfDraw ? ' → 自摸胡牌!' : ' → 继续推演'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="quiz-toolbar-btn" onClick={handleRetry} style={{ fontSize: 11, padding: '2px 10px' }}>
                ↶ 重新选择进张
              </button>
              <button className="quiz-toolbar-btn" onClick={handleUnDiscard} style={{ fontSize: 11, padding: '2px 10px' }}>
                ↶ 撤销舍牌
              </button>
            </div>
          </div>

          <div className="simulator-drawn-panel">
            <div className="simulator-drawn-title">
              {drawnIsSelfDraw ? '自摸胡牌' : `摸入后手牌 (向听 ${getCurrentShanten(handCodes)})`}
            </div>
            <div className="simulator-drawn-hand">
              {sortHand(handCodes.map(tileOf)).map((tile, i) => {
                const isDrawn = drawnCode && tileCode(tile) === drawnCode;
                return (
                  <div
                    key={`${tileCode(tile)}-${i}`}
                    className={`simulator-drawn-tile ${isDrawn ? 'new-drawn' : ''}`}
                  >
                    <TileComp tile={tile} size={46} />
                    <div className="simulator-drawn-tooltip">
                      <div className="simulator-drawn-name">{tileName(tile)}</div>
                      {isDrawn && <div className="simulator-drawn-meta">🆕 新摸入</div>}
                      {drawnIsSelfDraw && <div className="simulator-drawn-meta">🎉 可胡牌</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="simulator-drawn-hint">
              {drawnIsSelfDraw
                ? '摸入此牌后手牌满足胡牌条件，推演成功!'
                : '鼠标悬停牌面查看详情，可点击"重新选择进张"或"撤销舍牌"继续推演'}
            </div>
          </div>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="simulator-toolbar">
        <button className="quiz-toolbar-btn" onClick={handleReset}>✕ 重置</button>
        <button className="quiz-toolbar-btn" onClick={handleUndo} disabled={addHistory.length === 0}>↶ 撤回</button>
        {discardedCode && phase !== 'select' && (
          <button className="quiz-toolbar-btn" onClick={handleUnDiscard}>↩ 撤销舍牌</button>
        )}
        <button className="quiz-toolbar-btn" onClick={openAnalysis} disabled={handCodes.length !== 14}>🧭 辅助决策</button>
        <button className="quiz-toolbar-btn" onClick={handleRandomDraw}>🎲 随机摸牌</button>
      </div>

      {/* 智能辅助决策弹层 */}
      {showAnalysis && skillAnalysis && (
        <div className="quiz-analysis-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="adv-overlay-card" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
            <div className="adv-overlay-head">
              <span>🧭 辅助决策</span>
              <button className="adv-overlay-close" onClick={() => setShowAnalysis(false)}>✕</button>
            </div>
            <AdvisorScenarios
              analysis={skillAnalysis}
              onPick={(code) => {
                const tile = sortedHandTiles.find((t) => tileCode(t) === code);
                setShowAnalysis(false);
                if (tile) handleHandClick(tile);
              }}
            />
          </div>
        </div>
      )}

      {/* 撤回确认弹窗 */}
      {confirmRevoke !== null && (
        <div className="quiz-modal-overlay" onClick={() => setConfirmRevoke(null)}>
          <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quiz-modal-icon">🔙</div>
            <div className="quiz-modal-title">撤回这张牌?</div>
            <div className="quiz-modal-body">
              {handCodes[confirmRevoke] ? codeName(handCodes[confirmRevoke]) : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="quiz-toolbar-btn" onClick={() => setConfirmRevoke(null)}>否</button>
              <button className="quiz-toolbar-btn primary" onClick={handleConfirmRevoke}>是,撤回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 工具函数 ──────────────────────────────

/** 从数组末尾查找指定元素的最后一个索引 */
function findLastIndex<T>(arr: T[], item: T): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === item) return i;
  }
  return -1;
}
