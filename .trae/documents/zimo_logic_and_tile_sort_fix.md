# 修复方案：理牌排序 + 重写自摸判定逻辑与流程

## 一、用户需求与已确认规则

### Bug 1: 自动理牌顺序
- **现象**：手牌未按"万→筒→条→字"顺序排列，相同牌型未紧密合并
- **期望**：从左到右依次为 万、筒、条、字升序排列；相同牌型紧密挨在一起
  - 例：1万、3万、3万、5万、9万、2筒、3筒、3筒、3筒、8筒、2条、9条、东、南
- **额外要求**：每张牌紧密排列（去除牌组间隔），类似磁铁吸附的效果

### Bug 2: 自摸逻辑
- **现象**：试玩时存在"该胡没胡(漏判)"和"不该胡却胡了(误判)"两种故障
- **已确认的自摸规则**（用户答复）：
  1. **手动点胡按钮**：摸到能胡的牌后高亮提示，需玩家手动点击"自摸"按钮才胡（不强制胡）
  2. **首巡允许胡**：闲家首巡摸到能胡的牌可正常自摸（无地胡保护）
  3. **AI立即自动胡**：AI摸到能胡的牌立即胡（不需手动点）
  4. **可多次放弃后胡**：玩家选择不胡后，本局后续仍可胡
  5. **听牌提示**：13张已听牌时高亮提示，显示**具体可胡的牌**（如"3万、6筒"），非牌型分类

### 美术素材迁移
- 新目录：`D:\美术素材\麻将3`（34张规范中文名命名）
- 旧目录：`public/tiles/`（混乱命名如"图片拆解.png"）

## 二、当前实现分析

