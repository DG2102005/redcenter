# 用户校正机制 + 红中麻将专家Tab + 局终翻牌 + 自摸横幅优化 实现计划

## 一、Summary

本次改动覆盖用户提出的 **3 大需求 4 个子项**：

| 编号 | 需求 | 核心交付 |
|---|---|---|
| A1 | 辅助决策校正机制 + 经验库 | AdvisorPanel 增加"我不同意/我来纠正"按钮，可从候选牌中选用户认为更优的牌 + 填写校正理由，写入 localStorage 校正经验表 |
| A2 | 红中麻将专家独立 Tab | 侧栏新增第 6 个 tab `专家`，含：①校正历史与导出/导入；②基于校正经验加权后的专属建议；③局势评分面板（进攻分/防守分/牌效分/红中运用健康度）；④个性化趋势（近期正确率/常见失误类型） |
| B  | 自摸/结束提醒不遮挡牌面 | `.result-banner` 从"50%居中全屏大字弹窗"改为"牌桌中心缩小版卡片（原大小约40%）+ 3秒后自动折叠为右下角可点开徽标"；`.mistake-toast` 从 bottom:20px → bottom:300px（完全避开底部手牌区域，进入 side-panel 上方空白），默认 4 秒消失可点击保留 |
| C  | 局终自动翻牌（牌背翻牌面） | `PlayerSeat.tsx` 当 `state.phase==='gameover'` 时将 TileBack 数组替换为实际的 `Tile`（读取 player.hand），按与人类相同的万→筒→条→字顺序排序，每张牌带翻转动画（CSS flip），翻完后所有 3 家 AI 的暗手牌、副露、弃牌在主桌面直观可见，便于复盘 |

---

## 二、Current State Analysis（基于 Phase 1 代码探索）

### 2.1 校正机制现状

- `src/game/types.ts`：`AdviceData` 定义了推荐牌 + 候选列表 + 策略库匹配提示，但**无校正记录类型**
- `src/components/AdvisorPanel.tsx`：当前纯展示组件，有 `expand-btn` 展开候选详情，**没有校正入口**、无法点击候选覆盖系统建议、无法填理由
- `src/game/strategyLib.ts`：已存 StrategyCase（用户可在策略库面板手动加），**但无"从当前 advice 直接生成校正案例"的自动化路径**；`StrategyContext` 字段齐全，可复用
- 存储：已用 localStorage（key `hongzhong_strategy_lib_v2`），需新增 `hongzhong_correction_log_v1`

### 2.2 自摸横幅/失误提醒 现状（遮挡问题根因）

```css
/* index.css L434-L449: 结束横幅 */
.result-banner {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 32px; padding: 20px 40px; z-index: 100; /* 大弹窗居中,完全遮挡中心牌桌+所有座位手牌 */
}

/* index.css L594-L607: 失误浮层 */
.mistake-toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 90; /* 右下角=用户手牌区,点牌时误触+遮挡 */
}
```

确认 App.tsx L159-L174：`.mistake-toast` + `.result-banner` 都在 `<div className="app">` 内作为 fixed 浮层。

### 2.3 局终翻牌现状

- `src/components/PlayerSeat.tsx` L30-L32：
```tsx
{Array.from({ length: handCount }).map((_, i) => (
  <TileBack key={i} size={...} />  /* 全部是牌背,即使 phase='gameover' 也看不到AI实际手牌 */
))}
```
- 数据可及性：`player.hand`（PlayerState）在 PlayerSeat props 里已传入，但**未被使用**，只取了 `handCount` 显示牌背数量
- `Tile` 组件已存在，可直接渲染牌面；`sortHand` 在 `src/game/sort.ts` 可用
- 无翻牌动画 CSS（无 `flip-card`/`perspective` 样式）

### 2.4 专家Tab现状

