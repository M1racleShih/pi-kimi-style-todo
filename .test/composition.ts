// Independent synthetic probes for the editor/footer/tool-renderer integration seams.
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new CustomEditor(tui, theme, keybindings));
    ctx.ui.setFooter(() => ({ render: () => ["Synthetic HUD"], invalidate() {} }));
  });
  pi.registerToolRenderer((name, next) => name !== "todo" ? next() : {
    renderCall: () => new Text("Synthetic tool renderer: todo", 0, 0),
    renderResult: () => new Text("Synthetic result", 0, 0)
  });
}
