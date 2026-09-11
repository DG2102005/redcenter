// 游戏信息面板
import type { GameState } from '../game/types';
import { SEAT_NAME } from '../game/types';
import { Tile } from './Tile';
import { sortHand } from '../game/sort';
import { ScorePanel } from '../quiz/ScorePanel';
import type { ScoreState, ScoreSettleKind } from '../game/scoring';
import type { ScoreDraw } from '../game/scoring';
import type { GangEvent } from '../game/types';

interface Props {
  state: GameState;
  onNewRound: () => void;
  scoreState: ScoreState;
  scoreResult?: { draw: ScoreDraw; kind: ScoreSettleKind } | null;
  scoreGangEvent?: GangEvent | null;
  onResetRound: () => void;
  onResetAll: () => void;
}

export function GameInfo({ state, onNewRound, scoreState, scoreResult, scoreGangEvent, onResetRound, onResetAll }: Props) {
  const remaining = state.deck.length;
  const phaseText = {
    idle: '未开始',
    dealing: '发牌中',
    draw: '摸牌',
    discard: '出牌',
    action: '操作',
    react: '选择操作',
    gameover: state.isDraw ? '流局' : (state.winner !== null ? `${SEAT_NAME[state.winner]}胡牌` : '结束'),
  }[state.phase];

  // 局终: 剩余牌墙翻开(横向排列, 与AI翻牌布局一致)
  const wall = state.phase === 'gameover' && state.deck.length > 0
    ? sortHand(state.deck)
    : null;

  return (
    <div className="game-info">
      {/* 积分(累计+当轮) */}
      <ScorePanel
        score={scoreState}
        result={scoreResult}
        gangEvent={scoreGangEvent}
        onResetRound={onResetRound}
        onResetAll={onResetAll}
      />

      <div className="info-row"><span>局数</span><b>{state.round}</b></div>
      <div className="info-row"><span>庄家</span><b>{state.players.length ? SEAT_NAME[state.banker] : '-'}</b></div>
      <div className="info-row"><span>当前</span><b>{state.players.length ? SEAT_NAME[state.currentSeat] : '-'}</b></div>
      <div className="info-row"><span>阶段</span><b>{phaseText}</b></div>
      <div className="info-row"><span>剩余牌</span><b>{remaining}</b></div>
      {state.phase === 'gameover' && (
        <button className="new-round-btn" onClick={onNewRound}>开始新一局</button>
      )}
      {wall && (
        <div className="wall-remain">
          <div className="wall-remain-title">剩余牌墙 · {wall.length} 张</div>
          <div className="wall-remain-tiles">
            {wall.map((t) => (
              <Tile key={t.id} tile={t} size={22} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
