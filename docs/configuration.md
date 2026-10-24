# 配置

扩展只读取自己的 JSON 配置，不创建文件，不自动迁移 `rpiv-todo` 的配置。

## 路径与回退

1. 有效的 `$XDG_CONFIG_HOME/pi-kimi-style-todo/config.json` 优先。
2. XDG 文件缺失时，回退到 `~/.config/pi-kimi-style-todo/config.json`（仍是新 namespace）。
3. XDG 未设置、空白或为相对路径时，直接使用 `~/.config/pi-kimi-style-todo/config.json`。`~`、`~/…` 会展开；`~user` 不展开。
4. 文件缺失、顶层不是对象时使用默认值。JSON 损坏时配置库发出警告并使用默认值，不用其他文件掩盖损坏。

示例：

```json
{
  "maxWidgetLines": 12,
  "collapseKey": "ctrl+shift+t",
  "completedDisplay": "retain",
  "guidance": {
    "promptSnippet": "Track multi-step progress",
    "promptGuidelines": ["Keep one task in progress and verify before completing."]
  }
}
```

## 字段

| 字段 | 默认 | 行为 |
| --- | --- | --- |
| `maxWidgetLines` | `12` | >=3 的安全整数。非整数、非有限值、错误类型或小于 3 回退默认；预算包含标题和底部，不另加 spacer。每次重绘重新读取。 |
| `collapseKey` | `ctrl+shift+t` | 按 Pi 的 modifier+key 语法；忽略首尾空格和大小写；`off` 禁用；无效值回退默认。改动需要 `/reload`。 |
| `completedDisplay` | `retain` | 或 `hide-previous-turn`；其他值回退 retain。只影响显示，不修改 snapshot。每次重绘重新读取。 |
| `guidance.promptSnippet` | 上游默认 | 非空字符串；无效值使用默认。加载时读取，需要 `/reload`。 |
| `guidance.promptGuidelines` | 上游默认 | 非空、且元素均为非空字符串的数组；替换整个默认规则数组。加载时读取，需要 `/reload`。 |

未知字段不会激活功能。上游配置库能校验的其他 guidance 字段不代表本扩展支持额外的模型行为；这里只使用上述两项。

## 行预算和完成项

- 展开时标题占一行、底部占一行，其余给任务。常规高度默认最多 10 行任务。
- 超预算按进行中、待开始、完成项依次选择，再按原任务顺序展示。不重排或删除真实任务；多于预算的进行中任务也确定性裁剪。
- 短终端的上限是 `max(0, floor(rows/2) - 2)` 与配置值的较小者，为编辑器、footer 和 transcript 留空间。可用预算为 1 时仅显示摘要，为 0 时不绘制；`/todos` 仍提供查看路径。
- 底部使用 `all N items` 或 `showing X of N items`。开启完成项隐藏时另报 `K completed hidden`，N 不包含墓碑及显式隐藏项。
- 窄终端先保留数量，缩短／省略按键提示；必要时用 `X/N (+K)` 表示显示／纳入数量及隐藏完成项。
- `hide-previous-turn` 只将真正渲染过的完成项排入下一轮隐藏；折叠或被预算裁掉的完成项不会提前消失。重载／恢复／切分支后重新展示。
- 空列表／仅墓碑卸载 widget；默认全部完成仍显示。所有完成项被显式隐藏时保留带隐藏数量的汇总。

## 快捷键

```json
{ "collapseKey": "alt+o" }
```

键在加载时解析，在首个 TUI session_start 获取宿主有效绑定后注册；冲突时禁用并提示改键。提示使用已注册键，不使用尚未 `/reload` 的新配置。`Ctrl+T` 保留为 Pi thinking toggle。

如果终端把 Ctrl+Shift+T 当成自己的新标签页操作，或不能单独报告 Shift，请改为空闲的 `alt+o` 等键。不会修改用户 Pi keybindings 文件。

## 本地化

可选 `@juicesharp/rpiv-i18n` 存在时，使用独立的 `pi-kimi-style-todo` namespace。没有该包也能加载，UI 使用英文 fallback。中英文文案随包分发；其他语言的新增文案未翻译时会使用英文。任务本身不翻译。