- App.tsx L17：Tab 只有 5 个（info/advisor/review/strategy/log），无专家模式 Tab
- `side-panel` 宽度 260px 可容纳 4 个评分模块（进攻/防守/牌效/红中健康）+ 校正历史列表

---

## 三、Proposed Changes（具体文件 + 修改点）

### 3.1 新增类型（types.ts）

**文件**: `src/game/types.ts` 末尾追加

```typescript
// 用户校正记录(经验积累)
export interface UserCorrection {
  id: string;              // uuid
  roundId: number;         // 局号
  seat: Seat;              // 校正者座位(固定=人类1)
  time: number;            // 时间戳
  // === 当时系统建议 ===
  systemRecommendCode: string | null; // 系统建议打的牌 code
  systemRecommendName: string | null;
  systemShanten: number;   // 系统评估向听数
  systemReason: string;
  candidatesAtTime: AdviceData['candidates']; // 当时所有候选(快照)
  // === 用户校正 ===
  userChoiceCode: string | null;   // 用户认为更优的牌 code(可=系统建议表示"同意",或候选列表中其他,或自定义留牌)
  userChoiceName: string | null;
  agree: boolean;           // true=认同系统建议,false=纠正
  userReason: string;       // 用户校正理由(必填)
  // === 上下文(可做策略库匹配用) ===
  handCodes: string[];      // 当时手牌 codes(排序)
  meldsCount: number;
  hongZhongCount: number;
  pairCount: number;
  phase: 'early' | 'mid' | 'late';
  isTenpai: boolean;
  deckRemaining: number;    // 牌墙剩余
}

// 局势评分(红中麻将专家面板用)
export interface SituationScore {
  offense: number;     // 进攻分 0-100
  defense: number;     // 防守分 0-100
  tileEfficiency: number; // 牌效分 0-100
  hongzhongHealth: number; // 红中运用健康度 0-100
  overall: number;     // 综合分
  tags: string[];      // 文字标签(如"七小对成型"/"红中留作将优"/"扣牌不足")
}

// 校正经验聚合(用于专家模式个性化趋势)
export interface CorrectionTrend {
  totalCorrections: number;
  agreeRate: number;   // 用户认同率
  topDisagreeCategories: string[]; // 最常与系统分歧的类别
  recent: UserCorrection[];
}
```

在 `GameState` 中追加字段：

```typescript
  // 校正记录引用(当前局最近一次校正,用于UI显示)
  lastCorrection?: UserCorrection | null;
```

### 3.2 校正存储 + 经验入库（新建 correctionLib.ts）

**文件**: `src/game/correctionLib.ts`（新建，复用 strategyLib.ts 的 localStorage 抽象）

导出：
- `CORRECTION_STORAGE_KEY = 'hongzhong_correction_log_v1'`
- `saveCorrection(c: Omit<UserCorrection, 'id' | 'time'>): UserCorrection` — 写入 localStorage，自动 id+time
- `loadCorrections(): UserCorrection[]` — 读取全部校正记录
- `clearCorrections(): void`
- `deleteCorrection(id: string): boolean`
- `exportCorrections(): string` — JSON 导出
- `importCorrections(json: string): { ok: number; fail: number }` — 导入
- `getCorrectionTrend(): CorrectionTrend` — 聚合统计
- `computeSituationScore(ctx: StrategyContext, corrections: UserCorrection[]): SituationScore` — 基于上下文+用户校正历史计算局势4维评分，体现用户偏好权重（如用户经常不同意系统"打红中"建议则红中健康度扣分项减轻）
- `correctionWeightedAdvice(baseAdvice: AdviceData, corrections: UserCorrection[]): AdviceData` — 基于校正历史给候选打分加权（如果某牌用户过去多次作为纠错目标出现，则提升其权重）

**文件**: `src/game/advisor.ts` L200 buildAdvice 末尾追加调用

