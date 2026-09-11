# 红中麻将题库训练系统 - 实施计划(任务分解并排序)

## [x] Task 1: 类型定义与核心基础设施
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 新建 `src/game/quizTypes.ts`,定义所有题库系统相关类型:
    ```
    QuizCategory = '搭子取舍'|'听牌选择'|'红中运用'|'对子处理'|'金张判断'|'综合复杂'
    Difficulty = 'easy'|'medium'|'hard'
    QuizQuestion = { id, title?, category, difficulty, handCodes[14], meldCount(0-4), question,
                     optionCodes[4], answerIndex(0-3), explanation, discardsPool?, tags?, version }
    QuizProgress = { answeredIds, correctIds, wrongIds, favoriteIds, mode, currentIndex, stats }
    QuizSettings = { soundOn, autoNext }
    SimulatorState = { selectedCodes[], countsPool[34] }
    ```
  - 新建 `src/quiz/storage.ts`,封装所有 localStorage 操作(统一 key 前缀、try/catch、JSON 安全解析、默认值):
    - `saveProgress / loadProgress / resetProgress`
    - `saveCustomQuestions / loadCustomQuestions / updateCustomQuestion / deleteCustomQuestion`
    - `saveSimulator / loadSimulator`
    - `saveSettings / loadSettings`
  - 在 `src/game/advisor.ts` 新增导出:
    - `buildMinimalState(handCodes, meldCount=0, discardsPool?) : GameState` (构造足够 computeScenarios 使用的最小 GameState 骨架:人类 seat=1, 手牌 handCodes 转 Tile[] 带合理 id, 其余 3 位玩家 discards 合并为 publicSeen)
    - `analysisFromHandCodes(handCodes, meldCount, discardsPool?) : ScenarioAnalysis`
  - 导出 `tileIdCounter`(递增)可重复使用,或使用 `id = codeIndex * 4 + dup` 策略
  - 在 `src/game/types.ts` 中不需要 QuizQuestion 类型(因为在 quizTypes.ts 里),但如果 Advisor 需要新类型就添加
- **Acceptance Criteria Addressed**: AC-2, AC-7
- **Test Requirements**:
  - `programmatic` TR-1.1: tsc --noEmit 零错误
  - `programmatic` TR-1.2: storage 函数读写 localStorage,无 key 时返回默认值
  - `programmatic` TR-1.3: analysisFromHandCodes 对 14 张已知向听的 hand 返回 scenarios.length ≥ 3
  - `programmatic` TR-1.4: 37 个现有 vitest 测试仍通过
- **Notes**: 最小 GameState 的 Tile id 可用公式: `idx = codeToIndex(code); id = idx * 4 + dup; dup从0递增`;不要求真实 0-135 全局

---

## [/] Task 2: 生成 100 道内置经典题型(算法生成 + 合法性校验)
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 新建 `src/quiz/builtinQuestions.ts`
  - 导出 `BUILTIN_QUESTIONS: QuizQuestion[]`(≥ 100 道)
  - 难度分布: easy(40) q001-q040 | medium(40) q041-q080 | hard(20) q081-q100
  - 类别分布: 搭子取舍(30) + 听牌选择(20) + 红中运用(15) + 对子处理(15) + 金张判断(10) + 综合复杂(10)
  - **生成步骤**:
    1. 随机生成 500 组 14 张合法手牌(含 0-3 张红中,同 code ≤ 4 张)
    2. 用 analysisFromHandCodes 调用 computeScenarios 获取 candidates 前 4 张作为选项
    3. 要求 scenarios[0].score > 0 (即手牌非胡牌状态、有可比较的差异)
    4. 根据 `currentShanten` 和 `shantenAfter` 分配难度: 听牌(0)→easy;一向听(1)→medium; 二向听以上→hard; 红中≥3张归到红中运用类别; 含≥3对子→对子处理; 搭子结构明显→搭子取舍; 弃牌选项分值接近难以抉择→综合复杂; 打出某金张与普通张差异悬殊→金张判断
    5. 对每道题 `explanation`: 用 computeScenarios 的 scenarios[0].reasoning + 补充"答案为 X,因为 X 能让门数最多/最贴近听牌/危险度低"
    6. 每题保证 `answerIndex = 0` (第 0 候选是最优,因为 scenarios 已排序)
  - **合法性校验** verifyBuiltinQuestions():
    - length ≥ 100
    - 每题: handCodes.length===14, optionCodes.length===4, 0≤answerIndex<4
    - 同 code 计数 ≤ 4, 红中(z5) ≤ 4
    - answerIndex 指向的 optionCodes 确实存在于 handCodes 中
    - canWin(hand)===false(否则此题是胡牌状态,无意义)
    - 统计难度分布与类别分布,不足则继续补充直到达标
  - 把 verifyBuiltinQuestions 作为 `BUILTIN_QUESTIONS` 后的一次运行时校验(开发模式下在文件末尾立即调用,失败则 console.warn 至少 N 道)
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: BUILTIN_QUESTIONS.length === 100
  - `programmatic` TR-2.2: verifyBuiltinQuestions 返回 true (全部合法)
  - `programmatic` TR-2.3: 难度分布: easy≥40, medium≥40, hard≥20
  - `programmatic` TR-2.4: 类别分布: 搭子取舍≥30,听牌选择≥20,红中运用≥15,对子处理≥15,金张判断≥10,综合复杂≥10
  - `human-judgement` TR-2.5: 人工抽查 5 题,解析和答案符合麻将常识
