# Agent Note: 第二批社区缺陷修复（P2/P6/P7/P8/P10）

Status: implemented

[English](2026-08-31-community-bug-batch-2.md) | 中文

## 问题

社区体检系列（「发版体检」）的又五项发现，按「单操作者 Windows 源码 checkout、计划多实例运行 dsh」的部署画像分诊：

- **P2** —— profile `package.json` 带 UTF-8 BOM（Windows 记事本仍会写入）导致启动崩在裸 `JSON.parse` SyntaxError；YAML patch 层不受影响（js-yaml 容忍 BOM）。
- **P6** —— 子进程 env 清洗的子串启发式（`/KEY|PASSWORD|SECRET|TOKEN/i`）静默剥掉 `AWS_ACCESS_KEY_ID`、`MY_SERVICE_KEY` 等非凭据名，无任何痕迹。
- **P7** —— `subagent-codex/run.ts` 在模块顶层解析 `@openai/codex`：安装损坏时每个 import 方都拿到裸解析栈，而非一句可行动的话。
- **P8**（指控）—— provider `stream()` 预检抛错（DeepSeek `UNSUPPORTED_CONTENT`）留下孤儿半 turn。
- **P10** —— jsonl 后端（默认）的 `commitRepair` 无陈旧重检直接 truncate 撕裂尾，而 sqlite 同类操作在 `begin-immediate` 事务里带三重陈旧 throw；第二写者在检查到截断的窗口内追加会丢失已提交字节。

## 决策

- **P2**：`readProfileManifest` 解析前剥前导 U+FEFF。其余三处裸 `JSON.parse(readFileSync)` 保持：一处已容错（`readModuleProxyRecord`），两处读包管理器写的文件（不带 BOM）。
- **P6**：清洗保留（防凭据泄漏意图正确；显式 `env` 仍是故意转发通道）但让它可观察：`scrubbedParentEnv({ warn })` 每进程一次上报每个被剥的凭据形名字（只有名字，绝无值）；`DSH_*` 移除按文档化行为保持静默。`LocalSubprocessRuntime` 在全部三处 `childEnv` 调用点把 sink 接到 logger（spawn 内部经 `SpawnInternals.warnScrubbed` 传递）。
- **P7**：按调用惰性解析。`codexAppServerArgv(packageName?)` 解析失败时抛出一句修复指引（"install @openai/codex … dsh plugin …"）；参数存在是为了让测试探测不存在的包而不动真实安装。
- **P8**：**未复现——该指控在 master 上不成立。** `agent-loop` 的 catch/finally 对在 `stream()` 抛错后无条件 append `turn/end {kind:'error'}`；回归测试钉死此行为（error 种类、`UNSUPPORTED_CONTENT` 码保留、turn/事件配对平衡）。
- **P10**：撕裂 marker 携带 `snapshotBytes`（marker 拍照时的文件总字节数）；`commitRepair` 截断前 stat 日志，大小不同即以 `repair is stale` 拒绝——增长是并发写者，缩短是已被他人修复。这是 sqlite 事务窗口的 check-then-truncate 等价物；与同类一样收窄（而非消除）竞态。

## 后果

带 BOM 的 profile manifest 可启动。每个被清洗的凭据形环境名每进程记一行日志，指明子进程将看不到什么（验证时部署机的真实名单——`ANTHROPIC_AUTH_TOKEN`、`AWS_ACCESS_KEY_ID`……——立即浮现）。codex 安装损坏在首次使用时失败并给出安装指引。孤儿 turn 一类无法静默回归。多实例修复拒绝而非丢弃他人已提交字节；调用方重读并重新决策。

## 备选方案

- **P6 转发而非清洗** —— 破坏防泄漏意图；警告在不削弱默认行为的前提下恢复可诊断性。
- **P10 重扫 marker 深比较** —— 不充分：越过撕裂字节的并发追加可让重扫 marker 字节级相同（扫描器把中段损坏重分类为更长的撕裂区）。文件大小才是完备的增长信号。
- **P10 session 日志全面 flock（体检的 P5）** —— 不在本批：分 home 的单机多实例不受影响，锁协议是设计变更而非守卫。
