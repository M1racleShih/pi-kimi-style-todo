# 测试与兼容验证

## 复现

```sh
npm ci --ignore-scripts
npm run verify
npm run test:tui
```

运行命令不会切换调用者的工作目录，也不读取用户的 Pi agent 目录。单元测试不应绕过隔离入口直接启动 Vitest。

| 命令 | 覆盖范围 |
| --- | --- |
| `npm run check` | 所有分发 runtime TypeScript 的类型检查，无需构建 bundle |
| `npm test` | reducer、graph、schema、envelope、replay、store、render、config、guidance、生命周期与实际 SDK reload/tree/compaction/resume；含实际 nested/codemode 持久化测试 |
| `npm run test:load` | Pi 1.2.0 资源注册、无错误／warning、text／JSON／RPC；有／无可选 i18n |
| `npm run test:tui` | 实际 Pi CLI + POSIX PTY + xterm 屏幕解析：regular/fullscreen、120×42／80×24／80×12／resize、dark/light、快捷键、焦点、/todos、/reload、真实会话重入、空／溢出／全完成；组合 editor/footer/tool-renderer probes |
| `npm run test:pack` | npm dry-run 白名单与真正 tarball、隔离 npm 安装、无可选 i18n、资源/CLI 和两种终端模式 smoke |
| `npm run verify` | check + test + test:load + test:pack；完整 TUI 矩阵仍需单独运行 |

## 隔离边界

`scripts/isolated.mjs` 只向子进程传递所需环境变量，建立一次性 HOME、XDG、agent、sessions 和 workspace；在 finally 清理。测试 provider 使用 Pi 的本地 faux 实现，不调用真实模型。安装依赖本身需要 npm registry，**运行时验证**则同时设置 offline、关闭遥测／自动缓存请求，并在 Node 入口拦截 fetch、HTTP(S)、TCP/TLS 和 UDP。只允许 tsx 的本地 UNIX loader pipe，不放行网络地址。

PTY 检查实际终端单元格中的粗体、删除线、色彩、行数、内容和按键效果。失败／退出均清理子进程。合成 editor/footer/tool-renderer probes 检查的是 Pi 组合接缝，不代表验证了所有第三方产品。

## 已覆盖平台与未覆盖项

基线：Linux、Node 24.18.0、npm 11.8.0、Pi 1.2.0。宿主 API 要求 Node >=22.19；其他 Node 版本、macOS、Windows、真实操作系统 IME 及每一种终端字体／键盘协议未逐一验证。peer `*` 遵循 Pi 的宿主依赖约定，不代表承诺所有宿主版本。

## 更新公开预览

```sh
npm run test:tui -- --preview
```

将首次 regular 模式中真实渲染的合成 widget 单元格重建为 `docs/preview.svg`。文件仅包含合成任务、颜色与属性，不含 session、工作区路径或私有参考图。预览生成是显式动作，普通测试不改写产品文档。
