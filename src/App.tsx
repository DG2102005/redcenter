// 根组件: 麻将桌面布局与交互
// 顶部导航: 对弈 / 收藏复盘; 侧栏: 信息 / 辅助
import { useMemo, useState, useCallback } from 'react';
import { useGame } from './hooks/useGame';
import { HUMAN_SEAT } from './game/constants';
import { SEAT_NAME } from './game/types';
import { PlayerSeat } from './components/PlayerSeat';
import { CenterTable } from './components/CenterTable';
import { HandRow } from './components/HandRow';
import { MeldArea } from './components/MeldArea';
import { ActionPanel } from './components/ActionPanel';
import { GameInfo } from './components/GameInfo';
import { AdvisorTab } from './components/AdvisorTab';
import { HandPicker } from './components/HandPicker';
import { ReviewReplay } from './components/ReviewReplay';
import { loadSavedRounds } from './game/savedRounds';
import type { SavedRound } from './game/savedRounds';
import { saveRound } from './game/savedRounds';

type View = 'game' | 'review';
type SideTab = 'info' | 'advisor';

function App() {
  const game = useGame();
  const [view, setView] = useState<View>('game');
  const [sideTab, setSideTab] = useState<SideTab>('info');
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>(() => loadSavedRounds());
  const [replayHint, setReplayHint] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // 切回对弈时同步最新积分; 切到复盘时刷新收藏列表
  const switchView = (v: View) => {
    if (v === 'game') game.scoreReload();
    if (v === 'review') setSavedRounds(loadSavedRounds());
    setView(v);
  };

  // 收藏当前终局
  const handleSaveRound = useCallback(() => {
    const rec = saveRound(game.state);
    if (rec) {
      setSavedRounds(loadSavedRounds());
      setReplayHint(`已收藏第${rec.round}局, 可到"📚 复盘"中查看`);
    } else {
      setReplayHint('仅在对弈结束后可收藏');
    }
    setTimeout(() => setReplayHint(''), 2500);
  }, [game.state]);

  const {
    state, startGame, startCustomGame, newRound, humanDiscard, humanReact, humanPass, humanSelfAction, humanPassSelf,
    scoreState, scoreResult, scoreGangEvent, scoreResetRound, scoreResetAll,
  } = game;

  const human = state.players[HUMAN_SEAT];
  const started = state.phase !== 'idle';
  const gameOver = state.phase === 'gameover';

  const canDiscard =
    started && !gameOver &&
    state.currentSeat === HUMAN_SEAT &&
    state.phase === 'discard';

  const reactOptions = state.phase === 'react' ? state.pendingOptions : [];
  const selfOptions =
    state.currentSeat === HUMAN_SEAT && state.phase === 'discard' && state.selfActions.length > 0
      ? state.selfActions
      : [];

  // 已见牌 = 各家已舍出 + 副露明牌(扣除剩余张数用)
  const seenTiles = useMemo(() => {
    const tiles: import('./game/types').Tile[] = [];
    for (const p of state.players) {
      for (const d of p.discards) tiles.push(d);
      for (const m of p.melds) for (const mt of m.tiles) tiles.push(mt);
    }
    return tiles;
  }, [state]);

  // 撤销/重do 状态
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">
          <span className="brand-mark">中</span>
          <span className="brand-name">红中推倒胡</span>
          <span className="brand-sub">训练工具</span>
        </h1>
        <div className="header-controls">
          <nav className="nav-switch">
            <button
              className={`nav-btn ${view === 'game' ? 'active' : ''}`}
              onClick={() => switchView('game')}
            >
              对弈
            </button>
            <button
              className={`nav-btn ${view === 'review' ? 'active' : ''}`}
              onClick={() => switchView('review')}
            >
              复盘
            </button>
          </nav>
          {view === 'game' && !started && (
            <>
              <button className="start-btn" onClick={startGame}>开始对弈</button>
              <button className="start-btn ghost" onClick={() => setShowPicker(true)}>选牌开局</button>
            </>
          )}
          {view === 'game' && gameOver && (
            <>
              <button className="start-btn" onClick={newRound}>开始新一局</button>
              <button className="start-btn ghost" onClick={() => setShowPicker(true)}>选牌开局</button>
              <button className="start-btn ghost" onClick={handleSaveRound}>收藏本局</button>
            </>
          )}
        </div>
      </header>

      {replayHint && <div className="replay-hint">{replayHint}</div>}

      {view === 'review' ? (
        <div className="review-page">
          <ReviewReplay
            rounds={savedRounds}
            onReload={() => setSavedRounds(loadSavedRounds())}
            onPlayFrom={(st, label) => {
              // 从复盘节点继续演绎 → 加载为对弈
              game.loadRound(st);
              setReplayHint(`演绎中: ${label} 之后继续`);
              setTimeout(() => setReplayHint(''), 2500);
              switchView('game');
            }}
          />
        </div>
      ) : (
        <div className="main-layout">
          {/* 牌桌区 */}
          <div className="table-area">
            {started && state.players[3] && (
              <div className="seat-zone zone-top">
                <PlayerSeat player={state.players[3]} state={state} position="top" />
              </div>
            )}
            <div className="seat-row">
              <div className="seat-zone zone-left">
                {started && state.players[2] && (
                  <PlayerSeat player={state.players[2]} state={state} position="left" />
                )}
              </div>
              <div className="center-area">
                {started ? (
                  <CenterTable state={state} />
                ) : (
                  <div className="welcome">
                    <div className="welcome-title">红中百搭 · 广东推倒胡</div>
                    <div className="welcome-desc">1人对战3AI · 自摸/抢杠胡 · 明暗杠实时计分</div>
                    <div className="welcome-features">
                      ✓ 自动理牌 ✓ 逆时针出牌 ✓ 撤销重做 ✓ 牌型分解 ✓ 抢杠胡
                    </div>
                    <div className="welcome-actions">
                      <button className="start-btn big" onClick={startGame}>开始对弈</button>
                      <button className="start-btn big ghost" onClick={() => setShowPicker(true)}>选牌开局</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="seat-zone zone-right">
                {started && state.players[0] && (
                  <PlayerSeat player={state.players[0]} state={state} position="right" />
                )}
              </div>
            </div>
            <div className="seat-zone zone-bottom">
              {started && human && (
                <div className="human-seat">
                  <div className="seat-header">
                    <span className="seat-name">{SEAT_NAME[HUMAN_SEAT]} · {human.name}</span>
                    {human.isDealer && <span className="dealer-mark">庄</span>}
                    {state.currentSeat === HUMAN_SEAT && state.phase === 'discard' && (
                      <span className="turn-indicator">轮到你出牌</span>
                    )}
                  </div>
                  <MeldArea melds={human.melds} size={30} />
                  <HandRow
                    hand={human.hand}
                    melds={human.melds}
                    onDiscard={humanDiscard}
                    interactive={canDiscard}
                    drawnTileId={state.drawnTileId}
                  />
                  {selfOptions.length > 0 && (
                    <ActionPanel
                      options={selfOptions}
                      mode="self"
                      onChoose={humanSelfAction}
                      onPass={humanPassSelf} />
                  )}
                  {reactOptions.length > 0 && (
                    <ActionPanel
                      options={reactOptions}
                      mode={state.reactMode === 'qianggang' ? 'qianggang' : 'react'}
                      onChoose={humanReact}
                      onPass={humanPass} />
                  )}
                  {/* 撤销/重do 按钮 */}
                  {(canUndo || canRedo) && (
                    <div className="action-undo-redo">
                      {canUndo && (
                        <button
                          className="action-btn action-undo"
                          onClick={game.undo}
                          title="撤销上一步"
                        >
                          ↩ 撤销
                        </button>
                      )}
                      {canRedo && (
                        <button
                          className="action-btn action-redo"
                          onClick={game.redo}
                          title="重做"
                        >
                          ↪ 重do
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 侧栏: 信息 / 辅助 */}
          <aside className="side-panel">
            <div className="tab-bar">
              <button className={`tab ${sideTab === 'info' ? 'active' : ''}`} onClick={() => setSideTab('info')}>
                信息
              </button>
              <button className={`tab ${sideTab === 'advisor' ? 'active' : ''}`} onClick={() => setSideTab('advisor')}>
                AI辅助
              </button>
            </div>
            <div className="tab-content">
              {sideTab === 'info' ? (
                started ? (
                  <GameInfo
                    state={state}
                    onNewRound={newRound}
                    scoreState={scoreState}
                    scoreResult={scoreResult}
                    scoreGangEvent={scoreGangEvent}
                    onResetRound={scoreResetRound}
                    onResetAll={scoreResetAll}
                  />
                ) : (
                  <div className="game-idle-card">
                    <div className="idle-card-title">对局规则</div>
                    <ul className="idle-card-list">
                      <li>红中为百搭，可代任意牌</li>
                      <li>自摸胡牌 · 抢杠胡实时计分</li>
                      <li>可撤销重做 · 支持牌型分解</li>
                    </ul>
                    <button className="start-btn" onClick={startGame}>开始对弈</button>
                  </div>
                )
              ) : (
                started && human ? (
                  <AdvisorTab
                    hand={human.hand}
                    meldCount={human.melds.length}
                    canDiscard={canDiscard}
                    onDiscard={humanDiscard}
                    seenTiles={seenTiles}
                  />
                ) : (
                  <div className="empty-panel">开局后即可查看打牌建议</div>
                )
              )}
            </div>
          </aside>
        </div>
      )}

      {showPicker && (
        <HandPicker
          onClose={() => setShowPicker(false)}
          onStart={(codes) => {
            startCustomGame(codes);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

export default App;