```typescript
  // 校正加权: 如果有同模式历史校正,调整 candidates 顺序 + reason 追加用户偏好
  const corrections = loadCorrections().slice(-100); // 最近100条
  const weighted = correctionWeightedAdvice(adviceBase, corrections);
  weighted.reason += hintFromCorrections(corrections, state); // "你近3次都选择了打边张,系统已按你的偏好调整"
  return weighted;
```

### 3.3 AdvisorPanel 增加校正入口（组件改造）

**文件**: `src/components/AdvisorPanel.tsx`

新增 props 接口：
```tsx
interface Props {
  advice: AdviceData | null;
  mistake: MistakeAlert | null;
  lastCorrection?: UserCorrection | null;   // 新增
  onCorrect?: (payload: {
    userChoiceCode: string | null; agree: boolean; userReason: string;
    systemRecommendCode: string | null; systemRecommendName: string | null;
  }) => void;  // 新增回调,由 App/useGame 调用 saveCorrection
}
```

UI 改造（在"展开候选详情"下方追加校正区）：

```
  [我认同] [我来纠正]
  → 点"我认同"直接写入 agree=true 校正(无需理由,可选填备注点赞)
  → 点"我来纠正"展开:
     [从候选中选我认为更优的牌(单选radio,列candidates前6名含name/向听)]
     [为什么?(textarea必填,placeholder:请简要说明为什么选这张/不选系统建议...)]
     [提交校正]
```

校正提交成功后：
- 面板顶部显示 ✅ "已保存校正经验，将用于后续个性化建议"
- 自动把"上次校正卡片"贴在面板头部（最近1次）："上次你纠正了【打八万→改为打五条】因为……"

### 3.4 红中麻将专家 Tab（新建 ExpertPanel.tsx）

**文件**: `src/components/ExpertPanel.tsx`（新建）

侧栏 6 大模块：

1. **当前局势评分（4 维雷达条）**
   - 进攻分数值条（红）：向听越低分越高，听牌=100
   - 防守分数值条（蓝）：扣住对手需求牌的比例 + 熟张比例
   - 牌效分数值条（黄）：中张连接度评分（参考 chen3kx 连接度算法）
   - 红中运用健康度（绿）：红中是否留作将优 / 是否过早消耗
   - 综合分 = 加权平均，标签自动生成

2. **校正统计（个性化趋势）**
   - 总校正次数 / 认同率（同意系统建议的比例）
   - 常见分歧类型 TOP 3（如"经常不同意"打中张'、'倾向保守"）
   - 最近 5 次校正列表（可点击展开理由）

3. **经验库工具**
   - [导出校正经验JSON] → 剪贴板
   - [导入校正经验] → textarea
   - [清空校正经验]（带二次确认）

4. **专属策略建议（加权后）**
   - 基于 `correctionWeightedAdvice`，在专家 Tab 显示"个性化推荐" vs "标准系统推荐"对比：
     | 维度 | 系统标准 | 个性化(+你偏好) |
     |---|---|---|
     | 建议牌 | 八万 | 五条 |
     | 理由 | ... | 你的历史校正已将边张权重提升20% |

5. **标签页（校正历史搜索）**
   - 按分类 / 按时间 / 按手牌模式搜索校正历史

6. **小帮助**
   - 说明：校正经验仅存本地（localStorage），可导出跨浏览器共享，不会上传。

**文件**: `src/App.tsx` 同步修改

- L17：`type Tab = 'info' | 'advisor' | 'review' | 'strategy' | 'log' | 'expert';`
- L24：默认 tab 保持 'info'
- L126-L154 tab-bar 追加第 6 个 tab 按钮：`<button className={tab==='expert'?'tab active':'tab'} onClick={()=>setTab('expert')}>专家{correctionCount>0?'●':''}</button>`
- tab-content 内追加 `{tab==='expert' && <ExpertPanel state={state} onCorrectRequest={handleCorrectRequest} />}`
- 新导入：`import { ExpertPanel } from './components/ExpertPanel';`
- `handleCorrectRequest` 在 App 内部写：用 `advisor.ts` 已计算的 advice 快照 + 用户选择组装 `UserCorrection`，调用 `saveCorrection()`，然后写回 `state.lastCorrection`（用一个 `useState<GameState>` 覆盖或扩展 useGame，由于 useGame 返回 state 是只读，用额外 `correctionsState` useState 存校正元信息即可，不必侵入 useGame）

