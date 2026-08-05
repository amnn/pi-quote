// Copyright (c) Ashok Menon
// SPDX-License-Identifier: Apache-2.0

import {
  type ExtensionAPI,
  type ExtensionContext,
  type SessionEntry,
  TreeSelectorComponent,
} from "@earendil-works/pi-coding-agent";

const QUOTE_USAGE = "Usage: /quote [latest | pick | <number>]";

/** A parsed `/quote` command argument. Numeric indexes are zero-based. */
export type QuoteCommand =
  | { kind: "latest" }
  | { kind: "pick" }
  | { kind: "index"; index: number }
  | { kind: "help" }
  | { kind: "invalid" };

/**
 * Appends the quoteable entry at a recency index.
 *
 * @param ctx - The extension context providing the active branch and editor.
 * @param index - Zero-based index among quoteable entries, where zero is the
 * newest entry on the active branch.
 *
 * @remarks `index` is expected to be a non-negative safe integer. Entries that
 * do not contain messages or contain no visible text do not consume an index.
 * This function enforces the TUI-only invariant before editing.
 */
function appendAtIndex(ctx: ExtensionContext, index: number): void {
  if (!requireTui(ctx)) return;

  let i = 0;
  for (const entry of entries(ctx)) {
    const text = message(entry);
    if (!text) continue;

    if (i === index) {
      appendQuote(ctx, text);
      return;
    }

    i += 1;
  }

  if (i === 0) {
    notifyNoAssistantEntries(ctx);
  } else {
    ctx.ui.notify(`Message ${index + 1} is unavailable.`, "warning");
  }
}

/**
 * Formats text as a Markdown block quote and appends it to editor content.
 *
 * @param existing - Existing editor content. Trailing whitespace is normalized
 * before the quote is appended.
 * @param text - Non-empty text to format as a Markdown block quote.
 * @returns The combined editor content with one blank line before the quote and
 * one blank line after it.
 *
 * @remarks CRLF and CR line endings in `text` are normalized to LF. Every quote
 * line starts with `>` and the returned string ends with exactly two LF
 * characters. Callers provide non-empty quote text.
 */
export function appendBlockquote(existing: string, text: string): string {
  const trim = existing.trimEnd();
  const quote = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");

  return trim ? `${trim}\n\n${quote}\n\n` : `${quote}\n\n`;
}

/**
 * Appends already-resolved text to Pi's interactive editor as a block quote.
 *
 * @param ctx - A TUI extension context with access to the interactive editor.
 * @param text - Non-empty visible text from an assistant session entry.
 *
 * @remarks The caller must establish the TUI-only invariant and validate that
 * `text` is quoteable before calling this function.
 */
function appendQuote(ctx: ExtensionContext, text: string): void {
  ctx.ui.setEditorText(appendBlockquote(ctx.ui.getEditorText(), text));
}

/**
 * Walks the active session branch from its current leaf toward the root.
 *
 * @param ctx - The extension context whose active branch should be traversed.
 * @returns A generator yielding session entries newest-first.
 *
 * @remarks The session manager guarantees stable IDs and an acyclic parent
 * chain. Each active-branch entry is therefore yielded at most once.
 */
function* entries(ctx: ExtensionContext): Generator<SessionEntry> {
  let entry = ctx.sessionManager.getLeafEntry();

  while (entry) {
    yield entry;
    entry = entry.parentId
      ? ctx.sessionManager.getEntry(entry.parentId)
      : undefined;
  }
}

/**
 * Extracts visible text from an assistant session entry.
 *
 * @param entry - A session entry to inspect.
 * @returns Visible assistant text, or `undefined` when the entry is not an
 * assistant message or has no text content.
 *
 * @remarks Thinking blocks and tool calls are never included. Multiple text
 * blocks within one session entry are joined with a blank line. The returned
 * text is trimmed and therefore always non-empty.
 */
function message(entry: SessionEntry): string | undefined {
  if (entry.type !== "message") {
    return undefined;
  }

  if (
    entry.message.role === "branchSummary" ||
    entry.message.role === "compactionSummary"
  ) {
    return entry.message.summary;
  }

  if (entry.message.role === "bashExecution") {
    return entry.message.output;
  }

  if (typeof entry.message.content === "string") {
    return entry.message.content;
  }

  const text = entry.message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();

  return text ? text : undefined;
}

