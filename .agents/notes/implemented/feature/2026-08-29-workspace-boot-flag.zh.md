# Agent Note: Workspace 启动 flag

Status: implemented

[English](2026-08-29-workspace-boot-flag.md) | 中文

## 问题

自动化部署会为机器本地的工作区目录启动 `dsh web`，但 workspace 注册表运行在服务进程内，此前只能通过 Web UI 侧栏流程或网关 API 访问——两者都需要交互式 client。profile 无法在启动时预注册工作区，因此 overlay 工作流不得不在服务停止时手工编辑 `~/.dsh/storages/workspace.json`。

## 决策

启动器在 `--patch` 旁解析可重复的 `--workspace <path>`（同一 collect 模式、子命令同样拒绝父级选项），并把路径交给 profile 启动。`apps/cli/src/profile-boot.ts` 中的 `registerBootWorkspaces` 在 `boot()` 返回后执行——此时配置树已完全挂载，`ctx.get('workspaceRegistry')` 读到的是就绪的注册表——并按 argv 顺序对每个路径调用注册表按规范路径幂等的 `create`，先于 `appReady.commit()`。注册逻辑放在启动器而非树内插件：随附组合包 patch 中的任何行都无法响应启动器 flag，且顺序约束（registry 服务已提供）是启动器层面的生命周期事实。

不挂载 workspace 注册表的组合（headless、sdk、裸自定义 profile）会带着修复提示显式报错，而不是静默跳过请求的注册；配置 dump 在解析时即拒绝该 flag，因为 dump 不启动任何东西。注册在关停引发的 shutdown 期间失败时，走与 patch 监视器相同的 `suppressShutdownError` 抑制路径。

## 后果

`dsh web --workspace <path> --no-open` 启动后侧栏已列出该工作区；重复启动复用已有记录（已验证：两个路径按 argv 顺序注册，同路径重启不产生重复）。`@deepseek-ai/dsh-workspace` 依赖只进入 devDependencies 并以 type-only import 引入 `ctx.workspaceRegistry` 的 Context augmentation——发布的 CLI 不增加任何运行时依赖。上游 PR 可以携带相同形态；该 flag 正是 Discussions 中维护者最可能采纳的建议形式。

## 备选方案

- 网关 HTTP 路由（`POST /api/workspaces` 转发器）：需要 Fetch 路由注册模式，且首次启动（任何 client 连接之前）仍拿不到工作区。
- `dsh workspace` CLI 子命令直接操作 storage 文件：进程隔离——注册表在运行中的服务进程内，停机写者需要复制领域逻辑，并可能破坏已校验的状态机。
- 在 `boot()` 的 `prepare` 钩子内注册：运行在配置树挂载之前，`workspaceRegistry` 尚未提供。
