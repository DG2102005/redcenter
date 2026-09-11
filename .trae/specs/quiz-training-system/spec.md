# 红中麻将题库训练系统 - PRD

## Overview
- **Summary**: 在现有红中推倒胡麻将训练工具中,新增一套全面的题库训练系统,包含 4 大核心模块:经典实战题型训练(100道内置题目)、自定义题型创建编辑、全题型"请求辅助决策"集成、选牌推演模拟器(智能自定义选牌+一键分析)。界面参考竞品"基础10题库"小程序的考试作答页与"智能模拟器"的选牌分析页风格。
- **Purpose**: 为红中麻将玩家提供系统的舍牌决策训练工具,通过题目练习提升牌效判断能力,通过自定义题型满足个性化训练需求,通过辅助决策集成确保每道题都有专业解析作为参考,通过选牌推演支持用户自由构造牌局进行推演学习。
- **Target Users**: 红中麻将(红中百搭、推倒胡、七小对)学习者、训练者,期望通过专项训练提升舍牌和听牌判断能力的玩家。

## Goals
1. 提供不少于 100 道的内置经典题型,按类别和难度分级,支持顺序/分类/随机练习模式
2. 提供题型创建和编辑界面,支持保存用户自定义题目到本地存储
3. 所有题型(内置+自定义)支持"请求辅助决策"调用现有 computeScenarios 引擎,生成卡片式场景分析
4. 提供"选牌推演"模拟器:用户通过点击牌池(34种牌×每种4张)自由构造 14 张手牌,点击分析后调用辅助决策推演最优打法
5. 所有训练与创作数据持久化存储(localStorage),包括进度、错题本、正确率、自定义题目
6. 界面视觉与操作风格参考竞品参考图:题目区(14张手排面)+ 提问区(打哪张胡牌最快)+ ABCD选项牌 + 答题结果弹窗(正确/错误 + 详细解析) + 选牌区(34×4牌池,手牌列表,分析按钮)

## Non-Goals (Out of Scope)
- 不做联机/多人对抗题库(纯本地)
- 不做账号系统/云端同步(仅 localStorage)
- 不修改现有对局引擎的游戏规则或 AI 逻辑
- 不做视频讲解、语音朗读
- 不做移动端 App 打包(仅浏览器 H5)

## Background & Context
### 现有代码资产(可直接复用)
- **牌面渲染**: `src/components/Tile.tsx` 中的 `Tile` 组件(支持 size/selected/onClick)
- **牌型工具**: `tileCode / tileName / tileIndex / indexToTile / isHongZhong / sortHand` (types.ts/sort.ts)
- **向听/胡牌判定**: `calcShanten / calcShantenFromBase` (advisor.ts) + `canWin / checkTing` (win.ts)
- **场景分析引擎**: `computeScenarios(state, seat): ScenarioAnalysis` (advisor.ts) — 生成卡片式弃牌场景、进牌列表、门数/张数、危险度
- **按需辅助决策 UI**: `SmartAnalysisPanel.tsx` — 已实现的卡片式分析面板,可直接复用于题型和推演场景
- **已有持久化模式**: `correctionLib.ts`、`strategyLib.ts` 均使用 localStorage 模式,可参考

### 竞品 UI 模式参考
1. **题目作答页**:
   - 顶部: 题库名 + 第N关/共M关
   - 中部: 14张手排面(7列×2行) + 题目文字("红中麻将中打哪一张牌胡牌最快?")
   - 下方: A/B/C/D 4个选项,每个选项是一张牌(麻将牌面图片)
   - 作答后: 弹出"回答正确"/"回答错误"对话框,关闭后显示正确答案标记(✓) + 详细解析文本
   - 底部: 进度(答对/总数)+ 开音 + 分析按钮 + 上局/选关/下局

2. **智能模拟器(选牌推演)页**:
   - 上部: 34×4 牌池(万/筒/条/字 分四行,每张牌下方显示剩余张数[数字]),点击选牌到手牌,再点可丢卡池(或"滑动丢入卡池")
   - 中部: "我的手牌(14张)"矩形框,展示已选手牌
   - 下部: 分析结果卡片 — "打 X" + "可进X门Y张" + 进牌网格(参考现有 SmartAnalysisPanel)
   - 底部: 重置 + 撤回 + 关闭分析 + 随机摸牌 + 拍照识别(本项目无需拍照)

