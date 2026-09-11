# On-Demand Auxiliary Decision-Making Feature - PRD

## Overview
- **Summary**: Implement an on-demand auxiliary decision-making feature for the Hongzhong Mahjong training tool that provides strategic tile discard recommendations. The feature activates only when explicitly requested by the user via a "请求辅助决策" button, presenting multiple discard scenarios with visual tile cards, shanten analysis, and reasoning — styled after competing mahjong training products like the 智能模拟器.
- **Purpose**: Replace the current always-on advice system with an opt-in model that respects user autonomy while providing deep strategic analysis when needed. The visual presentation should match the competitor product's card-based layout showing discard scenarios with incoming tile predictions.
- **Target Users**: Mahjong players training on the Hongzhong (红中) variant who want strategic guidance on their discard decisions without being interrupted during normal play.

## Goals
- Make advice generation **on-demand** — not automatically computed for every tile discard action
- Analyze current hand composition plus all previously discarded tiles across all players
- Compute accurate shanten (向听) numbers and list all possible incoming tiles to reach tenpai
- Present multiple discard scenarios as visual cards showing: discard tile, shanten improvement, incoming tile list
- Match the competitor product's card-based visual style with tile images, numbered shanten, and category counts
- Keep the interface **unobtrusive** during normal gameplay

## Non-Goals (Out of Scope)
- Real-time auto-advice on every turn
- AI-controlled automatic discard decisions
- Multi-player networked play
- Integration with external mahjong databases or online case libraries
- Voice-based assistance
- Mobile-specific responsive design (current desktop layout is sufficient)

## Background & Context
- The existing `buildAdvice()` in `src/game/advisor.ts` already computes shanten, candidates with scores, and reasoning — this can be reused
- Currently advice is auto-generated in `gameEngine.ts` → `drawTile()` whenever the human player's turn arrives (line 126-129)
- The `AdvisorPanel.tsx` component displays the advice in the sidebar tabs
- The competitor product (智能模拟器) shows: hand tiles at top → multiple scenario cards below → each card shows "打 [tile]", "可进X门Y张", and a grid of incoming tiles
- Key files to modify: `gameEngine.ts` (stop auto-generating advice), `AdvisorPanel.tsx` (add request button + new card-based view), `index.css` (new styles)

## Functional Requirements

### FR-1: On-Demand Advice Trigger
- When it's the human player's turn to discard, a "请求辅助决策" button appears in the game UI
- Clicking the button triggers advice computation and displays the analysis panel
- The button should be visually distinct but unobtrusive during normal gameplay
- Once requested, the advice panel expands showing the full analysis

### FR-2: Hand & Discard Analysis
- System analyzes the player's current hand composition
- Takes into account all previously discarded tiles by all 4 players (from `GameState.players[].discards`)
- Considers melds (副露) from all players
- Identifies the suit/rank distribution and potential sequences/pairs

### FR-3: Shanten Calculation & Ready Hand Analysis
- Computes current shanten number (向听数: 0=听牌, 1=一向听, etc.)
- For each candidate discard tile, calculates the resulting shanten
- Lists ALL possible incoming tiles (进牌) that would advance the hand toward tenpai after each discard
- Shows tile category counts (X门 = distinct suits/types, Y张 = total count)

### FR-4: Multiple Discard Scenarios
- At minimum, presents the top 3-5 discard scenarios sorted by optimization quality
- Each scenario card displays:
  - Tile to discard (with visual mahjong tile image)
  - Shanten after discard (e.g., "3轮胡" = 3 tiles to ready hand)
  - List of incoming tiles to reach tenpai (visual grid of tile images)
  - Category and count summary (e.g., "可进9门32张")
  - Reasoning/analysis text

### FR-5: Visual Presentation
- Card-based layout matching the competitor product style
- Each scenario is a separate card with:
  - Left side: "打 [tile image]" label
  - Right side: grid of incoming tiles leading to ready hand
  - Summary line: "计算结果: N轮胡" or "可进X门Y张"
- Mahjong tile images rendered consistently with the existing Tile component
- Clear visual hierarchy with card borders and spacing

### FR-6: Unobtrusive Interface
- When not requested: only shows a small "请求辅助决策" button or collapsed state
- When requested: panel expands with full analysis
- Panel auto-collapses or can be manually dismissed
- Does not block or overlap critical game elements (hand tiles, board)

