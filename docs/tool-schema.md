# `todo` 工具协议

工具名称 `todo`、六种 action、返回的 `content`／`details` 与固定上游 2.15.0 兼容。改显示层不引入新的任务协议。

| action | 必填／常用字段 | 结果 |
| --- | --- | --- |
| `create` | 非空 `subject` 或非空 `tasks[]`，二选一；每项可带 description、activeForm、owner、metadata、初始 blockedBy | 原子新增一个或多个 pending 任务，id 从 nextId 连续分配 |
| `update` | `id` 与至少一个可变字段；`status` 控制状态 | 更新字段；相同值返回 No change |
| `list` | 可选 `status`、`includeDeleted` | 默认排除 deleted；details 仍是完整 snapshot |
| `get` | `id` | 单项详情、blockedBy 与反向 blocks |
| `delete` | `id` | 置为 deleted 墓碑，不物理删除 |
| `clear` | 无 | 清空任务并把 nextId 重置为 1 |

```json
{ "action": "create", "subject": "实现校验", "activeForm": "正在实现校验" }
```

```json
{ "action": "update", "id": 1, "status": "in_progress" }
```

```json
{ "action": "update", "id": 2, "addBlockedBy": [1], "metadata": { "obsolete": null } }
```

`blockedBy` 仅用于 create 的初始集合；update 使用 `addBlockedBy`／`removeBlockedBy`，不替换整个依赖列表。缺失依赖、已删除依赖、自依赖或环被拒绝。metadata 的 null 值在 update 时删除该键。

## 批量创建

```json
{
  "action": "create",
  "tasks": [
    { "subject": "研究现有实现", "owner": "fixture" },
    { "subject": "验证兼容性", "description": "工具参数与会话恢复" }
  ]
}
```

- `subject` 与 `tasks[]` 按字段是否出现判断互斥，即使顶层 subject 是空字符串也不能同时传入。
- 每项必须有非空 subject；批量调用的 description、activeForm、owner、metadata、blockedBy 放在各项内，不接受这些顶层字段。
- 先校验全部项目，再一次提交。任何项目失败都不创建任务、不消耗 id、不写状态 entry。
- `blockedBy` 只能引用调用前已有且未删除的任务，不能引用同批项目。依赖链应先创建前置任务，再创建依赖它的任务。
- 成功时 content 每行报告一个 Created，details 仍只携带一个完整 snapshot，不改变历史存储格式。

`prepareArguments` 在宿主 schema 校验前，兼容将 `tasks` 数组或其中对象再次编码成 JSON 字符串的调用。只解码到预期数组／对象形状；无效 JSON 或错误形状原样交给 schema 报错，不容错创建残缺任务。

## 状态

- pending → in_progress / completed / deleted。
- in_progress → pending / completed / deleted。
- completed → deleted；不能回到 in_progress。
- deleted 不能转为其他状态；相同状态更新按上游幂等语义处理。

通常保持一个 in_progress 由 guidance 引导，不是额外的 reducer 限制。依赖信息不会因 widget 裁剪而丢失，也不会额外强制「依赖未完成就不能开始」。

## 返回和错误

每个成功执行的工具返回：

```json
{
  "content": [{ "type": "text", "text": "Updated #1 (pending → in_progress)" }],
  "details": {
    "action": "update",
    "params": { "action": "update", "id": 1, "status": "in_progress" },
    "tasks": [{ "id": 1, "subject": "实现校验", "status": "in_progress" }],
    "nextId": 2
  }
}
```

状态校验错误保持上游的 in-band envelope：`content` 为 `Error: …`、`details.error` 包含原因，原状态不发生部分更新。宿主 schema 校验错误可能直接成为 Pi 的失败 tool result；两者不可混为一谈。

终端结果优先用错误色和 `✗` 显示 `details.error` 或宿主失败文本，折叠和展开时都保留原因，不把请求中的目标状态当成成功结果。错误文字先清理终端控制序列；这些展示规则不改变工具返回值。

工具调用标题中，单项 `create` 显示传入的 subject，批量 `create` 显示项目数，`update`／`get`／`delete` 显示稳定的 `#id`。调用标题没有该次结果的 snapshot，也不携带 session 身份，因此不会从当前前台任务中猜名称，避免 clear 后 ID 重用或切换会话时把历史调用标成其他任务。任务名称仍可在 widget、`/todos` 和工具 snapshot 中查看。

## 持久化和恢复

每次有效 mutation 都写入当前 branch 的 `rpiv-todo-state` custom entry，数据为完整 details snapshot，包括没有独立 transcript tool-result 的 nested/codemode 调用。

恢复仅扫描当前 branch：有有效 custom state entry 时以其最新有效 snapshot 为准；否则回退到旧 `todo` tool-result details。校验每项的任务字段、状态及渲染所需类型，并检查 id、依赖 id 和 nextId 为安全整数；含截断字符串或其他非法任务的 snapshot 整体跳过，不覆盖之前有效的状态。保留原 id、顺序、nextId、metadata、owner 和依赖。显示裁剪、折叠和完成项隐藏均不写入这些 snapshot。

`/todos` 是用户查看命令，不修改状态：TUI 为可滚动详情视图；RPC 使用文本通知；没有 UI 时提示需要交互模式。