### 理牌相关文件
- [sort.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/sort.ts) `sortWeight` 函数：m(0-8) < p(100-108) < s(200-208) < z(300-306)，**顺序正确**
- [HandRow.tsx](file:///d:/TRAE/红中麻将助手/redcenter/src/components/HandRow.tsx#L39) `needGap` 逻辑：不同代码牌之间加 `marginLeft:8` 间隔，**违反"紧密排列"要求**
- [deal.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/deal.ts#L28) `dealOnce` 已调用 `sortHand`
- [gameEngine.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts#L129) `discardTile` 已 `player.hand = sortHand(player.hand)`

### canWin 算法问题诊断
[win.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/win.ts) `canMelds` 函数存在**贪心策略缺陷**：

**选项B顺子分支**（[win.ts:104-114](file:///d:/TRAE/红中麻将助手/redcenter/src/game/win.ts#L104)）采用贪心：
```typescript
for (let pos = start; pos <= sEnd; pos++) {
  if (counts[pos] > 0) {
    consume.push(pos); // 取实牌 ← 贪心：必用实牌
  } else {
    wildCost++;
    consume.push(-1); // 用红中
  }
}
```
- **问题**：当某位置已有实牌时强制用实牌，不允许用红中代替保留实牌
- **后果**：在有红中时可能漏判（实牌被消耗后无法组成其他面子）

**选项A刻子分支**（[win.ts:68-87](file:///d:/TRAE/红中麻将助手/redcenter/src/game/win.ts#L68)）策略冗余：
- "先全用红中组成刻子"（消耗3红中）会过度消耗百搭牌，虽因递归穷举不会漏判，但效率低且语义不清

### 自摸流程问题
[gameEngine.ts:99](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts#L99) `drawTile` 中摸到能胡的牌**强制胡**：
```typescript
if (canWin(s.players[seat].hand, s.players[seat].melds.length)) {
  s.phase = 'gameover';
  s.winner = seat;
  ...
  return s;
}
```
- **问题**：违反用户要求"手动点胡按钮"，玩家无选择权

## 三、详细修改计划

### 阶段1：美术素材迁移（最先做）

#### 1.1 复制新素材到 public/tiles/
将 `D:\美术素材\麻将3\*.png`（34个文件）复制到 `d:\TRAE\红中麻将助手\redcenter\public\tiles\`

#### 1.2 清理旧文件
删除 `public/tiles/` 中的旧混乱命名文件：
- `图片拆解.png`, `图片拆解 (1).png` ~ `图片拆解 (24).png`
- `tile_647ac00fb9ac4a518043e0328931fe9f.jpeg~tp.png`
- 保留新复制的中文名文件

#### 1.3 重写 TILE_FILE_MAP
[src/game/tileAssets.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/tileAssets.ts) 重写映射表：
```typescript
export const TILE_FILE_MAP: Record<TileCode, string> = {
  // 万子 m1-m9
  m1: '一万.png', m2: '二万.png', m3: '三万.png', m4: '四万.png',
  m5: '五万.png', m6: '六万.png', m7: '七万.png', m8: '八万.png', m9: '九万.png',
  // 筒子 p1-p9
  p1: '一筒.png', p2: '二筒.png', p3: '三筒.png', p4: '四筒.png',
  p5: '五筒.png', p6: '六筒.png', p7: '七筒.png', p8: '八筒.png', p9: '九筒.png',
  // 条子 s1-s9
  s1: '一条.png', s2: '二条.png', s3: '三条.png', s4: '四条.png',
  s5: '五条.png', s6: '六条.png', s7: '七条.png', s8: '八条.png', s9: '九条.png',
  // 字牌 z1-z7
  z1: '东.png', z2: '南.png', z3: '西风.png', z4: '北.png',
  z5: '中.png', z6: '发.png', z7: '白板.png',
};
```

### 阶段2：修复理牌视觉

#### 2.1 修改 HandRow 移除牌组间隔
[src/components/HandRow.tsx](file:///d:/TRAE/红中麻将助手/redcenter/src/components/HandRow.tsx#L38-L41)：
- 删除 `needGap` 计算逻辑
- 移除 `style={needGap ? { marginLeft: 8 } : undefined}`
- 所有牌紧密排列（依靠 sortHand 已排序，自然形成牌组）

### 阶段3：重写 canWin 算法（核心）

#### 3.1 重写 canMelds 为完全穷举
[src/game/win.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/win.ts) `canMelds` 函数重写：

**核心策略**：对于最低非空索引 c（必须被消耗），枚举所有可能的分配方式：
1. **作为刻子的一部分**：用 t 张实牌c + (3-t) 张红中，t ∈ {1,2,3}
2. **作为顺子的一部分**：c 可作为顺子(start, start+1, start+2)的第 0/1/2 个位置
   - 对每个位置，枚举该位置用实牌或红中
   - c 位置必用实牌（保证c被消耗），其他位置自由选择

```typescript
function canMelds(counts: number[], wild: number, k: number): boolean {
  if (k === 0) {
    for (let i = 0; i < N; i++) if (counts[i] !== 0) return false;
    return true;
  }
  // 找最低非空索引
  let c = -1;
  for (let i = 0; i < N; i++) if (counts[i] > 0) { c = i; break; }
  if (c === -1) return wild === 3 * k;

  // 选项A: 把c作为刻子的一部分 (用 t 张实牌 + (3-t) 红中)
  for (let t = Math.min(counts[c], 3); t >= 1; t--) {
    const wildCost = 3 - t;
    if (wild >= wildCost) {
      counts[c] -= t;
      if (canMelds(counts, wild - wildCost, k - 1)) {
        counts[c] += t;
        return true;
      }
      counts[c] += t;
    }
  }
  // 选项B: 把c作为顺子的一部分 (c 非字牌)
  if (c < 27) {
    const blockStart = Math.floor(c / 9) * 9;
    const blockEnd = blockStart + 9;
    // 枚举顺子起点 start, 要求 start..start+2 同花色且包含c
    for (let start = Math.max(blockStart, c - 2); start <= c && start + 2 < blockEnd; start++) {
      const positions = [start, start + 1, start + 2];
      // c 必须在 positions 中且必用实牌
      const cIdx = positions.indexOf(c);
      if (cIdx < 0) continue;
      // 枚举其他2个位置: 用实牌(1) 或 红中(0), 2^2=4种
      for (let mask = 0; mask < 4; mask++) {
        let wildCost = 0;
        let feasible = true;
        const consume: number[] = [];
        for (let j = 0; j < 3; j++) {
          if (j === cIdx) {
            consume.push(c); // 必用实牌
          } else if ((mask >> (j > cIdx ? j - 1 : j)) & 1) {
            if (counts[positions[j]] < 1) { feasible = false; break; }
            consume.push(positions[j]);
          } else {
            wildCost++;
            consume.push(-1);
          }
        }
        if (!feasible || wild < wildCost) continue;
        for (const pos of consume) if (pos >= 0) counts[pos]--;
        if (canMelds(counts, wild - wildCost, k - 1)) {
          for (const pos of consume) if (pos >= 0) counts[pos]++;
          return true;
        }
        for (const pos of consume) if (pos >= 0) counts[pos]++;
      }
    }
  }
  return false;
}
```

#### 3.2 canWin 主函数
保留现有枚举将逻辑（已正确）：
1. 2张实牌作将
2. 1张实牌+1张红中作将
3. 2张红中作将

### 阶段4：改造自摸流程

#### 4.1 修改 drawTile 逻辑
[src/game/gameEngine.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts) `drawTile` 函数：
```typescript
// 自摸胡判定
if (canWin(s.players[seat].hand, s.players[seat].melds.length)) {
  if (s.players[seat].isHuman) {
    // 人类: 不强制胡, 加入"自摸胡"选项到 selfActions
    s.selfActions = [{
      type: 'hu',
      seat: seat,
    }];
    s.currentSeat = seat;
    s.pendingOptions = [];
    s.phase = 'discard'; // 等待玩家选择胡或不胡
    // 不生成建议(避免误导)
    return s;
  } else {
    // AI: 立即自动胡
    s.phase = 'gameover';
    s.winner = seat;
    s.drawnTileId = null;
    addLog(s.log, seat, '自摸胡牌', s.players[seat].hand.map((t) => tileName(t)).join(' '));
    s.review = buildReview(s);
    return s;
  }
}
```

#### 4.2 同样改造 gangRinshan 岭上开花
[src/game/gameEngine.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts) `gangRinshan` 中相同逻辑：人类给"自摸胡"选项，AI立即胡。

#### 4.3 修改 applySelfAction 处理 hu 类型
```typescript
export function applySelfAction(state: GameState, option: ActionOption): GameState {
  const s = clone(state);
  if (option.type === 'hu') {
    // 玩家手动点击"自摸"按钮
    const player = s.players[option.seat];
    s.phase = 'gameover';
    s.winner = option.seat;
    s.drawnTileId = null;
    addLog(s.log, option.seat, '自摸胡牌', player.hand.map((t) => tileName(t)).join(' '));
    s.review = buildReview(s);
    return s;
  }
  // ... 原有 angang/bugang 逻辑
}
```

#### 4.4 修改 ActionPanel 支持放弃自摸胡
[src/components/ActionPanel.tsx](file:///d:/TRAE/红中麻将助手/redcenter/src/components/ActionPanel.tsx)：
- mode="self" 时若包含 `hu` 类型选项，也显示"放弃"按钮
- 修改 `App.tsx` 中 `onPass` 回调，让玩家放弃胡牌后继续打牌

#### 4.5 新增 humanPassSelfAction 函数
[src/hooks/useGame.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/hooks/useGame.ts) 新增：
```typescript
const humanPassSelfAction = useCallback(() => {
  setState((prev) => {
    const s = structuredClone(prev);
    // 移除 hu 选项, 保留暗杠/补杠选项
    s.selfActions = s.selfActions.filter((o) => o.type !== 'hu');
    return s;
  });
}, []);
```

#### 4.6 AI 处理 hu 选项
[src/game/gameEngine.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts) `aiPlayTurn`：
- AI 摸到牌后若 selfActions 包含 hu，立即调用 applySelfAction 触发胡牌（drawTile 中已自动处理，aiPlayTurn 无需额外处理）

### 阶段5：听牌提示

#### 5.1 利用现有 checkTing 函数
[win.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/win.ts) 已有 `checkTing` 函数返回可胡牌型代码列表，无需修改。

#### 5.2 在 discardTile 出牌后检查听牌
[src/game/gameEngine.ts](file:///d:/TRAE/红中麻将助手/redcenter/src/game/gameEngine.ts) `discardTile` 末尾（仅人类）：
```typescript
if (seat === HUMAN_SEAT) {
  const tingTiles = checkTing(player.hand, player.melds.length);
  if (tingTiles.length > 0) {
    s.lastAdvice = s.lastAdvice ? { ...s.lastAdvice, tingTiles } : null;
    // 或新增独立字段
  }
}
```
（具体实现时根据现有 AdviceData 结构调整，复用 tingTiles 字段）

#### 5.3 UI 显示听牌提示
[App.tsx](file:///d:/TRAE/红中麻将助手/redcenter/src/App.tsx) 或 [AdvisorPanel.tsx](file:///d:/TRAE/红中麻将助手/redcenter/src/components/AdvisorPanel.tsx)：
- 当 `state.lastAdvice?.tingTiles.length > 0` 时显示"听牌中: 3万、6筒"

### 阶段6：单元测试

#### 6.1 新建测试文件
`src/game/__tests__/win.test.ts`，覆盖以下场景：

**基础胡牌测试**：
- 标准 4面子+1将（无红中）
- 包含刻子+顺子混合
- 字牌刻子

**红中百搭测试**：
- 红中作将（1实+1红中, 2红中）
- 红中作顺子（缺1张/2张/3张）
- 红中作刻子（缺1/2张）
- 多张红中混合场景（2-4张红中）
- 红中可以代替字牌顺子，也可以代替刻子，红中作为万能牌，什么牌都可以替代，想替代哪个牌就替代哪个牌


**副露场景测试**：
- 1碰后11张暗手
- 1杠后11张暗手
- 2副露后8张暗手

**边界测试**：
- 起手天胡（应判胡，但游戏流程会重发）
- 凑齐14张但无法胡
- 全红中手牌（不可能，但测试算法健壮性）

**漏判/误判回归测试**（针对用户反馈）：
- 构造贪心策略可能漏判的牌例
- 构造红中可能误判的牌例

#### 6.2 运行测试
执行 `npm test` 或 `npx vitest run` 确保所有测试通过。

## 四、实施顺序

1. **阶段1**：美术素材迁移（独立可做）
2. **阶段3**：重写 canWin 算法（核心，最先验证）
3. **阶段6**：单元测试（验证阶段3）
4. **阶段4**：自摸流程改造（依赖阶段3）
5. **阶段2**：理牌视觉修复
6. **阶段5**：听牌提示（增强功能）

## 五、验证步骤

1. **算法验证**：运行单元测试，所有 canWin 测试通过
2. **美术验证**：开启"牌型校验"开关，逐张核对图片与名称
3. **理牌验证**：
   - 起手牌按 万→筒→条→字 排列
   - 相同牌紧密排列无间隔
   - 字牌顺序：东南西北中发白
4. **自摸流程验证**：
   - 摸到能胡的牌后显示"胡"按钮（人类）
   - 点击"胡"按钮 → 胡牌结算
   - 点击"放弃" → 继续打牌，下巡仍可胡
   - AI摸到能胡的牌立即自动胡
5. **听牌提示验证**：13张已听牌时显示具体可胡牌

## 六、假设与决策

### 假设
1. 红中(z5)按字牌固定顺序"东南西北中发白"中的"中"位置排列（不单独抽出至末尾）
2. 玩家放弃自摸胡后，本巡仍可正常出牌，下巡摸到能胡的牌仍可再次胡
3. AI摸到能胡的牌100%立即胡（不模拟"放弃胡牌"的人类失误）
4. 听牌提示在每次出牌后（13张状态）刷新

### 关键决策
1. **重写而非修补**：canMelds 完全重写为穷举，而非修复贪心分支，确保100%正确性
2. **复用 ActionPanel**：自摸胡按钮复用现有 ActionPanel（mode="self"），不新增组件
3. **复用 AdviceData.tingTiles**：听牌信息复用现有数据结构，不新增字段
