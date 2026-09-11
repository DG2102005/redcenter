# On-Demand Auxiliary Decision-Making Feature - Implementation Plan

## [x] Task 1: Modify gameEngine to stop auto-generating advice
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - In `src/game/gameEngine.ts`, remove the automatic `buildAdvice()` calls in `drawTile()` (line 126-129) and `gangRinshan()` (line 316-318)
  - Add a new public function `computeOnDemandAdvice(state: GameState, seat: Seat): AdviceData` that wraps `buildAdvice()` but can be called on-demand
  - Export `computeOnDemandAdvice` from gameEngine for use by the UI layer
  - Clear `lastAdvice` when the game phase changes (to avoid stale advice)
- **Acceptance Criteria Addressed**: AC-1, AC-8
- **Test Requirements**:
  - `programmatic` TR-1.1: After drawing a tile (human turn), `state.lastAdvice` should be null if no advice was requested
  - `programmatic` TR-1.2: `computeOnDemandAdvice()` returns valid `AdviceData` when called with a valid game state
  - `programmatic` TR-1.3: Existing 37 tests still pass after modification
- **Notes**: This is the foundational change — everything else builds on advice being opt-in.

## [x] Task 2: Add "请求辅助决策" button to the game UI
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - In `src/App.tsx`, add a "请求辅助决策" button that appears when: phase === 'discard', currentSeat === HUMAN_SEAT, and gameOver === false
  - The button should be positioned near the human player's hand area but not overlapping it
  - When clicked, it calls the on-demand advice computation and toggles the panel visibility
  - The button should show a subtle indicator when advice is available (pulsing border, small dot)
  - Button text: "🧭 请求辅助决策"
- **Acceptance Criteria Addressed**: AC-1, AC-6
- **Test Requirements**:
  - `programmatic` TR-2.1: Button is visible during human discard turns and hidden otherwise
  - `human-judgement` TR-2.2: Button position doesn't overlap with hand tiles or game-critical UI elements
  - `human-judgement` TR-2.3: Button styling matches the existing gold/dark theme

## [x] Task 3: Enhance advisor.ts with scenario computation for incoming tiles
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - Create a new function `computeScenarios(state: GameState, seat: Seat)` in `src/game/advisor.ts`
  - For each candidate discard tile:
    - Compute the resulting shanten (向听) after discarding that tile
    - Compute all possible incoming tiles (进牌) that would advance to tenpai (听牌) or reduce shanten by 1
    - Count distinct categories (门) and total tiles (张) among incoming tiles
    - Assess danger level (0-3) based on seen tiles from all players
  - Return a structured `ScenarioAnalysis` object with ranked scenarios
  - Keep the existing `buildAdvice()` for backward compatibility with the correction system
- **Acceptance Criteria Addressed**: AC-3, AC-5, AC-8
- **Test Requirements**:
  - `programmatic` TR-3.1: For a known test hand, scenario shanten calculations match expected values
  - `programmatic` TR-3.2: Incoming tile lists are complete (no missing tiles that would actually advance the hand)
  - `programmatic` TR-3.3: Category and tile counts (门/张) are correctly computed
  - `programmatic` TR-3.4: Danger levels properly reflect tile visibility across all players' discards/melds

## [x] Task 4: Create SmartAnalysisPanel component with card-based layout
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - Create `src/components/SmartAnalysisPanel.tsx` 
  - Implement card-based layout matching competitor product style:
    - Top section: current hand display (sorted, with tile images)
    - Each scenario card shows:
      - Left: "打 [tile image] 🀄" 
      - Right: grid of incoming tile images
      - Bottom summary: "计算结果: N轮胡" and "可进X门Y张"
    - Cards sorted by optimization quality (best scenario first)
  - Use existing `Tile` component for tile images
  - Add CSS animations for panel expand/collapse
  - Include a collapse/dismiss button
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: Panel renders at least 3 scenario cards when advice is computed
  - `human-judgement` TR-4.2: Card layout visually matches the competitor product reference image
  - `human-judgement` TR-4.3: Tile images render correctly in all scenarios
  - `human-judgement` TR-4.4: Panel expand/collapse animation is smooth (no layout jumps)

