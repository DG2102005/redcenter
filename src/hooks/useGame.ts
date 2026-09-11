// 游戏状态Hook: 管理状态 + 驱动AI自动行动
import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, ActionOption, Seat } from '../game/types';
import { tileCode, tileName } from '../game/types';
import { HUMAN_SEAT, AI_THINK_DELAY } from '../game/constants';
import {
  createInitialState, startNewRound, startCustomRound, drawTile, discardTile,
  applyAction, applySelfAction, humanPassReact, humanPassSelfAction, aiPlayTurn,
  pushHistory, popHistory, redoHistory,
} from '../game/gameEngine';
import { drawScoreCards } from '../game/scoring';
import type { ScoreDraw, ScoreSettleKind } from '../game/scoring';
import type { GangEvent } from '../game/types';
import { saveRound as saveRoundToStorage } from '../game/savedRounds';
import { useScore } from '../quiz/ScorePanel';

interface PendingSettle {
  kind: ScoreSettleKind;
  draw: ScoreDraw;
}

// 历史动作的中文标签(供复盘时间线展示)
function historyLabel(option: ActionOption, qianggang: boolean): string {
  const typeCn =
    option.type === 'hu'
      ? qianggang ? '抢杠胡' : '自摸胡'
      : ({ peng: '碰', minggang: '明杠', angang: '暗杠', bugang: '补杠' } as Record<string, string>)[option.type] ?? option.type;
  return option.tile ? `${typeCn} ${tileName(option.tile)}` : typeCn;
}