### 3.5 自摸横幅 + 失误提醒不遮挡（index.css + App.tsx）

**文件**: `src/index.css` `.result-banner` 段替换：

```css
/* ===== 结束横幅(牌桌中央缩小版+自动折叠) ===== */
.result-banner {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.45);  /* 缩小到原 45% 大小,居中,减少遮挡 */
  background: rgba(0,0,0,0.78);
  color: var(--gold);
  font-size: 20px;
  font-weight: 700;
  padding: 14px 26px;
  border: 2px solid var(--gold);
  border-radius: 10px;
  z-index: 95;                           /* 从 100 降到 95,失误toast=90保持在下层 */
  text-align: center;
  animation: popShrink 0.25s ease;
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  max-width: 360px;
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(.2,.9,.3,1.2);
}
.result-banner.collapsed {
  transform: translate(calc(50vw - 88px), calc(50vh - 88px)) scale(0.25);
  opacity: 0.4;
  pointer-events: none;
}
.result-banner.show-again {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
  pointer-events: auto;
}
@keyframes popShrink {
  from { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  to   { transform: translate(-50%, -50%) scale(0.45); opacity: 1; }
}
.result-banner .result-sub { font-size: 11px; opacity: 0.85; margin-top: 4px; }
.result-banner .result-expand-hint { font-size: 10px; opacity: 0.6; margin-top: 2px; }
/* 折叠后的右下角徽标(替代折叠态banner) */
.result-badge {
  position: fixed;
  bottom: 300px; right: 24px;          /* 完全在手牌上方(手牌在300px以下),与side-panel平行 */
  background: linear-gradient(135deg, var(--gold), #b59318);
  color: #2a1810;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  z-index: 96;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(212,175,55,0.5);
  animation: slideIn 0.3s ease;
}
.result-badge:hover { filter: brightness(1.08); }
```

失误 toast 位置修改（`mistake-toast`）：
```css
.mistake-toast {
  position: fixed;
  bottom: 300px; right: 24px; /* 从 bottom:20px 移到 300px,手牌在底部300px完全不遮挡 */
  background: rgba(201,48,44,0.92);
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 3px 14px rgba(0,0,0,0.4);
  z-index: 90;
  cursor: pointer;
  max-width: 260px;
  animation: slideIn 0.25s ease;
  opacity: 1;
  transition: opacity 0.3s ease;
}
.mistake-toast.fade-out { opacity: 0; pointer-events: none; }
```

**文件**: `src/App.tsx` 结束横幅和失误浮层改造：