/**
 * Notifies the user that the active branch has no quoteable assistant entries.
 *
 * @param ctx - The extension context used to display the warning.
 *
 * @remarks Callers use this only after exhausting the relevant branch or after
 * finding an empty session tree.
 */
function notifyNoAssistantEntries(ctx: ExtensionContext): void {
  ctx.ui.notify(
    "No assistant message with text exists on the current branch.",
    "warning",
  );
}

/**
 * Parses raw `/quote` arguments into a command variant.
 *
 * @param args - Raw text following `/quote`, or `undefined` when omitted.
 * @returns A command variant for latest, picker, zero-based numeric index, help,
 * or invalid input.
 *
 * @remarks Empty input aliases `latest`. Numeric input must be a positive,
 * base-10 safe integer; the returned index is always zero-based.
 */
export function parseQuoteCommand(args: string | undefined): QuoteCommand {
  const value = (args ?? "").trim().toLowerCase();

  if (!value || value === "latest") {
    return { kind: "latest" };
  }

  if (value === "pick") {
    return { kind: "pick" };
  }

  if (value === "help" || value === "-h" || value === "--help") {
    return { kind: "help" };
  }

  if (/^[1-9]\d*$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) {
      return { kind: "index", index: number - 1 };
    }
  }

  return { kind: "invalid" };
}

/**
 * Ensures a quote action runs only in Pi's interactive TUI mode.
 *
 * @param ctx - The extension context whose mode should be checked.
 * @returns `true` in TUI mode; otherwise `false` after issuing a warning.
 *
 * @remarks All editor-mutating and custom-component paths call this guard before
 * accessing TUI-only behavior.
 */
function requireTui(ctx: ExtensionContext): boolean {
  if (ctx.mode === "tui") return true;
  ctx.ui.notify("pi-quote is only available in TUI mode.", "warning");
  return false;
}

export default function (pi: ExtensionAPI): void {
  var open = false;
  const pickEntry = async (ctx: ExtensionContext) => {
    if (!requireTui(ctx) || open) return;
    open = true;

    try {
      const tree = ctx.sessionManager.getTree();
      const leaf = ctx.sessionManager.getLeafId();

      if (tree.length === 0) {
        notifyNoAssistantEntries(ctx);
        return;
      }

      const text: string | undefined = await ctx.ui.custom(
        (tui, _theme, _keybindings, done) =>
          new TreeSelectorComponent(
            tree,
            leaf,
            tui.terminal.rows,
            (id) => {
              const entry = ctx.sessionManager.getEntry(id);
              if (!entry) {
                ctx.ui.notify("Entry not found.", "warning");
                tui.requestRender();
                return;
              }

              const text = message(entry);
              if (!text) {
                ctx.ui.notify("No message in this entry.", "warning");
                tui.requestRender();
                return;
              }

              done(text);
            },
            () => done(undefined),
            pi.setLabel,
          ),
      );

      if (text) appendQuote(ctx, text);
    } finally {
      open = false;
    }
  };

  pi.registerCommand("quote", {
    description: "Quote an assistant message into the editor",

    getArgumentCompletions: (prefix) => {
      const values = [
        {
          value: "latest",
          label: "latest",
          description: "Quote the latest assistant message",
        },
        {
          value: "pick",
          label: "pick",
          description: "Choose an assistant message from history",
        },
      ];

      const normalizedPrefix = prefix.toLowerCase();
      const matches = values.filter(({ value }) =>
        value.startsWith(normalizedPrefix),
      );

      return matches.length > 0 ? matches : null;
    },

    handler: async (args, ctx) => {
      const command = parseQuoteCommand(args);

      switch (command.kind) {
        case "latest":
          appendAtIndex(ctx, 0);
          return;
        case "pick":
          await pickEntry(ctx);
          return;
        case "index":
          appendAtIndex(ctx, command.index);
          return;
        case "help":
          ctx.ui.notify(QUOTE_USAGE, "info");
          return;
        case "invalid":
          ctx.ui.notify(QUOTE_USAGE, "warning");
      }
    },
  });

  pi.registerShortcut("ctrl+q", {
    description: "Quote the latest assistant message",
    handler: (ctx) => appendAtIndex(ctx, 0),
  });

  pi.registerShortcut("alt+q", {
    description: "Choose an assistant message to quote",
    handler: pickEntry,
  });
}
