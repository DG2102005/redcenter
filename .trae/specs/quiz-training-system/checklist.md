# 红中麻将题库训练系统 - 验证清单

## 1. 核心基础设施
- [ ] Checkpoint 1: `src/game/quizTypes.ts` 定义 QuizQuestion/Difficulty/Category/QuizProgress/SimulatorState
- [ ] Checkpoint 2: `src/quiz/storage.ts` 提供 progress/custom/simulator/settings 的存取,try/catch 安全,刷新不丢
- [ ] Checkpoint 3: `advisor.ts` 导出 `buildMinimalState(handCodes,meldCount,discards)` 和 `analysisFromHandCodes(...)`
- [ ] Checkpoint 4: tsc --noEmit 零错误
- [ ] Checkpoint 5: vitest run 全部通过(至少原 37 个)

## 2. 内置 100 题(经典题型)
- [ ] Checkpoint 6: BUILTIN_QUESTIONS.length === 100
- [ ] Checkpoint 7: 每题合法: handCodes.length===14, optionCodes===4, answerIndex∈0-3, 同code≤4,红中≤4
- [ ] Checkpoint 8: 答案指向的选项牌确实在 handCodes 中存在
- [ ] Checkpoint 9: 难度分布: easy≥40, medium≥40, hard≥20
- [ ] Checkpoint 10: 类别分布: 搭子取舍≥30 / 听牌选择≥20 / 红中运用≥15 / 对子处理≥15 / 金张判断≥10 / 综合复杂≥10
- [ ] Checkpoint 11: `verifyBuiltinQuestions()` 全部通过(无 console.warn)

## 3. 模式切换入口
- [ ] Checkpoint 12: App 顶部 header 有 对弈/题库/推演 三个切换按钮
- [ ] Checkpoint 13: 三个模式独立渲染,不互相干扰(切回对弈仍可正常开局/出牌/结束)
- [ ] Checkpoint 14: 题库训练模式下不再显示牌桌与侧栏

## 4. 题库主页 + 作答流程
- [ ] Checkpoint 15: QuizHome 显示 6 大模式卡片(顺序/分类/难度/随机/错题/收藏)
- [ ] Checkpoint 16: 每卡片显示题目总数、已答、正确率、开始按钮
- [ ] Checkpoint 17: QuizPlay 顶部第 N/M 关、手牌 14 张两行、问题文字、A/B/C/D 四选项
- [ ] Checkpoint 18: 答正确 → 绿色✓弹窗 → 关闭后选项高亮绿✓、显示解析
- [ ] Checkpoint 19: 答错误 → 红色✗弹窗+正确答案X → 关闭后红✗、正确选项绿✓、显示解析
- [ ] Checkpoint 20: 底部工具栏: 进度、开音、分析、上局、选关、下局 功能齐全
- [ ] Checkpoint 21: "分析"按钮 点击弹出 SmartAnalysisPanel ≥3 个场景卡片
- [ ] Checkpoint 22: 快捷键 1/2/3/4 选 A/B/C/D, Enter 下题,← → 上下题, Esc 关闭弹窗
- [ ] Checkpoint 23: ⭐ 收藏按钮可用,刷新后收藏夹仍存在
- [ ] Checkpoint 24: 刷新(F5)后练习进度、错题、正确率仍保持

## 5. 自定义题型模块
- [ ] Checkpoint 25: CustomList 自定义题库列表页,显示创建时间、类别、难度
- [ ] Checkpoint 26: ➕ 新建题目表单页,9 个字段齐全
- [ ] Checkpoint 27: 手牌构造器(34×4 牌池 + 14 张手牌展示)可正常点击选牌和归还
- [ ] Checkpoint 28: 自动生成选项 / 自动判定答案 / 自动生成解析 3 个按钮可用并正确填入
- [ ] Checkpoint 29: 保存前验证非法手牌、未选答案等会给出错误列表并阻止保存
- [ ] Checkpoint 30: 预览按钮进入作答页可真实模拟并显示解析
- [ ] Checkpoint 31: 新建题目保存后刷新仍可见;编辑修改后刷新仍保留;删除后不再出现

## 6. 选牌推演(智能模拟器)
- [ ] Checkpoint 32: Simulator 牌池 4 行,34 种牌齐全,每张牌显示剩余张数(初始4)
- [ ] Checkpoint 33: 点击牌池牌→手牌追加,牌池张数-1;手牌达到 14 张后牌池禁用变灰
- [ ] Checkpoint 34: 点击已选手牌→弹窗"撤回这张?"确认后牌池张数 +1、手牌减少
- [ ] Checkpoint 35: N<14 时 "分析"按钮禁用灰色;N=14 时点亮
- [ ] Checkpoint 36: 点击分析→下方显示 ≥3 张 Scenario 卡片("打 X"+ 门张 + 进牌网格)
- [ ] Checkpoint 37: 底部 重置 / 撤回 / 关闭分析 / 分析 / 随机摸牌 5 个按钮全部可交互
- [ ] Checkpoint 38: 随机摸牌在 <14 时补齐到 14;=14 时随机替换一张
- [ ] Checkpoint 39: 刷新后若开启保存,可恢复上次已选(可选,未实现不视为bug)

## 7. 持久化 & 数据安全
- [ ] Checkpoint 40: localStorage 所有 key 均带 redcenter.quiz.* 前缀
- [ ] Checkpoint 41: progress/custom/simulator/settings 4 类分别独立存储
- [ ] Checkpoint 42: localStorage 读写均 try/catch, 异常不会白屏或报错(可手动删除某 key 的 JSON 格式进行测试)
- [ ] Checkpoint 43: 不调用网络接口,不 eval,不用 innerHTML 注入题目说明/解析

## 8. 性能/交互/视觉
- [ ] Checkpoint 44: 题目切换响应 <50ms;analysisFromHandCards <300ms
- [ ] Checkpoint 45: 整体色板与现有牌桌一致(暗底+金色高亮)
- [ ] Checkpoint 46: 竞品风格匹配度高:手牌2行×7列,A/B/C/D 4选项横向,34×4牌池张数数字,卡片场景布局
- [ ] Checkpoint 47: 无视觉错位/滚动条异常/遮挡手牌等常见 UI bug

## 9. 回归验证(原功能不破坏)
- [ ] Checkpoint 48: 对弈模式所有原功能正常(摸牌/出牌/AI/自摸胡/专家Tab/校正/局终翻牌)
- [ ] Checkpoint 49: 辅助 Tab 的校正区、专家 Tab 的评分/趋势图仍能显示
- [ ] Checkpoint 50: "请求辅助决策"(对弈模式中的按钮)弹出 SmartAnalysisPanel 正常,不受题库模式影响