```tsx
  // 新 useState 控制结束横幅折叠
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [showResultBadge, setShowResultBadge] = useState(false);
  const [mistakeVisible, setMistakeVisible] = useState(true);

  // 游戏结束时自动6秒后折叠, 失误浮层4秒后淡出
  useEffect(() => {
    if (gameOver) {
      setResultCollapsed(false);
      setShowResultBadge(false);
      const t = window.setTimeout(() => {
        setResultCollapsed(true);
        setShowResultBadge(true);
      }, 6000);
      return () => window.clearTimeout(t);
    }
  }, [gameOver, state.round]);

  useEffect(() => {
    if (state.lastMistake) {
      setMistakeVisible(true);
      const t = window.setTimeout(() => setMistakeVisible(false), 4000);
      return () => window.clearTimeout(t);
    }
  }, [state.lastMistake]);

  return (
    {/* 失误浮层 */}
    {state.lastMistake && mistakeVisible && (
      <div className="mistake-toast" onClick={() => { setTab('advisor'); setMistakeVisible(false); }}>
        ...原内容...
      </div>
    )}

    {/* 结束横幅(含折叠/展开) */}
    {gameOver && !resultCollapsed && (
      <div className="result-banner" onClick={() => setResultCollapsed(true)}>
        {state.isDraw ? '流局' : `${SEAT_NAME[state.winner!]} 自摸胡牌!`}
        <div className="result-sub">点击侧栏"复盘"查看完整分析 · 点击横幅快速折叠</div>
        <div className="result-expand-hint">6秒后自动折叠</div>
      </div>
    )}
    {/* 折叠后徽标(点击恢复) */}
    {gameOver && showResultBadge && resultCollapsed && (
      <div className="result-badge" onClick={() => { setResultCollapsed(false); setShowResultBadge(false); }}>
        {state.isDraw ? '📋 流局' : '🏆 ' + SEAT_NAME[state.winner!] + '胡 · 点击恢复'}
      </div>
    )}
  );
```

### 3.6 局终自动翻牌（牌背→牌面）

**文件**: `src/components/PlayerSeat.tsx`

```tsx
import { sortHand } from '../game/sort';   // 新增 import
import { Tile } from './Tile';             // 新增 import

export function PlayerSeat({ player, state, position, showLabel }: Props) {
  const isTurn = state.currentSeat === player.seat && state.phase !== 'gameover';
  const handCount = player.hand.length;
  const meldCount = player.melds.reduce((s, m) => s + m.tiles.length, 0);
  const horizontal = position === 'top';

  // 局终:显示实际牌面 + 翻牌动画; 其他阶段: 牌背
  const isGameOver = state.phase === 'gameover';
  // 结束时对手暗手也按 万→筒→条→字 排序(和人类一致,便于阅读)
  const sortedHand = isGameOver ? sortHand(player.hand) : player.hand;

  return (
    <div className={`player-seat seat-${position} ${isTurn ? 'seat-active' : ''}`}>
      <div className="seat-header">
        <span className="seat-name">{SEAT_NAME[player.seat]} · {player.name}</span>
        {player.isDealer && <span className="dealer-mark">庄</span>}
        {isTurn && <span className="turn-indicator">思考中…</span>}
        {isGameOver && state.winner === player.seat && <span className="winner-tag">胡</span>}
        {isGameOver && state.isDraw && <span className="draw-tag">流</span>}
      </div>
      <div className="seat-hand">
        {isGameOver ? (
          sortedHand.map((t, i) => (
            <div key={`gameover-${player.seat}-${i}`} className="flip-card" style={{animationDelay: `${i * 50}ms`}}>
              <div className="flip-card-inner">
                <div className="flip-card-front">
                  <TileBack size={position === 'top' ? 22 : 26} />
                </div>
                <div className="flip-card-back">
                  <Tile tile={t} size={position === 'top' ? 22 : 26} showLabel={showLabel} />
                </div>
              </div>
            </div>
          ))
        ) : (
          Array.from({ length: handCount }).map((_, i) => (
            <TileBack key={i} size={position === 'top' ? 22 : 26} />
          ))
        )}
      </div>
      {/* 副露+弃牌(结束时也展示弃牌明细) */}
      <MeldArea melds={player.melds} size={24} showLabel={showLabel} />
      {isGameOver && player.discards.length > 0 && (
        <div className="seat-discards-end">
          弃:{player.discards.map((d) => tileName(d)).join(' ') || '无'}
        </div>
      )}
      {!isGameOver && <div className="seat-stats">手牌{handCount} · 副露{meldCount}张</div>}
    </div>
  );
}
```

**文件**: `src/index.css` 追加翻牌动画 CSS（放在 Tile 样式附近，L460 附近）：