## Functional Requirements

### FR-1: 题库模式切换入口
- 在 App 顶部 header 新增模式切换:"对弈模式" ↔ "题库训练" ↔ "选牌推演"
- 切换到题库训练时: 隐藏牌桌区,显示 `QuizApp` 根组件
- 切换到选牌推演时: 隐藏牌桌区,显示 `SimulatorApp` 根组件
- 默认仍是"对弈模式"(不影响现有对局)
- 侧栏各 Tab 在题库/推演模式下隐藏或显示适配版(仅保留"信息"用于返回)

### FR-2: 经典实战题型训练模块
- **内置 100 道题**: 每道题包含:
  - `id: string` — 题目编号 q001~q100
  - `category: string` — 类别:"搭子取舍"|"听牌选择"|"红中运用"|"对子处理"|"金张判断"|"综合复杂"
  - `difficulty: 'easy' | 'medium' | 'hard'` — 难度
  - `handCodes: string[]` — 14张手牌 code 数组(用现有 code 编码 m1/m9/p1/p9/s1/s9/z1/z7, z5=红中)
  - `meldCount: 0..4` — 副露数(默认 0)
  - `question: string` — 问题文字(默认"打哪一张牌胡牌最快?")
  - `optionCodes: string[]` — 4 张选项牌 code (A/B/C/D)
  - `answerIndex: 0..3` — 正确答案索引
  - `explanation: string` — 详细解析(文本,多行)
  - `discardsPool?: string[]` — 可选:已见弃牌(用于辅助决策分析)
- **100 道题分配规则**:
  - 难度分布: easy 40 (q001-040) | medium 40 (q041-080) | hard 20 (q081-100)
  - 类别分布: 搭子取舍 30 + 听牌选择 20 + 红中运用 15 + 对子处理 15 + 金张判断 10 + 综合复杂 10
  - 每道题的 handCodes 必须长度为 14,必须在生成后通过 verify(向听计算合法,答案在 4 选项中且真实为最优)
- **练习模式支持**:
  - 顺序练习: 按 id 顺序 q001→q100
  - 分类练习: 从侧栏选择类别(搭子取舍/听牌选择...),仅显示该类题目
  - 难度练习: 选择难度 easy/medium/hard
  - 随机练习: 打乱顺序,不重复
  - 错题练习: 仅显示用户历史答错的题
  - 收藏夹练习: 仅显示用户标记为收藏的题
- **作答流程**:
  - 显示手牌(14 张 × Tile 组件,已排序)
  - 显示问题文字
  - 显示 A/B/C/D 4 张选项牌,水平排列,每张牌下方 A/B/C/D 字母
  - 点击某张选项 → 显示正确/错误弹窗:
    - 正确弹窗: ✅ 绿色 "回答正确" 文字 + "关闭" 按钮
    - 错误弹窗: ❌ 红色 "回答错误" 文字 + "正确答案是 X" + "关闭" 按钮
  - 弹窗关闭后在正确选项牌上显示绿色 ✓,用户的错误选项显示红色 ✗
  - 下方显示详细解析文本(原 explanation 字段)
  - 支持"请求辅助决策"按钮: 点击后在题目旁弹出 SmartAnalysisPanel 卡片式分析
- **进度与统计**:
  - 顶部: "第 N 关 / 共 M 关"(M 取决于练习模式题目总数)
  - 底部进度: 答对题数/已答总数
  - 正确率统计(%)
  - 进度自动持久化(刷新页面不丢)

### FR-3: 自定义题型创建/编辑/管理模块
- **题型列表页**:
  - "自定义题库"列表,显示所有用户创建的题目
  - 每项: id 缩略、问题、正确答案牌、难度标签、创建时间、操作按钮(编辑/删除/练习)
  - 搜索: 按 id 或类别关键词过滤
  - "➕ 新建题目"按钮 → 进入创建页