- **Notes**: 若某分类数量不足,可通过定向生成(例如专门注入 3 张红中的手牌凑红中运用类别),或简单放宽(把几道综合复杂归入金张判断)保证总数

---

## [ ] Task 3: 题库主页 + 模式选择 + 题目作答组件
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**:
  - 新建 `src/quiz/QuizHome.tsx` - 题库主页
    - 顶部: "🀄 红中麻将题库训练" + 返回按钮(切回对弈模式)
    - 中部: 6 大练习模式卡片网格(2×3):
      - 顺序练习: "从 q001 连续练习所有 100 题"
      - 分类练习: "按类别选择: 搭子取舍 / 听牌选择 / 红中运用 / 对子处理 / 金张判断 / 综合复杂" (子页)
      - 难度练习: "按难度: 入门 easy / 进阶 medium / 困难 hard" (子页)
      - 随机练习: "乱序随机抽题 30 道限时/不限时"
      - 错题练习: "仅显示你答错的题 (wrongIds)"
      - 收藏夹练习: "仅显示已收藏的题 (favoriteIds)"
    - 每卡片显示 "总题数 / 已答数 / 正确率 / 开始按钮"
    - 底部: 自定义题库入口(子页列表) + 统计面板(总答 X 题 / 正确率 Y% / 错题 Z 道)
  - 新建 `src/quiz/QuizPlay.tsx` - 作答页(核心)
    - Props: `{ questions: QuizQuestion[], startIndex: number, mode: string }`
    - 状态: `qIndex`, `answered`(boolean), `selectedOption`(index|null), `showExplain`, `analysis`(ScenarioAnalysis|null)
    - 顶部: "第 {qIndex+1} 关 / 共 {questions.length} 关"
    - 中部(手牌): 14 张 Tile 组件 (7列×2行,排序)
    - 问题文字: "红中麻将中打哪一张牌胡牌最快?"
    - 选项区: 4 张横向排列的牌(A/B/C/D),每张牌下方 A/B/C/D 字母
      - 点击后: 若已回答,禁止重复;未回答: 弹出正确/错误 Modal,关闭后高亮正确答案绿✓错误红✗,打开详细解析
      - 快捷键: 1/2/3/4 → 选 A/B/C/D,Enter → 下一题,←/→ 上/下题
    - 详细解析: 白色卡片显示 explanation,支持多行 (\n → whiteSpace:pre-line)
    - 底部工具栏(参考竞品参考图1底部 4 个按钮+2侧):
      - [进度] 答对 / 总数(如 0/12)
      - [🔈 开音] (空实现,预留位)
      - [🧭 分析] 弹出 SmartAnalysisPanel(基于当前题目 + analysisFromHandCodes)
      - [上局] ←
      - [选关] 回到首页
      - [下局] →
    - 右上角工具: "⭐ 收藏/取消收藏" + "⚙ 设置"
    - 答题结果 Modal:
      - 正确: 绿色 ✅ + "回答正确" + 关闭按钮
      - 错误: 红色 ❌ + "回答错误,正确答案是 X" + 关闭按钮
  - 新建 `src/quiz/QuizCategorySelect.tsx` 子页: 选择分类/难度 → 进入 QuizPlay
  - 新增 `src/quiz/quiz.css`: 所有题库样式(牌 14 张两排网格,选项 A/B/C/D 对齐,底部工具栏,弹窗,统计卡片等,遵循现有深色主题)
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-5, AC-8, AC-9
- **Test Requirements**:
  - `human-judgement` TR-3.1: 首页 6 种模式全部可进入且作答流程完整
  - `human-judgement` TR-3.2: 作答正确→显示正确弹窗→关闭后绿✓+解析;作答错误→显示正确答案
  - `programmatic` TR-3.3: tsc 零错误
  - `human-judgement` TR-3.4: 点击"分析"弹出 SmartAnalysisPanel,显示 ≥3 个场景卡片
  - `human-judgement` TR-3.5: 刷新后进度和错题仍在(AC-8)
  - `human-judgement` TR-3.6: 布局与参考图风格一致(手牌两行,选项四列,底部工具条)

