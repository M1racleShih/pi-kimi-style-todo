# pi-kimi-style-todo

一个计划基于 [rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/afc21bc25f7d07cae9fb3103dc309240a16b9f49/packages/rpiv-todo) 开发的独立 Pi TODO 扩展，采用 Kimi-inspired 的简洁任务列表风格。

**当前状态：仅完成仓库初始化。尚未导入上游运行时代码、实现扩展或发布 npm 包。**

目前没有可运行的安装命令。仓库名不代表已经取得同名 npm 包的发布权限。

## 项目定位

在保留上游任务工具、依赖校验及会话恢复能力的基础上，重新实现任务列表的显示层：简洁标题、状态符号、已完成项删除线和清晰的当前任务提示。

这是独立的社区衍生项目，与 Kimi / Moonshot AI、Pi 或 rpiv-todo 的作者不存在官方隶属或背书关系。项目名称中的 “Kimi-style” 仅说明界面风格灵感，不包含 Kimi 服务接入的承诺。

## 来源

计划采用的上游基线：

- 仓库：[`juicesharp/rpiv-mono`](https://github.com/juicesharp/rpiv-mono)
- 子目录：`packages/rpiv-todo`
- npm 包：`@juicesharp/rpiv-todo@2.13.8`
- 对应提交：`afc21bc25f7d07cae9fb3103dc309240a16b9f49`
- 许可：MIT，原作者 juicesharp

来源及完整性信息见 [UPSTREAM.json](UPSTREAM.json)，第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。当前只保留了上游许可文本，没有导入上游源码、测试或 Git 历史。

## 仓库边界

此仓库用于维护扩展源码、测试、面向使用者的文档和发布元数据。开发规划、任务跟踪、设计决策和过程证据在独立的私有规划仓库中维护，不作为本项目的构建或使用依赖。

开发者请先阅读 [AGENTS.md](AGENTS.md)。

## 许可

本仓库原创内容采用 [MIT](LICENSE) 许可。上游原始版权及 MIT 许可另行完整保留在 [licenses/rpiv-todo-MIT.txt](licenses/rpiv-todo-MIT.txt) 中；后续导入的衍生源码也必须保留原有声明。
