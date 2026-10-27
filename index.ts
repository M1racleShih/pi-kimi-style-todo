/**
 * pi-kimi-style-todo — derived Pi extension. Registers the `todo` tool, `/todos` slash
 * command, and the persistent TodoOverlay widget.
 *
 * TUI chrome strings localize at render time via the i18n bridge. Strings are
 * registered with rpiv-i18n here, once, at module init — but only when the
 * SDK is actually installed. If `@juicesharp/rpiv-i18n` is missing (standalone
 * install of just this package), the dynamic-load shim no-ops and the bridge's
 * `t(key, fallback)` returns the inline English literal at every call site.
 * The extension stays online either way.
 *
 * Adding a locale: drop `locales/<code>.json` next to en.json (mirroring the
 * key set). No edit needed here — `registerLocalesFromDir` iterates
 * `SUPPORTED_LOCALES` from the SDK. See `@juicesharp/rpiv-i18n` README →
 * "Contributing translations" for the full convention.
 *
 * Initially derived from rpiv-todo 2.13.8; task kernel pinned to 2.15.0
 * (see UPSTREAM.json). Tool name
 * "todo" and the rpiv-todo-state snapshot identity remain compatible;
 * the widget key and configuration/i18n namespace are independent.
 */

import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings, type KeyId, matchesKey } from "@earendil-works/pi-tui";
import { COLLAPSE_KEY_OFF, resolveCollapseKey } from "./config.js";
import { I18N_NAMESPACE } from "./state/i18n-bridge.js";
import { replayFromBranch } from "./state/replay.js";
import {
	clearActiveRenderSession,
	evictSession,
	getActiveRenderSession,
	getRenderState,
	replaceState,
	setActiveRenderSession,
	sid,
} from "./state/store.js";
import { registerTodosCommand, registerTodoTool, TOOL_NAME } from "./todo.js";
import type { TodoOverlay } from "./todo-overlay.js";

type I18nLoader = {
	registerLocalesFromDir: (namespace: string, packageUrl: string, options?: { label?: string }) => void;
};

/** Delay the overlay graph pre-warm until Pi's startup work has settled. */
export const PREWARM_DELAY_MS = 2000;

type TodoOverlayModule = typeof import("./todo-overlay.js");
type TodoOverlayImporter = () => Promise<TodoOverlayModule>;

/**
 * Marker shared by the loader's poisoned-namespace error and the
 * `isStaleOverlayModuleError` predicate that lets handlers re-throw it while
 * swallowing transient load failures.
 */
const STALE_OVERLAY_MESSAGE = "Todo overlay module cache is stale; restart Pi";

/** True for the loader's latched poisoned-namespace error (see below). */
export function isStaleOverlayModuleError(e: unknown): boolean {
	return String(e).includes(STALE_OVERLAY_MESSAGE);
}

/**
 * Memoize the overlay graph after a successful load, but drop a rejected
 * promise so a failed pre-warm does not permanently replay the same rejection.
 * The export guard turns jiti's poisoned-namespace failure into a useful restart
 * error instead of a bare "TodoOverlay is not a constructor" TypeError.
 */
export function makeTodoOverlayLoader(
	importOverlay: TodoOverlayImporter = () => import("./todo-overlay.js"),
): TodoOverlayImporter {
	let memo: Promise<TodoOverlayModule> | undefined;

	return async (): Promise<TodoOverlayModule> => {
		memo ??= importOverlay();
		const current = memo;
		let mod: TodoOverlayModule;
		try {
			mod = await current;
		} catch (error) {
			// Clear only OUR rejected promise: a late catch from a concurrent
			// awaiter must never clobber a fresh retry another caller installed.
			if (memo === current) memo = undefined;
			throw error;
		}
		if (typeof mod.TodoOverlay !== "function") {
			// Deliberately latched: the memo keeps this resolved-but-poisoned
			// namespace, so every subsequent load re-throws instead of retrying.
			// Re-importing would hand back the same cached jiti namespace — a
			// retry can never heal this; only the restart the error asks for can.
			const keys = JSON.stringify(Object.keys(mod));
			throw new Error(`${STALE_OVERLAY_MESSAGE} (resolved namespace keys: ${keys})`);
		}
		return mod;
	};
}

// Dynamic import keeps `@juicesharp/rpiv-i18n` a soft optional peer: when the
// SDK is installed alongside this package the strings register and
// `/languages` flips them live; when it isn't, the import rejects here, we
// no-op, and the bridge's English-fallback shim keeps the extension online.
//
// The `/loader` subpath is used instead of the SDK entry so the i18n-ui +
// pi-tui modules are not pulled into our load graph just to register strings.
try {
	const sdk = (await import("@juicesharp/rpiv-i18n/loader")) as I18nLoader;
	sdk.registerLocalesFromDir(I18N_NAMESPACE, import.meta.url, { label: "Kimi-style Todo" });
} catch {
	// SDK absent — extension still loads with English-only UI.
}

