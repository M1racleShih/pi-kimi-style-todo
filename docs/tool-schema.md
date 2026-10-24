# `todo` 工具协议

工具名称 `todo`、六种 action、返回的 `content`／`details` 与固定上游 2.13.8 兼容。改显示层不引入新的任务协议。

| action | 必填／常用字段 | 结果 |
| --- | --- | --- |
| `create` | 非空 `subject`；可带 description、activeForm、owner、metadata、初始 blockedBy | 新增 pending 任务，id 从 nextId 分配 |
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

## 持久化和恢复

每次有效 mutation 都写入当前 branch 的 `rpiv-todo-state` custom entry，数据为完整 details snapshot，包括没有独立 transcript tool-result 的 nested/codemode 调用。

恢复仅扫描当前 branch：有 custom state entry 时以其最新 snapshot 为准；否则回退到旧 `todo` tool-result details。保留原 id、顺序、nextId、metadata、owner 和依赖。显示裁剪、折叠和完成项隐藏均不写入这些 snapshot。

`/todos` 是用户查看命令，不修改状态：TUI 为可滚动详情视图；RPC 使用文本通知；没有 UI 时提示需要交互模式。