### FR-7: Danger/Safety Assessment
- Each scenario includes a safety rating for the suggested discard tile
- Considers which tiles have been seen/discarded by other players
- Provides risk context (e.g., "此牌已被打出2次, 安全")

## Non-Functional Requirements

### NFR-1: Performance
- On-demand advice computation should complete within 300ms for a 14-tile hand
- The analysis panel should render within 100ms after computation completes
- No visual lag or jank when expanding/collapsing the panel

### NFR-2: Code Quality
- Follow existing code conventions (TypeScript, functional components, naming)
- Reuse existing types and utilities from `types.ts`, `advisor.ts`, `win.ts`
- Maintain test coverage — existing 37 tests must continue to pass

### NFR-3: Visual Consistency
- Mahjong tile images use the existing `Tile` component
- Color scheme matches the existing gold/dark theme
- Chinese text used for all UI labels (consistent with existing app)

## Constraints
- **Technical**: React 18 + TypeScript + Vite, no additional dependencies
- **Game Rules**: Hongzhong (红中) as universal wild card; only self-draw wins (自摸胡); seven pairs (七小对) allowed; no chi/pon/kan from others for winning
- **Existing Infrastructure**: Must integrate with `buildAdvice()`, `correctionLib.ts`, `strategyLib.ts`, and the existing game state machine
- **Platform**: Desktop web (no mobile adaptation required)

## Assumptions
- The player will explicitly click "请求辅助决策" when they want analysis
- The existing `checkTing()` and `calcShanten()` algorithms are sufficient for shanten calculation
- The player has a 4-8 tile hand (post-meld) during their discard turn
- All tile images can be rendered using the existing SVG-based Tile component
- No backend/API integration needed — all processing is client-side

## Acceptance Criteria

### AC-1: On-Demand Trigger
- **Given**: It's the human player's discard turn and advice has NOT been requested
- **When**: The player looks at the game interface
- **Then**: Only a small "请求辅助决策" button is visible; no advice panel is shown
- **Verification**: `programmatic`

### AC-2: Advice Panel Expansion
- **Given**: It's the human player's discard turn
- **When**: The player clicks "请求辅助决策"
- **Then**: An analysis panel expands showing discard scenarios with tile images, shanten numbers, and incoming tile lists
- **Verification**: `human-judgment`

### AC-3: Multiple Scenarios
- **Given**: Advice has been requested
- **When**: The analysis panel renders
- **Then**: At least 3 discard scenarios are shown, each with: tile to discard, shanten count, incoming tile grid, category count
- **Verification**: `programmatic`

### AC-4: Visual Style Match
- **Given**: The analysis panel is displayed
- **When**: A reviewer compares it against the competitor product reference image
- **Then**: The card-based layout, tile image presentation, and summary text style match the reference
- **Verification**: `human-judgment`

### AC-5: Discard Analysis Accuracy
- **Given**: A specific hand with known optimal discards
- **When**: Advice is requested
- **Then**: The top recommendation matches known mahjong strategy; shanten calculations are correct; incoming tile lists are complete
- **Verification**: `programmatic`

### AC-6: Unobtrusive When Not Requested
- **Given**: The player is in normal gameplay without requesting advice
- **When**: The player plays tiles, interacts with the board
- **Then**: The request button is small and positioned non-intrusively; no panel overlays critical game elements
- **Verification**: `human-judgment`

### AC-7: All Tests Pass
- **Given**: The implementation is complete
- **When**: Running `npx tsc --noEmit` and `npx vitest run`
- **Then**: Zero TypeScript errors; all 37 existing tests pass
- **Verification**: `programmatic`

### AC-8: Discard Context Analysis
- **Given**: Advice is requested
- **When**: The system computes analysis
- **Then**: It considers all players' discards and melds (not just the player's own hand) for danger/safety assessment
- **Verification**: `programmatic`

## Open Questions
- [ ] Should the analysis panel appear as a sidebar expansion, an overlay, or an inline card near the hand area?
- [ ] Should the number of scenarios be configurable (e.g., top 3 vs top 5)?
- [ ] Should clicking a scenario's tile actually execute the discard, or just provide information?
