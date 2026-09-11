// 全局积分面板 — 对弈"信息"侧栏展示
// 累计积分(永久) + 当轮积分(可清零) + 自摸/输局次数
// 结算: 仅统计玩家自己
//   自摸胡 +3S / 他人自摸 -S
//   抢杠胡 +3S(被抢者赔付) / 被抢杠 -3S
//   暗杠 +6(三家各-2) / 明(补)杠 +3(三家各-1) — 杠分实时结算
import { useState, useCallback } from 'react';
import {
  loadScore, saveScore, resetRoundScore, resetAllScore,
} from '../game/scoring';
import type { ScoreDraw, ScoreState, ScoreSettleKind } from '../game/scoring';
import { Tile as TileComp } from '../components/Tile';
import type { Tile, Suit, GangEvent } from '../game/types';
import { SEAT_NAME } from '../game/types';

// 项目编码 → 牌(仅渲染)
function codeToTile(code: string): Tile {
  return { id: -1, suit: code[0] as Suit, rank: parseInt(code.slice(1), 10) };
}

// 杠事件文案: 杠家得X / 其他家扣Y
function gangLabel(ev: GangEvent): string {
  const gangSeatName = SEAT_NAME[ev.gangSeat];
  const typeName = ev.type === 'angang' ? '暗杠' : ev.type === 'minggang' ? '明杠' : '补杠';
  if (ev.seat === ev.gangSeat) return `你${typeName}得 +${ev.delta}`;
  return `${gangSeatName}家${typeName},你 ${ev.delta}`;
}

// 积分状态 hook(对弈/模拟共用同一份 localStorage 数据)
export function useScore() {
  const [state, setState] = useState<ScoreState>(() => loadScore());
  const [lastResult, setLastResult] = useState<{ draw: ScoreDraw; kind: ScoreSettleKind } | null>(null);
  const [lastGang, setLastGang] = useState<GangEvent | null>(null);

  // 结算一局: amount=该局S(牌面总分)
  //   win: 自摸 → +3S; lose: 他人自摸 → -S
  //   qianggang: 抢杠胡 → +3S; beRobbed: 被抢杠 → -3S
  const settle = useCallback((amount: number, kind: ScoreSettleKind) => {
    setState((prev) => {
      const isWin = kind === 'win' || kind === 'qianggang';
      const delta = kind === 'lose' ? -amount : isWin ? amount * 3 : -amount * 3;
      const next = {
        ...prev,
        cumulative: prev.cumulative + delta,
        round: prev.round + delta,
        ...(isWin
          ? { selfDraws: prev.selfDraws + 1, totalSelfDraws: prev.totalSelfDraws + 1 }
          : { loseRounds: prev.loseRounds + 1, totalLoseRounds: prev.totalLoseRounds + 1 }),
      };
      saveScore(next);
      return next;
    });
  }, []);

  // 杠分实时结算: 杠家+6/+3, 其他家-2/-1(事件已含受影响者与delta)
  const applyGang = useCallback((ev: GangEvent) => {
    setState((prev) => {
      const next = {
        ...prev,
        cumulative: prev.cumulative + ev.delta,
        round: prev.round + ev.delta,
      };
      saveScore(next);
      return next;
    });
  }, []);

  const resetRound = useCallback(() => setState(resetRoundScore()), []);
  const resetAll = useCallback(() => setState(resetAllScore()), []);
  // 重新读取localStorage(供切换视图时同步最新积分)
  const reload = useCallback(() => setState(loadScore()), []);

  return { state, lastResult, setLastResult, lastGang, setLastGang, settle, applyGang, resetRound, resetAll, reload };
}

interface Props {
  score: ScoreState;
  result?: { draw: ScoreDraw; kind: ScoreSettleKind } | null; // 最近一局摸码亮牌结果
  gangEvent?: GangEvent | null; // 最近一条杠分事件(人类视角)
  onResetRound: () => void;
  onResetAll: () => void;
}

export function ScorePanel({ score, result, gangEvent, onResetRound, onResetAll }: Props) {
  const detail = result?.draw;
  return (
    <>
      <div className="score-panel">
        <div className="score-panel-item">
          <span className="score-panel-label">🏆 当轮积分</span>
          <span className="score-panel-value">{score.round}</span>
          <span className="score-panel-sub">
            自摸 {score.selfDraws} 次 · 输 {score.loseRounds} 局
          </span>
        </div>
        <div className="score-panel-item">
          <span className="score-panel-label">💾 累计积分</span>
          <span className="score-panel-value cum">{score.cumulative}</span>
          <span className="score-panel-sub">
            累计自摸 {score.totalSelfDraws} 次 · 输 {score.totalLoseRounds} 局(永久保留)
          </span>
        </div>
        {gangEvent && (
          <div className="score-detail">
            <span>🀄 杠分:</span>
            <span className={gangEvent.seat === gangEvent.gangSeat ? 'score-pos' : 'score-neg'}>
              {gangLabel(gangEvent)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="quiz-toolbar-btn"
            style={{ fontSize: 11, padding: '2px 10px' }}
            onClick={onResetRound}
            title="清零当轮积分,累计保留"
          >
            ↺ 当轮清零
          </button>
          <button
            className="quiz-toolbar-btn"
            style={{ fontSize: 11, padding: '2px 10px' }}
            onClick={onResetAll}
            title="清零全部积分(含累计)"
          >
            ✕ 累计清零
          </button>
        </div>
      </div>

      {detail && detail.cards.length > 0 && (
        <div className="score-detail">
          <span>🎴 摸码亮牌:</span>
          {detail.cards.map((c) => (
            <span key={c.code} className="score-detail-card">
              <TileComp tile={codeToTile(c.code)} size={26} />
              <b style={{ color: 'var(--gold)' }}>+{c.value}</b>
            </span>
          ))}
          <span>
            S=<b style={{ color: 'var(--success-bright)' }}>{detail.total}</b>
            {(() => {
              switch (result?.kind) {
                case 'win':
                  return <>自摸赢 <b style={{ color: 'var(--success-bright)' }}>3×{detail.total}={detail.winnerGain}</b>, 三家各扣 {detail.loserPay}</>;
                case 'qianggang':
                  return <>抢杠胡!<b style={{ color: 'var(--success-bright)' }}>+{detail.winnerGain}</b> (被抢者赔付)</>;
                case 'beRobbed':
                  return <>被抢杠!损失 <b style={{ color: 'var(--danger)' }}>-{detail.winnerGain}</b> (抢杠者得 {detail.winnerGain})</>;
                default:
                  return <>被扣 <b style={{ color: 'var(--danger)' }}>-{detail.loserPay}</b> (自摸者得 {detail.winnerGain})</>;
              }
            })()}
          </span>
        </div>
      )}
    </>
  );
}