// pi-core's ExtensionRunner throws this exact phrase from an invalidated ctx
// proxy after session replacement/reload. Match the stable substring so genuine
// replay bugs still propagate instead of being silently swallowed.
function isStaleCtxError(e: unknown): boolean {
	return /stale after session replacement/.test(String(e));
}

/**
 * Format a caught error without depending on unrelated upstream packages.
 */
function formatError(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export default function (pi: ExtensionAPI, importOverlay: TodoOverlayImporter = () => import("./todo-overlay.js")) {
	let todoOverlay: TodoOverlay | undefined;
	const loadTodoOverlay = makeTodoOverlayLoader(importOverlay);
	let uiCtx: ExtensionUIContext | undefined;
	let lifecycleGeneration = 0;
	let prewarmTimer: ReturnType<typeof setTimeout> | undefined;
	const requestedKey = resolveCollapseKey();
	let collapseKey = COLLAPSE_KEY_OFF;
	let shortcutInitialized = false;

	function initializeShortcut(): string | undefined {
		if (shortcutInitialized) return;
		shortcutInitialized = true;
		// The host installs its effective application+editor keybindings before
		// session_start. Register here, before it collects extension shortcuts,
		// rather than guessing application defaults during resource discovery.
		const normalize = (key: string) => key.toLowerCase().split("+").map(k => ({ esc: "escape", return: "enter" } as Record<string, string>)[k] ?? k).sort().join("+");
		const keybindings = getKeybindings() as ReturnType<typeof getKeybindings> & { reload?: () => void };
		// Pi 1.2 reloads keybindings after session_start. Refresh its public
		// manager first so a simultaneous host-key edit cannot leave a hint
		// for a shortcut the host is about to reject. This only reads config.
		keybindings.reload?.();
		if (requestedKey === COLLAPSE_KEY_OFF) return;
		// Different key names can consume the same bytes (Ctrl+I/Tab, Ctrl+M/Enter,
		// Ctrl+[/Esc, Alt+B/Alt+Left). Let the host matcher own protocol/OS rules;
		// probe ASCII/control input and its Alt-prefixed form without changing
		// global keyboard-protocol state or maintaining a second alias table.
		const matchingInputs = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code))
			.flatMap(input => [input, `\x1b${input}`])
			.filter(input => matchesKey(input, requestedKey as KeyId));
		const conflicts = Object.entries(keybindings.getResolvedBindings()).filter(([, keys]) =>
			(typeof keys === "string" ? [keys] : keys ?? []).some(key =>
				normalize(key) === normalize(requestedKey) || matchingInputs.some(input => matchesKey(input, key as KeyId))
			)
		).map(([action]) => action);
		if (conflicts.length) return `TODO shortcut ${requestedKey} disabled: conflicts with ${conflicts.join(", ")}. Set collapseKey in pi-kimi-style-todo/config.json and /reload.`;
		collapseKey = requestedKey;
		pi.registerShortcut(collapseKey as KeyId, {
			description: "Collapse or expand the todo widget",
			handler: (ctx) => {
				if (ctx.mode !== "tui" || !ctx.hasUI || !todoOverlay?.isRegistered() || sid(ctx) !== getActiveRenderSession()) return;
				todoOverlay.toggleCollapse();
			},
		});
	}

	async function updateTodoOverlay(
		resetCompletedDisplayState = false,
		generation = lifecycleGeneration,
	): Promise<void> {
		const hasVisibleTasks = getRenderState().tasks.some((task) => task.status !== "deleted");
		if (!uiCtx || (!todoOverlay && !hasVisibleTasks)) return;

		const { TodoOverlay } = await loadTodoOverlay();
		if (generation !== lifecycleGeneration || !uiCtx) return;

		todoOverlay ??= new TodoOverlay(collapseKey);
		todoOverlay.setUICtx(uiCtx);
		if (resetCompletedDisplayState) todoOverlay.resetCompletedDisplayState();
		todoOverlay.update();
	}

	registerTodoTool(pi);
	registerTodosCommand(pi);

	// Re-key a session's slot from its branch, then refresh the overlay only when
	// the refreshed session IS the foreground. Shared by session_compact and
	// session_tree (verbatim-identical pre-extraction). A stale ctx (auto-compaction
	// races session disposal: pi-core invalidates the runner while still emitting the
	// event, so `ctx` may be a dead proxy whose getters throw) keeps current state —
	// the replacement session's session_start replays it. Other errors are real replay
	// bugs and must propagate. The render is sid-gated so a child never refreshes the
	// foreground overlay.
	const replayAndRefresh = async (
		ctx: Parameters<typeof sid>[0] & Parameters<typeof replayFromBranch>[0],
	): Promise<void> => {
		let isForeground = false;
		try {
			const id = sid(ctx);
			replaceState(id, replayFromBranch(ctx));
			isForeground = id === getActiveRenderSession();
		} catch (e) {
			if (!isStaleCtxError(e)) throw e;
		}
		if (isForeground) await updateTodoOverlay(true);
	};

	pi.on("session_start", async (_event, ctx) => {
		let id: string;
		try {
			id = sid(ctx);
			// Every session replays into its OWN data slot (Phase 1 isolation).
			replaceState(id, replayFromBranch(ctx));
		} catch (e) {
			// Parity with compact/tree/shutdown: session_start is the fresh-ctx event
			// so the stale risk is low, but a stale/throwing ctx has nothing to bind —
			// swallow the known stale error and bail; let real replay bugs propagate.
			if (!isStaleCtxError(e)) throw e;
			return;
		}
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		// First UI-bearing session_start claims the foreground (the interactive
		// launcher, by spawn-ordering) without eagerly loading the overlay.
		if (getActiveRenderSession() === "") setActiveRenderSession(id);
		// Only the foreground re-binds/refreshes the shared overlay. A child
		// (distinct sid) is skipped — does not rebind to a relay/stale ui.
		if (id !== getActiveRenderSession()) return;
		const generation = ++lifecycleGeneration;
		uiCtx = ctx.ui;
		const shortcutDiagnostic = initializeShortcut();
		if (shortcutDiagnostic) ctx.ui.notify(shortcutDiagnostic, "warning");
		prewarmTimer ??= setTimeout(() => void loadTodoOverlay().catch(() => undefined), PREWARM_DELAY_MS);
		prewarmTimer.unref?.();
		await updateTodoOverlay(true, generation);
	});

	pi.on("session_compact", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// Best-effort sid: disposal can race a stale ctx (like compact). An
		// unknown/stale sid resolves to "" and is treated as foreground — the
		// safe pre-isolation default that disposes as before.
		let s: string;
		try {
			s = sid(ctx);
		} catch (e) {
			if (!isStaleCtxError(e)) throw e;
			s = "";
		}
		// The shutting-down session's own data slot is always evicted.
		evictSession(s);
		// Overlay teardown is sid-gated: a child shutdown (distinct sid) must not
		// dispose the foreground's overlay. Only the foreground's own shutdown
		// (or an unknown/stale sid) tears it down and clears the pointer.
		if (s === "" || s === getActiveRenderSession()) {
			// Invalidate pending imports before clearing the foreground binding so a
			// replaced session cannot inherit the stale overlay or UI context.
			lifecycleGeneration++;
			clearTimeout(prewarmTimer);
			prewarmTimer = undefined;
			uiCtx = undefined;
			// `dispose()`'s first act is setWidget(KEY, undefined) on a possibly-stale
			// ui proxy, which can throw. evictSession(s) above already deleted this
			// slot, so leaving `activeRenderSession` pointing at it would resolve
			// getRenderState() to a fresh EMPTY_STATE (overlay silently renders empty).
			// try/finally guarantees the pointer-clear + overlay-drop run regardless.
			try {
				todoOverlay?.dispose();
			} finally {
				todoOverlay = undefined;
				clearActiveRenderSession();
			}
		}
	});

	// Reads getTodos() at render time; do NOT call replayFromBranch here
	// (branch is stale — message_end runs after tool_execution_end).
	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName !== TOOL_NAME || event.isError) return;
		try {
			// Parallel/nested calls may clear and reuse ids before the widget next
			// observes an empty snapshot. Reset display bookkeeping on the event,
			// not only on a decreasing nextId, without changing persisted state.
			if (event.result?.details?.action === "clear" && sid(ctx) === getActiveRenderSession()) {
				todoOverlay?.resetCompletedDisplayState();
			}
			await updateTodoOverlay();
		} catch (e) {
			// The tool itself succeeded — a transient overlay-load failure only
			// costs this one refresh, and the loader's cleared memo lets the next
			// update retry. Don't surface that as an extension error. The latched
			// stale-namespace error still propagates: it never self-heals, and the
			// user needs its restart guidance.
			if (isStaleOverlayModuleError(e)) throw e;
			console.warn(`[pi-kimi-style-todo] overlay refresh failed (will retry on next update): ${formatError(e)}`);
		}
	});

	// Pre-warm is session-scoped, TUI-only and cancelled on foreground shutdown.
	pi.on("agent_start", async (_event, ctx) => {
		if (sid(ctx) === getActiveRenderSession()) todoOverlay?.hideCompletedTasksFromPreviousTurn();
	});
}