```css
/* ===== 局终翻牌动画 ===== */
.flip-card {
  perspective: 500px;
  width: fit-content;
  height: fit-content;
  display: inline-flex;
  margin-right: -6px; /* 紧密排列(和 HandRow 一致) */
}
.flip-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.45s cubic-bezier(.2,.9,.3,1.1);
  transform-style: preserve-3d;
  animation: flipAnim 0.5s ease forwards;
  animation-delay: var(--delay, 0ms);
}
.flip-card { animation: flipCardTrigger 0.01ms 0.01ms forwards; }
.flip-card .flip-card-inner { animation-name: flipAnim; animation-delay: inherit; }
@keyframes flipCardTrigger { to { --_f: 1; } }
@keyframes flipAnim {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(180deg); }
}
.flip-card-front, .flip-card-back {
  position: relative;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  width: 100%;
  height: 100%;
}
.flip-card-back {
  transform: rotateY(180deg);
  position: absolute;
  top: 0; left: 0;
}
/* end-game winner/draw tags */
.player-seat .winner-tag {
  display: inline-block;
  background: linear-gradient(135deg, #ff6b6b, #c9302c);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
}
.player-seat .draw-tag {
  display: inline-block;
  background: rgba(212,175,55,0.4);
  color: var(--gold);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
}
.seat-discards-end {
  font-size: 10px;
  color: var(--text-dim);
  margin-top: 2px;
  line-height: 1.3;
  max-width: 160px;
  overflow-wrap: break-word;
}
```

### 3.7 useGame 扩展校正元信息

**文件**: `src/hooks/useGame.ts` 无需侵入校正存储（`saveCorrection` 由 App 调 correctionLib.ts），但为了"校正后自动重新生成加权建议"需要触发一次重建 advice：
- 当前 lastAdvice 由 App 里 `useMemo(() => state.phase==='discard' && ... buildAdvice(state, 1), [state])` 生成（推测）。需要在 App.tsx 中 `handleCorrect` 提交后立刻 `forceRebuildAdvice`，最简单做法是把 App 里的 advice 计算挂到一个 `correctionTick` useState 上，`setCorrectionTick(t => t + 1)` 让 useMemo 依赖中加它重新计算。
- 但如果 buildAdvice 已在 useGame 内部（我查看 useGame 里没调 buildAdvice），所以在 App 侧加 correctionTick useState 即可。

**文件**: `src/App.tsx` 校正处理：

```tsx
  const [correctionsTick, setCorrectionsTick] = useState(0);

  const handleCorrect = useCallback((payload: {...}) => {
    const advice = state.lastAdvice;
    if (!advice) return;
    const ctx: StrategyContext = buildStrategyContextFromState(state, HUMAN_SEAT);
    const saved = saveCorrection({
      roundId: state.round,
      seat: HUMAN_SEAT,
      systemRecommendCode: advice.recommendDiscard?.code ?? null,
      systemRecommendName: advice.recommendDiscard?.name ?? null,
      systemShanten: advice.shanten,
      systemReason: advice.reason,
      candidatesAtTime: advice.candidates,
      userChoiceCode: payload.userChoiceCode,
      userChoiceName: payload.userChoiceName || null,
      agree: payload.agree,
      userReason: payload.userReason,
      handCodes: state.players[HUMAN_SEAT].hand.map(tileCode).sort(),
      meldsCount: state.players[HUMAN_SEAT].melds.length,
      hongZhongCount: ctx.hongZhongCount,
      pairCount: ctx.pairCount,
      phase: ctx.phase,
      isTenpai: ctx.isTenpai,
      deckRemaining: state.deck.length,
    });
    setCorrectionsTick(t => t + 1); // 触发重新计算advice
  }, [state]);
```

---

## 四、Assumptions & Decisions

