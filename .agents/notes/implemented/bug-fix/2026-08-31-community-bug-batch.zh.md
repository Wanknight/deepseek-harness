# Agent Note: 社区报告 bug 批次（discussions 5172/5146/5163/5147）

Status: implemented

[English](2026-08-31-community-bug-batch.md) | 中文

## 问题

来自 GitHub Discussions 的四份社区 bug 报告，逐份对照当前 master、先验证报告者根因再修复：

- **#5172** —— 源码 checkout 宿主中，`plugin-package-inventory-deepseek` 对每一条 anchor 搜索链不可见的 bundle 依赖抛出 `cannot resolve active package`，使官方 DeepSeek 路由的每一次请求都失败。一个遥测字段放倒了它所服务的整条路由。
- **#5146** —— 第三方 Typert Remote 方法返回 HTTP 404：rc.2 的模块私有 WeakMap 标记表在源码宿主加载的两份协议副本之间互不相通。**上游已修**：master 将标记存为 prototype 自有属性，任何副本读取结果一致；缺的只是回归测试。
- **#5163** —— `popupSelect` 从不把键盘焦点还给 composer：headless 控制器和视图都调用了 `focusComposer()`，但 `CommandUiRuntime.bindComposerFocus` 没有任何调用方——服务侧挂钩存在，客户端 wiring 从未绑定。
- **#5147** —— 询问待决时把审批策略改为 `never`，agent 永久卡在「working」：`setPolicy` 记录了切换，却从不裁决停在 `approval/request` waterfall 上的飞行中询问。

## 决策

- **#5172**：降级，而非失败。`PackageIdentityResolver` 现在把解析不到的裸包缓存为缺失并经插件 logger 每包每进程警告一次（resolver 既有缓存本就承载缺失；警告去重挂在第二个集合上）。manifest 畸形的抛错保留——那一行解析到了真实文件，是内容错误。
- **#5146**：不改代码。跨副本 fixture（`tests/fixtures/cross-copy-markers.ts`）在同一进程加载 `lib/index.js` 与 `src/index.ts` 两份模块实例，断言经一份写入的标记可被另一份读取，把基于属性的设计锁死，防 WeakMap 回归。
- **#5163**：接通既有挂钩，不新增通道。`InputHub.shellFor` 在服务存在时绑定 `commandUi.bindComposerFocus(id, () => shell.focusComposer())`（解绑随 scope disposer），`SessionInputShell.focusComposer()` 将根元素的 DOM focus 与 Lexical 的选区恢复配对——与解锁 effect 相同的配对，去掉 reveal。依赖方向不变：ui-conversation 的 hub 本就以结构化方式 duck-type `commandUi`。
- **#5147**：在策略切换点按发起 agent 裁决待决询问。`request()` 登记每个询问的 resolver（`arm`/`settlePending`）；`setPolicy('never')` 把该 agent 的待决询问落定为 `rejected`——与在 `never` 下发起的询问获得的裁决相同——等待中的工具调用随之解决、回合闭合。报告者的一行 `agent.signal.abort()` 被否决：那个信号是回合生命周期 abort，会取消整个 agent 而非这条询问。切回 `ask` 不动飞行中询问（其提示仍可操作）；`signal` abort 维持既有的 `'cancelled'` 竞速。

## 后果

源码 checkout 宿主在 workspace 专属包对盘点 resolver 不可见时保住官方 DeepSeek 路由（每包一条警告，字段省略该行）。404 这一类问题无法在不击穿跨副本测试的情况下回归。`/model` 与所有 popupSelect 命令在选择和 Escape 后把焦点还给 composer。切到 `never` 不再搁浅回合：待决工具调用收到 `rejected` 且审计对闭合（`approval/decided` 记 `outcome: rejected`）。

## 备选方案

- **#5172**：把 bundle 包目录加进 anchors——修补的是一种布局而非一类问题；降级才是修复，anchor 加宽可作上游后续。
- **#5147**：abort `agent.signal`（报告的建议）——杀死 agent 回合而不是回答询问；经待决注册表落定与已在文档中写明的入口处 `never` 裁决一致。