## [x] Task 5: Integrate SmartAnalysisPanel into App.tsx with on-demand flow
- **Priority**: high
- **Depends On**: Task 2, Task 4
- **Description**: 
  - Import and render `SmartAnalysisPanel` in the App layout
  - Wire up the request button → compute advice → show panel flow
  - Pass `GameState` and the `computeOnDemandAdvice` function to the panel
  - Handle panel dismissal and re-request scenarios
  - Ensure the panel is positioned to not overlap hand tiles (bottom: 200px offset or side panel)
  - Integrate with the existing `AdvisorPanel` correction flow (user can still correct suggestions)
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1: Clicking "请求辅助决策" triggers advice computation within 300ms
  - `human-judgement` TR-5.2: Panel positioning doesn't block hand tiles or board area
  - `human-judgement` TR-5.3: Dismissed panel can be re-opened with a new request

## [x] Task 6: Add CSS styles for analysis panel and scenario cards
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - Add styles to `src/index.css` for:
    - `.smart-analysis-panel` — main panel container (positioned non-overlapping)
    - `.scenario-card` — individual discard scenario card
    - `.scenario-discard` — left side: "打 [tile]" with tile image
    - `.scenario-incoming-grid` — right side: grid of incoming tile images
    - `.scenario-summary` — bottom: "计算结果" and "可进X门Y张"
    - `.request-advice-btn` — the on-demand trigger button
    - `.panel-collapse-anim` — expand/collapse transition
  - Match the existing gold/dark theme
  - Ensure responsive card sizing for 3-5 scenarios
- **Acceptance Criteria Addressed**: AC-4, AC-6
- **Test Requirements**:
  - `human-judgement` TR-6.1: All new styles render correctly (no visual glitches)
  - `human-judgement` TR-6.2: Color scheme matches the existing application theme
  - `programmatic` TR-6.3: No CSS conflicts with existing styles (verified by visual inspection)

## [x] Task 7: Update types and data structures
- **Priority**: medium
- **Depends On**: Task 3
- **Description**: 
  - In `src/game/types.ts`, add new interfaces:
    - `DiscardScenario`: { tile, shantenAfter, incomingTiles, categoryCount, tileCount, dangerLevel, reasoning }
    - `ScenarioAnalysis`: { currentShanten, handTiles, scenarios: DiscardScenario[], adviceData }
  - Update `AdviceData.candidates` to include additional fields needed by the card UI (incoming tiles list per candidate)
  - Add type for the new `computeOnDemandAdvice` return type
- **Acceptance Criteria Addressed**: AC-3, AC-5
- **Test Requirements**:
  - `programmatic` TR-7.1: All new TypeScript types compile without errors
  - `programmatic` TR-7.2: TypeScript compilation (`tsc --noEmit`) passes with zero errors

## [x] Task 8: Verification and Integration Testing
- **Priority**: high
- **Depends On**: Task 1-7
- **Description**: 
  - Run full TypeScript compilation check
  - Run all existing unit tests (37 must pass)
  - Run new tests for scenario computation (if added)
  - Browser verification: play a full game, request advice at multiple points, verify:
    - Button only appears during discard turns
    - Panel shows correct scenarios with tile images
    - Panel dismisses and re-opens correctly
    - No overlapping with hand tiles
    - Existing game flow (auto-advance, AI turns) works without auto-advice
  - Performance check: advice computation < 300ms
- **Acceptance Criteria Addressed**: AC-1 through AC-8
- **Test Requirements**:
  - `programmatic` TR-8.1: `npx tsc --noEmit` passes with zero errors
  - `programmatic` TR-8.2: `npx vitest run` — all 37 existing tests pass
  - `human-judgement` TR-8.3: Full game playthrough with on-demand advice verified
  - `human-judgement` TR-8.4: Visual comparison with competitor reference image confirms style match
- **Notes**: This final validation ensures everything works end-to-end
