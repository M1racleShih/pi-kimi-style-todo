// Synthetic provider and interaction probes for real Pi; no external requests or user data.
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const faux = fauxProvider({ provider: "kimi-fixture", models: [{ id: "scripted" }] });
  pi.registerProvider(faux.provider);
  const call = (args: Record<string, unknown>) => fauxToolCall("todo", args);
  pi.on("before_agent_start", event => {
    const prompt = event.messageType === "user" ? event.prompt : "";
    const replies: ReturnType<typeof fauxAssistantMessage>[] = [];
    if (prompt.includes("seed")) {
      const count = prompt.includes("large") ? 16 : prompt.includes("one") ? 1 : 5;
      replies.push(fauxAssistantMessage(call({ action: "clear" })));
      replies.push(fauxAssistantMessage(Array.from({ length: count }, (_, i) => call({ action: "create", subject: ["建立数据模型", "补充校验逻辑", "编写边界测试 👋", "验证终端交互", "更新使用说明"][i] ?? `合成任务 ${i + 1}`, description: `Synthetic detail ${i + 1}`, owner: "fixture" }))));
      if (count > 1) replies.push(fauxAssistantMessage([call({ action: "update", id: 1, status: "completed" }), call({ action: "update", id: 2, status: "completed" }), call({ action: "update", id: count === 5 ? 3 : 16, status: "in_progress", activeForm: "正在验证" })]));
    } else if (prompt.includes("complete")) {
      replies.push(fauxAssistantMessage(call({ action: "list" })));
      replies.push(fauxAssistantMessage(Array.from({ length: 5 }, (_, i) => call({ action: "update", id: i + 1, status: "completed" }))));
    } else if (prompt.includes("clear")) replies.push(fauxAssistantMessage(call({ action: "clear" })));
    else if (prompt.includes("list")) replies.push(fauxAssistantMessage(call({ action: "list" })));
    replies.push(fauxAssistantMessage("Fixture ready."));
    faux.setResponses(replies);
  });
  pi.registerCommand("fixture-light", { description: "Synthetic theme switch", handler: async (_, ctx) => { ctx.ui.setTheme("light"); } });
  pi.registerCommand("fixture-dark", { description: "Synthetic theme switch", handler: async (_, ctx) => { ctx.ui.setTheme("dark"); } });
}
