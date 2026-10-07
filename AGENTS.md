# Agent instructions

## Code comments

Use complete sentences for English inline comments and doc comments. Start each sentence with a capital letter.

## Local issues

Keep each feature's spec at `.scratch/<feature>/spec.md` and tickets at `.scratch/<feature>/issues/<NN>-<slug>.md`.

Record triage in a `Status:` line using `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix`.

Never commit or push `.scratch/`; remove completed feature folders after implementation.

## Domain

知识挑战是面向个人的低风险通识问答场景，用于检验和拓展通识，不是正式考试或能力认证。

This single-context repository keeps its domain glossary here. Use the terms below in specs, tests, and code. Before exploring, read relevant decisions under `docs/adr/` and surface conflicts explicitly.

| Term | Meaning | Avoid |
| --- | --- | --- |
| 挑战局 | 一次完整答题体验，由十道互不重复的题目组成。 | 考试、测验 |
| 题目 | 考查单一核心事实的四选一问题，在给定语境下恰有一个明确正确选项。 | 问答、题卡 |
| 核心事实 | 题目考查的最小知识主张；仅改变措辞不产生新事实。 | 知识点 |
| 题目标识 | 具体题目的稳定标识，字段名为 `questionId`。 | 标签 |
| 发布题 | 已写入当前题库版本、可以进入挑战局的题目。 | 正式题 |
| 发布题库 | 全部发布题的集合，也是挑战局抽题的唯一来源。 | 题库、数据集 |
| 题库版本 | 不可变的发布题库快照，关联知识截止日和内容校验值。 | 当前题库 |
| 主类别 | 题目唯一所属的广义知识领域，用于描述发布题库覆盖面。 | 标签、题型 |
| 主题标签 | 描述主题、地域、时代等交叉特征的可复用标记；一题可有多个。 | 类别 |
| 稳定事实 | 答案不依赖作答时点，且不存在仍在变化或尚未确定的结果；发布题只考查稳定事实。 | 当前事实、时事 |
| 知识截止日 | 构建发布题库时判断近期事件的基准日期；该日期前三年内才发生或最终确定的事件不入库。 | 文件日期、发布日期 |
| 作答 | 为当前题目提交一个选项的不可撤销行为；提交后立即得到结果。 | 选择 |
| 超时 | 作答窗口结束时仍未作答的结果，不同于提交错误选项。 | 答错 |
| 题目得分 | 根据答案正确性和十五秒窗口内的作答用时计分，最高十分。 | 难度分 |
| 挑战得分 | 一局十道题的题目得分总和。 | 正确率 |
| 挑战复盘 | 当前局十道题的题目、作答结果、玩家选项与正确答案；仅存在当前页面，不形成跨局历史。 | 历史成绩、答题记录 |
