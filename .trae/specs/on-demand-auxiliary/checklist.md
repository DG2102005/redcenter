# On-Demand Auxiliary Decision-Making - Verification Checklist

## Functional Checkpoints
- [x] Checkpoint 1: During human player's discard turn, `lastAdvice` is null until user clicks "请求辅助决策" button
- [x] Checkpoint 2: The "请求辅助决策" button appears only during human discard turns and is hidden during other phases
- [x] Checkpoint 3: Clicking "请求辅助决策" triggers advice computation and displays the analysis panel within 300ms
- [x] Checkpoint 4: Analysis panel shows at least 3 discard scenarios, each with tile image to discard, shanten count, and incoming tile list
- [x] Checkpoint 5: Each scenario card shows "计算结果: N轮胡" and "可进X门Y张" summary
- [x] Checkpoint 6: Shanten calculations are correct for known test hands (verified against manual calculation)
- [x] Checkpoint 7: Incoming tile lists are complete — all tiles that would advance the hand toward tenpai are listed
- [x] Checkpoint 8: Danger levels consider all players' discards and melds (not just the player's own hand)
- [x] Checkpoint 9: Panel can be dismissed and re-opened on subsequent turns
- [x] Checkpoint 10: Panel positioning doesn't overlap with hand tiles, game board, or action panels

## Visual Checkpoints
- [x] Checkpoint 11: Scenario cards use card-based layout matching competitor product reference (image available in requirements)
- [x] Checkpoint 12: Tile images render correctly for all suits (万/筒/条/字) including 红中
- [x] Checkpoint 13: Card styling matches existing gold/dark theme
- [x] Checkpoint 14: Panel expand/collapse animation is smooth without layout jumps
- [x] Checkpoint 15: Request button styling is consistent with existing theme and position is non-intrusive

## Technical Checkpoints
- [x] Checkpoint 16: `npx tsc --noEmit` passes with zero TypeScript errors
- [x] Checkpoint 17: `npx vitest run` — all 37 existing tests pass (no regressions)
- [x] Checkpoint 18: New `computeOnDemandAdvice()` function is properly exported and typed
- [x] Checkpoint 19: Existing game flow (auto-advance, AI turns, error handling) works without auto-advice
- [x] Checkpoint 20: Memory leak check — no event listeners or timers created without cleanup on dismiss

## Integration Checkpoints
- [x] Checkpoint 21: On-demand advice integrates with the existing correction system (AdvisorPanel correction flow still works)
- [x] Checkpoint 22: The existing "辅助" tab in the sidebar still works for viewing last correction and strategy hints
- [x] Checkpoint 23: The 专家 (Expert) tab still works with corrections and trend analysis
- [x] Checkpoint 24: Game restart/new round clears stale advice state properly
- [x] Checkpoint 25: Performance — full panel render with 5 scenarios completes in under 100ms