- **创建/编辑表单页**:
  - 字段 1: 题目类别 (下拉选择 6 大类 + 自定义文本)
  - 字段 2: 难度 (单选 easy/medium/hard)
  - 字段 3: 14 张手牌构造器:
    - 顶部 34×4 牌池(参考竞品选牌页) → 点击选牌到手牌区;若手牌区已有 14 张,提示已满,需点击手牌区某牌移除
    - 手牌区显示当前 14 张牌(可点击移除)
    - 校验: 必须恰好 14 张; 同 code 不能超过 4 张 + 红中不超过 4 张
    - "自动填充随机"按钮 → 合法随机填充 14 张
  - 字段 4: 副露数(默认 0,0-4)
  - 字段 5: 问题文字(默认"红中麻将中打哪一张牌胡牌最快?")
  - 字段 6: 选项设置:
    - 方案 A(默认): 点击"自动生成选项"按钮,基于手牌调用 computeScenarios 取前 4 张候选弃牌作为 A/B/C/D
    - 方案 B(手动): 从手牌 code 中手动选择 4 张牌作为 A/B/C/D
  - 字段 7: 正确答案(单选 A/B/C/D)
    - 支持"自动判定正确答案": 调用 computeScenarios 取 score 最高的那张候选为正确答案,并设置 answerIndex
  - 字段 8: 详细解析(多行 textarea)
    - 支持"自动生成解析": 基于 computeScenarios 结果拼接文案(最优牌+门数+张数+进牌列表+理由)
  - 字段 9(可选): 已见弃牌池(最多 100 张牌 code,用于辅助决策可见性)
  - 底部操作: 保存(创建/更新) | 取消 | 预览(以作答模式预览) | 验证合法性(计算向听数、检查答案确实存在、手牌合法)
- **持久化**: 自定义题目存 localStorage key="redcenter.customQuestions"

### FR-4: "请求辅助决策"功能全集成
- **经典题型作答页**: 底部工具栏提供"🧭 分析"按钮
  - 点击后基于当前题目的 handCodes + meldCount + discardsPool 构造一个最小 GameState
  - 调用 `computeScenarios(minimalState, HUMAN_SEAT)` 获取场景分析
  - 弹出 SmartAnalysisPanel 卡片展示
- **自定义题型**:
  - 编辑页中的"自动生成选项"、"自动判定答案"、"自动生成解析" 3 个按钮均调用辅助决策引擎
  - 预览模式下"分析"按钮同样可用
- **选牌推演页**: "随机摸牌"右侧为"🧭 分析"按钮,点击后弹出 SmartAnalysisPanel
- **复用**: 不重复实现分析 UI,统一复用现有 `SmartAnalysisPanel.tsx`,新增导出 `analysisFromHandCodes(handCodes, meldCount, discardsPool)` 工具函数

### FR-5: 选牌推演模拟器
- **布局(参考竞品参考图 4-5)**:
  - 顶部导航: "智能模拟器" 标题 + 返回按钮
  - 上部牌池区: 四行(万、筒、条、字牌)
    - 每行 9/7/9/7 张牌型,每张牌下显示一个数字(该牌型剩余张数:初始 4)
    - 点击某张牌: 若剩余张数 > 0 → 张数 -1,同时加入手牌区末尾
    - 若手牌区已满 14 张 → 禁用牌池全部牌(置灰),点击无效
    - 滑动丢弃: 长按手牌区某牌拖入卡池区域可归还(简单实现: 手牌区点击某牌 → 弹出 "撤回这张?" 确认归还)
  - 中部手牌区:
    - "我的手牌(N张/14)" 标题
    - 展示已选手牌(14张,按万筒条字排序)
    - 每张牌可点击(提示: 点击归还)
  - 下部分析区:
    - N<14 时: 灰色禁用的 "分析(请先凑满14张)" 按钮和"随机摸牌"
    - N=14 时: 启用 分析/随机摸牌
    - "🧭 分析" 被点击后下方渲染 SmartAnalysisPanel 场景卡片列表(不是浮层,而是内联显示,参考竞品)
    - "随机摸牌": 从剩余张数>0 的牌型中随机补齐到 14 张(或 13→14,14 时先随机丢 1 张再摸 1 张,实现"摸牌更新")
  - 底部工具栏(参考竞品 4 图):
    - "重置": 清空手牌,所有牌池张数恢复 4
    - "撤回": 把最近一次加入手牌的牌归还牌池(Stack 行为)
    - "关闭分析": 隐藏下方分析区
    - "🧭 分析": (同上部按钮)
    - "随机摸牌": 同上