---

## [ ] Task 4: 自定义题型创建/编辑/管理模块
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**:
  - 新建 `src/quiz/CustomList.tsx` - 自定义题列表页
    - 顶部返回按钮 + "➕ 新建题目"
    - 搜索框: 按 id/类别关键词过滤
    - 列表项:
      - 左侧: 题 id + 类别标签 + 难度标签
      - 中部: 前 10 张手牌缩略(Tile size=18) + 问题文字(截断) + 正确答案牌
      - 右侧: 操作按钮 [练习] [编辑] [删除×]
  - 新建 `src/quiz/CustomEditor.tsx` - 创建/编辑页
    - Props: `{ questionId?: string, onSaved: (q: QuizQuestion) => void, onCancel: () => void }`
    - 字段:
      1. **类别**: 下拉(6大类 + "自定义类别"输入)
      2. **难度**: 3 单选卡
      3. **手牌构造器(核心)**: 顶部 4 行牌池(万/筒/条/字)
         - 同 FR-5 牌池: 每张牌下方显示"剩余张数"(max 4 减去已选同 code)
         - 点击 → 加入手牌;若手牌已满 14 → 禁用所有牌池牌
         - 手牌区显示 14 张(每行 7),每张牌右上角有 ✕ 可点击归还
         - 按钮: [🎲 自动填充随机] → 合法随机 14 张;[🗑 清空手牌]
      4. 副露数: number input(0-4,默认 0)
      5. 问题文字: textarea(默认"红中麻将中打哪一张牌胡牌最快?")
      6. 选项 A/B/C/D:
         - 两种模式 Tab: [自动生成✓] / [手动选择]
         - 自动模式: 4 张选项牌显示,每张有"作为答案 A/B/C/D?"高亮最佳
         - 手动模式: 从手牌的 14 张牌里复选 4 张(点击)
      7. 正确答案: A/B/C/D 单选,并有 [🤖 自动判定答案] 按钮(取 computeScenarios 最优)
      8. 详细解析: 多行 textarea + [🤖 自动生成解析] 按钮
      9. 已见弃牌池(可选): 同样用迷你牌池选择(最多 30 张展示到已见)
    - 底部操作: [✅ 保存] [👁 预览] [🔍 校验] [❌ 取消]
    - 保存前: 校验未通过 → 以错误列表方式提示,不跳转
  - 复用 `QuizPlay.tsx` 的"预览"模式(传递单道题目,禁用进度保存)
  - 数据通过 storage.ts 的 saveCustomQuestions / updateCustomQuestion / deleteCustomQuestion
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: 新建题目全流程 → 列表出现 → 刷新仍存在(AC-4+AC-8)
  - `human-judgement` TR-4.2: "自动生成选项/答案/解析"按钮可一键完成
  - `programmatic` TR-4.3: 非法手牌(>14、同code>4、重复红中>4)会被校验拒绝保存
  - `human-judgement` TR-4.4: 编辑、删除、预览功能均正常

---

## [ ] Task 5: 选牌推演(智能模拟器)模块
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 新建 `src/quiz/Simulator.tsx` - 选牌推演页
  - 布局参考竞品图 4-5:
    - 顶部导航: "智能模拟器" + 返回按钮
    - 上部说明: "点击选择牌,再次点击丢入卡池(红中麻将)"
    - **牌池区(核心)**: 4 行
      - 行1: 一万~九万(m1..m9,共9)
      - 行2: 一条~九条(s1..s9,共9)
      - 行3: 一筒~九筒(p1..p9,共9)
      - 行4: 东南西北中发白(z1..z7,共7)
      - 每张牌下方数字: 当前剩余张数(初始 4),使用红色小徽章
      - 剩余 0 的牌置灰禁用
      - 点击牌: 剩余张数 -1, 手牌末尾追加
    - **手牌区**: "我的手牌(N张/14)" 带大矩形边框
      - N = 0 时: 中间文字提示 "手牌(0张)"
      - 排序显示所有已选牌(Tile size=36,两排7列对齐)
      - 每张牌点击 → 弹窗"撤回这张? 是/否" → 确认则归还(牌池张数 +1)
    - **分析结果区**:
      - N<14: 显示 "请先凑满14张(当前N/14)"
      - N=14: 展示结果
      - 方式1: 内联 SmartAnalysisPanel,每张 scenario 卡片"打 X"牌面 + "可进X门Y张" + 进牌网格(复用 FR-5)
      - 方式2: 如果需要独立样式 → `<ScenarioCard s={scenario}/>` 组件单独抽出(SmartAnalysisPanel 内部抽出的组件)
    - **底栏**(参考竞品图4底部 6 按钮):
      - [✕ 重置] 清空所有已选
      - [↶ 撤回] 撤销上一步加入手牌的牌(Stack: 维护 addHistory 数组)
      - [↕ 关闭分析] 折叠下方分析区
      - [🧭 分析] N≥14 时启用(高亮);否则禁用灰色
      - [🎲 随机摸牌] 若 N<14 → 随机补齐14;若 N=14 → 随机弃1张再摸1张
