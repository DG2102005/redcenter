// 玩家座位(含AI对手) - 支持局终翻牌
import type { PlayerState, GameState, Tile } from '../game/types';
import { TileBack, Tile as TileComp } from './Tile';
import { MeldArea } from './MeldArea';
import { SEAT_NAME, tileName } from '../game/types';
import { sortHand } from '../game/sort';

interface Props {
  player: PlayerState;
  state: GameState;
  position: 'top' | 'left' | 'right';
  showLabel?: boolean;
}

export function PlayerSeat({ player, state, position, showLabel }: Props) {
  const isGameOver = state.phase === 'gameover';
  const isTurn = state.currentSeat === player.seat && !isGameOver;
  const handCount = player.hand.length;
  const meldCount = player.melds.reduce((s, m) => s + m.tiles.length, 0);
  const size = position === 'top' ? 22 : 26;

  // 局终：将AI手牌排序 + 翻转显示
  const sortedHand = isGameOver ? sortHand(player.hand) : [];

  // 胡/流标签
  const isWinner = !state.isDraw && state.winner === player.seat;

  return (
    <div className={`player-seat seat-${position} ${isTurn ? 'seat-active' : ''}`}>
      <div className="seat-header">
        <span className="seat-name">{SEAT_NAME[player.seat]} · {player.name}</span>
        {player.isDealer && <span className="dealer-mark">庄</span>}
        {isTurn && <span className="turn-indicator">思考中…</span>}
        {isGameOver && isWinner && <span className="winner-tag">自摸胡牌</span>}
        {isGameOver && state.isDraw && <span className="draw-tag">流局</span>}
      </div>
      <div className="seat-hand">
        {isGameOver ? (
          sortedHand.map((t, i) => (
            <div
              key={`gameover-${player.seat}-${t.id}`}
              className="flip-card"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div
                className="flip-card-inner"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flip-card-front">
                  <TileBack size={size} />
                </div>
                <div className="flip-card-back">
                  <TileComp tile={t} size={size} showLabel={showLabel} />
                </div>
              </div>
            </div>
          ))
        ) : (
          player.hand.map((t, i) => (
            <TileBack key={`hand-${player.seat}-${t.id}`} size={size} />
          ))
        )}
      </div>
      <MeldArea melds={player.melds} size={24} showLabel={showLabel} />
      <div className="seat-stats">手牌{handCount} · 副露{meldCount}张</div>

      {/* 局终显示弃牌明细 */}
      {isGameOver && player.discards.length > 0 && (
        <div className="seat-discards-end">
          弃: {player.discards.map((t) => tileName(t)).join(' ')}
        </div>
      )}
    </div>
  );
}