export function useGame() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const timerRef = useRef<number | null>(null);

  // 全局积分(对弈/模拟共享)
  const score = useScore();
  const pendingScoreRef = useRef<PendingSettle | null>(null);
  const processedGangRef = useRef(0); // 已结算的杠事件数(增量结算)

  // 从剩余牌墙构造计分池
  const poolFromDeck = useCallback((deck: GameState['deck']): Record<string, number> => {
    const pool: Record<string, number> = {};
    for (const t of deck) {
      const c = tileCode(t);
      pool[c] = (pool[c] ?? 0) + 1;
    }
    return pool;
  }, []);

  // 判断是否需要自动推进
  const needAutoAdvance = useCallback((s: GameState): boolean => {
    if (s.phase === 'idle' || s.phase === 'gameover') return false;
    if (s.phase === 'react') return false; // 等人类选择
    if (s.phase === 'discard' && s.currentSeat === HUMAN_SEAT) return false; // 等人类出牌
    return true; // draw阶段(无论人/AI) 或 AI的discard 自动推进
  }, []);

  // 单步推进
  const advanceOne = useCallback((s: GameState): GameState => {
    let next: GameState = s;
    if (s.phase === 'draw') {
      // 摸牌(人/AI都自动摸)
      next = drawTile(s, s.currentSeat);
    } else if (s.phase === 'discard' && s.currentSeat !== HUMAN_SEAT) {
      next = aiPlayTurn(s);
    }
    // AI胜局结算: 抢杠胡(人类被抢 → -3S)或自摸胡(人类输 → -S)
    if (next.phase === 'gameover' && !next.isDraw && next.winner !== null && next.winner !== HUMAN_SEAT) {
      const draw = drawScoreCards(poolFromDeck(next.deck));
      if (next.qianggangVictim !== null) {
        if (next.qianggangVictim === HUMAN_SEAT) {
          pendingScoreRef.current = { kind: 'beRobbed', draw };
        }
        // AI抢AI的杠与人类无关, 不结算
      } else {
        pendingScoreRef.current = { kind: 'lose', draw };
      }
    }
    return next;
  }, [poolFromDeck]);

  // 杠分即时结算(增量): 暗杠 +6/-2每家, 明(补)杠 +3/-1每家
  useEffect(() => {
    const events = state.gangEvents;
    // 新一局 gangEvents 被清空 → 重置进度
    if (events.length < processedGangRef.current) processedGangRef.current = 0;
    if (events.length > processedGangRef.current) {
      const fresh = events.slice(processedGangRef.current);
      processedGangRef.current = events.length;
      for (const ev of fresh) {
        score.applyGang(ev);
        if (ev.seat === HUMAN_SEAT) score.setLastGang(ev);
      }
    }
  }, [state, score]);

  // 状态变化时驱动
  useEffect(() => {
    if (!needAutoAdvance(state)) return;
    timerRef.current = window.setTimeout(() => {
      setState((prev) => {
        const next = advanceOne(prev);
        return next;
      });
    }, AI_THINK_DELAY);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state, needAutoAdvance, advanceOne]);

  // ===== 暴露的人类操作 =====
  const startGame = useCallback(() => {
    setState((prev) => startNewRound(prev, HUMAN_SEAT));
  }, []);

  const startCustomGame = useCallback((codes: string[]) => {
    setState((prev) => startCustomRound(prev, codes, HUMAN_SEAT));
  }, []);

  const newRound = useCallback(() => {
    setState((prev) => {
      const banker: Seat = prev.winner !== null ? (prev.winner as Seat) : prev.banker;
      return startNewRound(prev, banker);
    });
  }, []);

  const humanDiscard = useCallback((tileId: number) => {
    setState((prev) => {
      // 撤销前保存历史(仅在非gameover且轮到人类出牌时)
      let base = prev;
      if (prev.phase !== 'gameover' && prev.currentSeat === HUMAN_SEAT && prev.phase === 'discard') {
        const t = prev.players[HUMAN_SEAT].hand.find((x) => x.id === tileId);
        base = pushHistory(prev, `出牌 ${t ? tileName(t) : ''}`);
      }
      return discardTile(base, HUMAN_SEAT, tileId);
    });
  }, []);

  const humanReact = useCallback((option: ActionOption) => {
    setState((prev) => {
      // 撤销前保存历史(仅在react模式下)
      let base = prev;
      if (prev.phase === 'react') {
        base = pushHistory(prev, historyLabel(option, prev.qianggangVictim !== null));
      }
      // 人类抢杠胡 → 从剩余牌墙抽计分牌(在effect中结算)
      if (option.type === 'hu' && prev.qianggangVictim !== null) {
        const draw = drawScoreCards(poolFromDeck(prev.deck));
        pendingScoreRef.current = { kind: 'qianggang', draw };
      }
      return applyAction(base, option, true);
    });
  }, [poolFromDeck]);

  const humanPass = useCallback(() => {
    setState((prev) => humanPassReact(prev));
  }, []);

  const humanSelfAction = useCallback((option: ActionOption) => {
    setState((prev) => {
      // 撤销前保存历史(仅在self模式下且有selfActions)
      let base = prev;
      if (prev.phase === 'discard' && prev.currentSeat === HUMAN_SEAT && prev.selfActions.length > 0) {
        base = pushHistory(prev, historyLabel(option, false));
      }
      // 人类自摸胡 → 从剩余牌墙抽计分牌(在effect中结算, 避免setState副作用)
      if (option.type === 'hu') {
        const draw = drawScoreCards(poolFromDeck(prev.deck));
        pendingScoreRef.current = { kind: 'win', draw };
      }
      const next = applySelfAction(base, option);
      // 人类补杠被AI抢杠胡 → 人类输 3S(被抢杠者赔付)
      if (next.phase === 'gameover' && !next.isDraw && next.winner !== null && next.winner !== HUMAN_SEAT && next.qianggangVictim === HUMAN_SEAT) {
        const draw = drawScoreCards(poolFromDeck(next.deck));
        pendingScoreRef.current = { kind: 'beRobbed', draw };
      }
      return next;
    });
  }, [poolFromDeck]);

  // 结算一局得分(状态更新完成后): 自摸赢 +3S / 他人自摸输 -S / 抢杠 ±3S
  useEffect(() => {
    const pending = pendingScoreRef.current;
    if (!pending) return;
    pendingScoreRef.current = null;
    if (pending.draw.cards.length > 0) score.settle(pending.draw.total, pending.kind);
    score.setLastResult({ draw: pending.draw, kind: pending.kind });
  }, [state, score]);

  // 人类放弃自摸胡(从selfActions移除hu选项, 保留暗杠/补杠)
  const humanPassSelf = useCallback(() => {
    setState((prev) => humanPassSelfAction(prev));
  }, []);

  // 撤销上一步操作(恢复快照, 历史栈保留以便重做)
  const undo = useCallback(() => {
    setState((prev) => popHistory(prev) ?? prev);
  }, []);

  // 重做上一步已撤销的操作
  const redo = useCallback(() => {
    setState((prev) => redoHistory(prev) ?? prev);
  }, []);

  // 收藏当前终局(供复盘/演绎)
  const saveRound = useCallback(() => {
    return saveRoundToStorage(state);
  }, [state]);

  // 从收藏状态恢复对弈(用于复盘回放或手动演绎某一步)
  const loadRound = useCallback((s: GameState) => {
    // 直接加载指定状态; 清空撤销栈避免与新牌局混淆
    const restored = structuredClone(s);
    restored.history = [];
    restored.historyIndex = -1;
    restored.phase = s.phase === 'gameover' ? 'idle' : s.phase;
    if (restored.phase === 'idle') restored.players = [];
    setState(restored);
  }, []);

  return {
    state,
    startGame,
    startCustomGame,
    newRound,
    humanDiscard,
    humanReact,
    humanPass,
    humanSelfAction,
    humanPassSelf,
    undo,
    redo,
    saveRound,
    loadRound,
    scoreState: score.state,
    scoreResult: score.lastResult,
    scoreGangEvent: score.lastGang,
    scoreResetRound: score.resetRound,
    scoreResetAll: score.resetAll,
    scoreReload: score.reload,
  };
}