### FR-6: 持久化存储
- localStorage keys (前缀统一 `redcenter.quiz.`):
  - `redcenter.quiz.builtinProgress` — 内置题练习进度: `{ answeredIds: string[], correctIds: string[], wrongIds: string[], favoriteIds: string[], mode: string, currentIndex: number, statsByCategory: Record<string,{correct,answered}> }`
  - `redcenter.quiz.customQuestions` — 自定义题目数组(带 id/category/difficulty/handCodes/meldCount/question/optionCodes/answerIndex/explanation/discardsPool/createdAt/updatedAt)
  - `redcenter.quiz.simulator` — 选牌推演的最近一次保存(可选,用于刷新恢复) `{ selectedCodes: string[] }`
  - `redcenter.quiz.settings` — 用户设置(音效开关 etc.)
- 所有存储操作使用 try/catch,JSON 解析失败则回退默认值,不崩溃
- 存储容量估算: 100 内置+500 自定义,每题约 1KB → <1MB,localStorage 5MB 内充足

### FR-7: 辅助工具函数: handCodes → ScenarioAnalysis
- `src/game/advisor.ts` 新增导出函数:
  ```
  buildMinimalState(handCodes: string[], meldCount = 0, discardsPool?: string[]): GameState
  ```
  构造一个满足 computeScenarios 输入的 GameState(无需真实摸牌/AI),玩家 1 为人类持有该手牌,其他 3 玩家 discardsPool 合并到 discards 中用于 publicSeen 统计
- `export function analysisFromHandCodes(handCodes, meldCount, discardsPool): ScenarioAnalysis`
  内部调 buildMinimalState + computeScenarios

### FR-8: 数据合法性校验
- 内置 100 题生成完成后运行: `verifyBuiltinQuestions()` 检查:
  - 每题 handCodes.length === 14
  - 每题同 code 不超过 4 张,红中不超过 4 张
  - 每题答案 answerIndex ∈ 0-3, answerIndex 指向 optionCodes 的牌在手牌中存在
  - 使用 canWin/checkTing 检查手牌是否真实处于该题目所声称的场景(例如 hard 难度若 14 张已胡牌则无效)
- 自定义题目保存前运行 `validateQuestion(q)`,列出所有错误原因,不通过则禁止保存
- 选牌推演: 每次加入手牌前都检查 code 剩余张数合法

## Non-Functional Requirements

### NFR-1: 性能
- 14张手牌场景分析(computeScenarios): < 300ms(现已有数据)
- 切换题目: < 50ms
- 34×4 牌池 + 14 张手牌渲染: 初次渲染 < 80ms
- 打开题库模式: < 200ms

### NFR-2: 可访问性 & 交互
- 所有主要操作有键盘快捷键: 选项 A/B/C/D → 按键 1/2/3/4;下一题 → Enter;上一题 → ← / →
- 弹窗支持 Esc 关闭
- 选项点击有 200ms 内的视觉反馈(高亮/阴影)

### NFR-3: 代码质量
- 全部 TypeScript,tsc --noEmit 零错误
- 组件尽量复用现有 Tile/SmartAnalysisPanel
- 新文件分模块: `src/quiz/` (子系统) + 少量类型到 `src/game/quizTypes.ts`

### NFR-4: 可扩展性
- 内置题 100 道为常量数组,可通过追加 q101+ 随时扩充,修改无需改 UI
- 自定义题型结构包含版本号 `version: 1`,便于未来扩展字段

