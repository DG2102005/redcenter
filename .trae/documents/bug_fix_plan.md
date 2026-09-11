# 红中麻将训练工具 Bug 修复计划

## 问题概述

用户报告了三个严重的 bug：
1. **自动理牌功能**：出牌后手牌没有按正确顺序排列
2. **摸牌处理流程**：摸牌后新牌位置和排序时机问题
3. **自摸逻辑**：已经自摸了还提示打牌

## 根因分析

### Bug 1: 自动理牌不生效

**文件**: `src/game/gameEngine.ts` 第129行

**问题**: `discardTile` 函数中调用了 `sortHand(player.hand)`，但 `sortHand` 函数返回新数组，返回值没有被赋值回 `player.hand`，导致出牌后手牌排序完全不生效。

```typescript
// 当前代码（错误）
sortHand(player.hand);  // 返回值被忽略

// 修复后（正确）
player.hand = sortHand(player.hand);  // 将排序结果赋值回手牌
```

### Bug 2: 摸牌处理流程

**文件**: `src/game/gameEngine.ts` 第90-92行

**分析**: 摸牌时新牌追加到手牌末尾的逻辑是正确的：
```typescript
const tile = s.deck.shift()!;
s.players[seat].hand.push(tile);  // 新牌追加到末尾
```

出牌后调用 `sortHand` 的逻辑在 Bug 1 修复后将正常工作。

**结论**: 修复 Bug 1 后，摸牌处理流程将自动正常工作：
- 摸牌后，新牌在手牌最右侧（不排序）
- 玩家出牌后，剩余手牌自动按 万→筒→条→字 顺序整理

### Bug 3: 自摸后仍提示打牌

**文件**: `src/game/gameEngine.ts` 第99-106行

**分析**: `drawTile` 函数中的自摸判定逻辑看起来正确：
```typescript
if (canWin(s.players[seat].hand, s.players[seat].melds.length)) {
  s.phase = 'gameover';
  s.winner = seat;
  // ...
  return s;
}
```

但可能存在以下问题：

1. **`canWin` 函数边界情况未覆盖**: 
   - 当手牌中有多个红中时，某些胡牌牌型可能未被正确识别
   - 需要检查 `win.ts` 中 `canMelds` 函数的红中分配逻辑

2. **需要在 `canWin` 之前打印调试信息**:
   - 确认自摸时的手牌状态
   - 验证胡牌判定条件是否满足

**修复方案**:
1. 首先添加调试日志，观察自摸时的手牌和判定结果
2. 如果确认是 `canWin` 的逻辑问题，修复胡牌判定算法
3. 确保游戏状态正确转换为 `gameover`

## 修复步骤

### Step 1: 修复自动理牌（Bug 1）

**文件**: `src/game/gameEngine.ts`

修改 `discardTile` 函数第129行：
```typescript
// 修改前
sortHand(player.hand);

// 修改后
player.hand = sortHand(player.hand);
```

### Step 2: 添加自摸判定调试日志（Bug 3 辅助）

**文件**: `src/game/gameEngine.ts`

在 `drawTile` 函数的自摸判定部分添加调试日志：
```typescript
// 自摸胡判定
const isWin = canWin(s.players[seat].hand, s.players[seat].melds.length);
addLog(s.log, 'system', `自摸判定:${isWin ? '是' : '否'}`, 
  `手牌:${s.players[seat].hand.map(tileName).join(',')} 副露:${s.players[seat].melds.length}组`);

if (isWin) {
  // ...
}
```

### Step 3: 审查并优化 `canWin` 函数（Bug 3）

**文件**: `src/game/win.ts`

检查项：
1. `canWin` 函数的手牌长度检查是否正确
2. 红中作为将的三种情况是否完整覆盖
3. `canMelds` 函数中红中分配逻辑是否正确
4. 递归回溯时 `counts` 数组是否正确恢复

可能的优化：
- 如果发现边界情况，添加单元测试
- 确保所有胡牌牌型都能被正确识别

### Step 4: 验证修复

1. 启动开发服务器
2. 测试自动理牌：出牌后手牌是否按正确顺序排列
3. 测试自摸胡牌：自摸后游戏是否正确结束
4. 检查调试日志输出

## 风险评估

1. **修改范围小**: 主要修改 2 个文件，风险较低
2. **核心算法复杂**: 胡牌判定算法涉及递归和红中分配，需要仔细测试
3. **依赖关系**: 修复 Bug 1 后，UI 组件的手牌显示将自动受益

## 后续优化

1. 为 `canWin` 函数添加单元测试
2. 考虑添加更多调试选项
3. 性能优化：减少不必要的数组克隆