- **Acceptance Criteria Addressed**: AC-6, AC-9
- **Test Requirements**:
  - `human-judgement` TR-5.1: 牌池 34 种牌完整显示,张数正确 4
  - `human-judgement` TR-5.2: 选牌到14张后分析按钮点亮,点击出卡片
  - `human-judgement` TR-5.3: 重置、撤回、关闭分析、随机摸牌4个按钮正常
  - `human-judgement` TR-5.4: 手牌点击"撤回这张?"确认后正确归还牌池张数
  - `human-judgement` TR-5.5: 视觉与参考图 4-5 一致(牌池四行+手牌矩形+底栏)

---

## [ ] Task 6: App 根入口集成(模式切换) + 整体样式
- **Priority**: high
- **Depends On**: Task 3, Task 4, Task 5
- **Description**:
  - 修改 `src/App.tsx`:
    - 新增 `type AppMode = 'game' | 'quiz' | 'simulator'`
    - 顶部 header 的 controls 区增加模式切换:
      ```tsx
      <div className="mode-switch">
        <button className={mode==='game'?'active':''} onClick={()=>setMode('game')}>对弈模式</button>
        <button className={mode==='quiz'?'active':''} onClick={()=>setMode('quiz')}>题库训练</button>
        <button className={mode==='simulator'?'active':''} onClick={()=>setMode('simulator')}>选牌推演</button>
      </div>
      ```
    - 模式切换:
      - game 模式: 渲染原有 table-area + side-panel(维持现状)
      - quiz 模式: 隐藏原有 table-area + side-panel; 渲染 `<QuizHome onBack={()=>setMode('game')} />`(全屏)
      - simulator 模式: 隐藏原有 table-area + side-panel; 渲染 `<Simulator onBack={()=>setMode('game')} />`(全屏)
    - QuizHome 内部需导航到 QuizPlay / CustomList / CustomEditor / CategorySelect(可以用 useReducer 维护当前子路由 stack,不需要 react-router)
    - 自定义模式下的"分析按钮"复用 analysisFromHandCodes + SmartAnalysisPanel
  - 修改 `src/index.css`(或新增 quiz.css 并在 main.tsx / App.tsx 内 import):
    - `.mode-switch` button 组(金/深色主题)
    - 所有题库页样式(已在 quiz.css 中的样式迁移到 index.css 或独立引入)
    - 注意 `@import './quiz/quiz.css'` 方式(或建议把 quiz.css 全部样式追加到 index.css 末尾避免打包多文件)
- **Acceptance Criteria Addressed**: AC-1, AC-5, AC-6, AC-9
- **Test Requirements**:
  - `human-judgement` TR-6.1: 3 种模式切换,界面正确、相互独立无状态污染
  - `human-judgement` TR-6.2: 对弈模式所有现有功能仍正常(出牌/AI/局终/辅助等)
  - `programmatic` TR-6.3: tsc 零错误 / vitest 37 通过
  - `human-judgement` TR-6.4: SmartAnalysisPanel 在对弈/题库/推演三处都能独立正确显示

---

## [ ] Task 7: 整体验证与修复(AC-1~AC-9)
- **Priority**: high
- **Depends On**: Task 1-6
- **Description**:
  - 最终验证:
    - tsc --noEmit
    - vitest run (37+通过)
    - 浏览器端完整走查:
      - 对弈模式仍正常(回归)
      - 顺序练习完成 10 题(正确+错误各半)
      - 所有模式(6个)至少进入并作答一题
      - 自定义: 新建→保存→列表可见→编辑→练习→删除
      - 选牌推演: 凑14张→分析→撤回→重置→随机摸牌
      - 刷新: 所有进度、自定义题、错题本完整保留
      - 辅助决策按钮(分析)在 题库 与 选牌推演 中均能弹出卡片分析
  - 修复过程中发现的 UI/逻辑 bugs
  - 性能: 题切换、分析响应均达标
  - 更新 checklist.md 全部勾选并更新 tasks.md 全部 [x]
- **Acceptance Criteria Addressed**: AC-1~AC-9
- **Test Requirements**:
  - `programmatic` TR-7.1: tsc --noEmit 零错误
  - `programmatic` TR-7.2: vitest 全通过
  - `human-judgement` TR-7.3: 浏览器端 7 大场景走查全部 PASS
  - `human-judgement` TR-7.4: 界面与参考图风格整体相近