### NFR-5: 安全性
- 所有 localStorage 读写 try/catch,异常不崩溃
- 不存储任何敏感信息;不调用网络接口(除了牌面素材本地路径)
- 不 eval,不 innerHTML,题目的 explanation 以纯文本显示(如需换行用 \n + white-space:pre-line)

## Constraints
- **技术**: React 18 + TypeScript + Vite,零新增依赖
- **牌型编码**: 严格沿用现有 code 系统(m1/m9, p1/p9, s1/s9, z1/z7; z5=红中)
- **规则**: 仅红中百搭推倒胡 + 七小对,不引入其他规则(不做四人立直/鸣牌判断)
- **布局**: 现有桌面布局 + 侧栏模式下(题库模式不显示桌面),新增 QuizApp/SimulatorApp 两个根视图

## Assumptions
- 用户使用桌面浏览器(最小视口 ≥ 1024×768),无需移动端适配
- localStorage 可用(非隐身模式或第三方禁用)
- 所有 34 种牌型素材已在 `public/tiles/*.png` 完整存在(沿用现有 getTileUrl)
- 用户会对"4 选项"的题目形式有基本理解,无需长文新手引导

## Acceptance Criteria

### AC-1: 模式切换入口
- **Given**: 用户在首页(header 区域)
- **When**: 点击"题库训练"标签
- **Then**: 牌桌区消失,题库训练主页出现(题模式列表)
- **Verification**: `programmatic` + `human-judgment`

### AC-2: 100 道内置题存在且合法
- **Given**: 代码中 `src/quiz/builtinQuestions.ts` 导出 `BUILTIN_QUESTIONS`
- **When**: 运行验证函数
- **Then**: 数量 ≥ 100,每题合法(14张、答案在4选项、同code<=4、红中<=4、难度类别分布符合要求)
- **Verification**: `programmatic`

### AC-3: 作答流程完整
- **Given**: 用户进入顺序练习第 N 题
- **When**: 点击正确选项
- **Then**: 弹出"回答正确"对话框 → 关闭后选项显示✓、显示解析文字、进度增加+1
- **Verification**: `human-judgment`

### AC-4: 自定义创建流程
- **Given**: 在"自定义题库"页点击 ➕ 新建
- **When**: 通过牌池点选构造 14 张 → 自动生成选项/答案/解析 → 保存
- **Then**: 自定义题目列表出现该条,可再次编辑和练习,刷新页面后仍存在
- **Verification**: `human-judgment`

### AC-5: 辅助决策集成
- **Given**: 进入任意题
- **When**: 点击"分析"
- **Then**: 弹出 SmartAnalysisPanel,显示当前手牌的场景卡片(≥3个,含弃牌、门张、进牌、危险度)
- **Verification**: `human-judgment`

### AC-6: 选牌推演功能
- **Given**: 进入选牌推演模式
- **When**: 点选 34×4 牌池凑满 14 张 → 点击"分析"
- **Then**: 下方渲染内联式 SmartAnalysisPanel 场景卡片,显示"打X" + 进牌网格 + 门数张数
- **Verification**: `human-judgment`

### AC-7: 技术质量
- **Given**: 所有代码变更完成
- **When**: 运行 `npx tsc --noEmit` 与 `npx vitest run`
- **Then**: TypeScript 零错误;37 个单元测试全部通过
- **Verification**: `programmatic`

### AC-8: 持久化与刷新
- **Given**: 用户完成了若干题、创建了 2 道自定义题
- **When**: 刷新浏览器(F5)
- **Then**: 练习进度、正确/错题/收藏、自定义题目均被完整恢复
- **Verification**: `human-judgment`

### AC-9: 界面风格匹配竞品
- **Given**: 题库作答页、选牌推演页
- **When**: 与参考图对比
- **Then**: 手牌/选项/34×4牌池/分析卡片布局风格与参考图一致(牌面图片使用同一套资源)
- **Verification**: `human-judgment`

## Open Questions
- [ ] 是否需要每题"分享"按钮?(默认: 不做,保留扩展位)
- [ ] 是否需要成就系统?(默认: 不做,仅保留统计数据)
- [ ] 是否需要"夜间模式"?(默认: 跟随现有暗色主题即可,不做单独切换)