1. **交付形态**：采用项目内新增"专家"独立 Tab（用户已选定），不是做 TRAE 全局 Skill（避免跨项目通信复杂性）
2. **校正存储**：全部写 localStorage，键 `hongzhong_correction_log_v1`，支持导出/导入 JSON，**不上传任何服务器**
3. **横幅不遮挡方案**：用户已选"牌桌中心缩小版(45%大小)+ 6秒自动折叠 → 右下徽标(可点开恢复)"。失误 toast 移到 bottom:300px（完全离开手牌区）
4. **翻牌触发条件**：仅 `phase==='gameover'`（不是 humanPassSelf 或 听牌时）自动触发；人类玩家手牌区已一直显示牌面，不需要翻，只翻 3 家 AI
5. **翻牌顺序**：按玩家座位交错（北→西→东，每张 50ms 错峰触发，视觉更自然流畅）
6. **校正 vs 策略库分层**：
   - StrategyLib = 用户/内置的"静态通用策略"（conditions 匹配）
   - CorrectionLog = 用户的"具体局面具体纠正反馈"（带完整手牌快照）
   - 综合加权：Advice = 标准牌效评分 70% + StrategyLib 匹配提示 20% + 同模式 CorrectionLog 加权 10%

---

## 五、Verification Steps（实现完成后按序验证）

### 5.1 校正机制
- [ ] 进入 discard 阶段，在"辅助"Tab 下方看到"我认同 / 我来纠正"按钮
- [ ] 点击"我认同" → 立刻看到确认 Toast，专家 Tab 校正统计+1，认同率 > 0
- [ ] 点击"我来纠正" → 从候选列表选另一个牌 → 填理由 "因为这张是孤张" → 提交 → 看到"已保存校正经验"
- [ ] 专家 Tab 最近 5 次校正能看到这条记录，点展开能看到手牌快照 + 系统建议 + 用户选择 + 理由
- [ ] 清空 localStorage 后所有校正清零，不影响游戏

### 5.2 专家 Tab
- [ ] 专家 Tab 能正常显示"当前局势评分"4 个色条 + 综合分 + 标签
- [ ] 认同率 / 常见分歧 TOP 3 在 10+ 次校正后能显示有意义内容
- [ ] [导出校正经验] → 剪贴板里是合法 JSON 数组
- [ ] 清空全部校正后重新导入 → 数据完全恢复

### 5.3 自摸横幅 + 失误浮层不遮挡
- [ ] 自摸胡牌后：结束横幅在屏幕正中但只有"巴掌大小"(不超过中心牌桌 40%)，不遮挡任何座位手牌顶部和底部
- [ ] 6 秒后：横幅自动折叠，右下角 300px 位置出现金色徽标
- [ ] 点击徽标：恢复完整横幅
- [ ] 触发一次失误（故意打错牌）：失误浮层出现在 bottom:300px 附近，在底部手牌之上，完全不遮挡手牌点击区
- [ ] 4 秒后：失误浮层淡出；点击它立刻跳到辅助 Tab

### 5.4 局终自动翻牌
- [ ] 自摸胡牌或流局后：北/西/东 3 家座位手牌从牌背"翻"为实际牌面，每张有 50ms 错峰 delay 自然翻转动画
- [ ] 翻完后能看清 3 家完整暗手牌，排序是万→筒→条→字（和人类一致）
- [ ] 结束状态下胡牌者座位有红色"胡"标签，流局状态下每家有黄色"流"标签
- [ ] 结束状态下 3 家 AI 弃牌明细在座位下显示"弃: 一万 五万..."
- [ ] 点"开始新一局"→ PlayerSeat 恢复为正常牌背（不再是牌面），动画不残留

### 5.5 编译 + 回归
- [ ] `npx tsc --noEmit` 通过（0 errors）
- [ ] `npx vitest run` 所有 37+ win 测试依然通过
- [ ] 浏览器 2 局正常游戏无崩溃，能正常摸/打/碰/杠/自摸胡/流局
- [ ] 2 条+6条 麻将牌图片正常显示（上一轮修复过）
