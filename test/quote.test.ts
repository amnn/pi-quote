import assert from "node:assert/strict";
import test from "node:test";

import {
  type ExtensionAPI,
  type ExtensionContext,
  initTheme,
} from "@earendil-works/pi-coding-agent";

import extension, {
  appendBlockquote,
  parseQuoteCommand,
} from "../src/index.ts";

type Command = {
  handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
};

type Shortcut = {
  handler: (ctx: ExtensionContext) => Promise<void> | void;
};

const entry = (
  id: string,
  parentId: string | null,
  role: string,
  content: unknown,
) => ({
  type: "message",
  id,
  parentId,
  message: { role, content },
});

const user = (id: string, parent: string | null, content: unknown) =>
  entry(id, parent, "user", content);
const reply = (id: string, parent: string | null, content: unknown) =>
  entry(id, parent, "assistant", content);
const tool = (id: string, parent: string | null, content: unknown) =>
  entry(id, parent, "toolResult", content);

test("appends a quote without replacing existing editor text", () => {
  assert.equal(appendBlockquote("", "Answer"), "> Answer\n\n");

  assert.equal(
    appendBlockquote("My preface", "Line one\n\nLine two"),
    "My preface\n\n> Line one\n>\n> Line two\n\n",
  );

  assert.equal(
    appendBlockquote("Already one newline\n", "Answer"),
    "Already one newline\n\n> Answer\n\n",
  );

  assert.equal(
    appendBlockquote("Already spaced\n\n", "Answer"),
    "Already spaced\n\n> Answer\n\n",
  );
});

test("parses latest, picker, and newest-first numeric commands", () => {
  assert.deepEqual(parseQuoteCommand(undefined), { kind: "latest" });
  assert.deepEqual(parseQuoteCommand(" latest "), { kind: "latest" });
  assert.deepEqual(parseQuoteCommand("pick"), { kind: "pick" });
  assert.deepEqual(parseQuoteCommand("2"), { kind: "index", index: 1 });
  assert.deepEqual(parseQuoteCommand("0"), { kind: "invalid" });
  assert.deepEqual(parseQuoteCommand("wat"), { kind: "invalid" });
  assert.deepEqual(parseQuoteCommand("--help"), { kind: "help" });
});

test("latest and numeric selection quote independent assistant entries", async () => {
  const cmds = new Map<string, Command>();
  const keys = new Map<string, Shortcut>();

  const api = {
    registerCommand(name: string, options: unknown) {
      cmds.set(name, options as Command);
    },

    registerShortcut(key: string, options: unknown) {
      keys.set(key, options as Shortcut);
    },
  };

  extension(api as unknown as ExtensionAPI);

  assert.deepEqual([...keys.keys()], ["ctrl+q", "alt+q"]);
  assert.ok(cmds.has("quote"));

  let editor = "Draft";
  const notifications: Array<[string, string | undefined]> = [];

  const branch = [
    user("u1", null, "First question"),
    reply("a1", "u1", [
      { type: "text", text: "First answer" },
      { type: "thinking", thinking: "private" },
      { type: "toolCall", id: "call-1", name: "read" },
    ]),
    tool("t1", "a1", [{ type: "text", text: "tool output" }]),
    reply("a-tool", "t1", [{ type: "toolCall", id: "call-2" }]),
    tool("t2", "a-tool", [{ type: "text", text: "more output" }]),
    reply("a1b", "t2", [{ type: "text", text: "Follow-up answer" }]),
    user("u2", "a1b", "Second question"),
    reply("a2", "u2", [{ type: "text", text: "Second answer" }]),
  ];

  const lookups: string[] = [];
  const ctx = {
    mode: "tui",
    sessionManager: {
      getLeafEntry: () => branch.at(-1),
      getEntry: (entry: string) => {
        lookups.push(entry);
        return branch.find(({ id }) => id === entry);
      },
    },
    ui: {
      getEditorText: () => editor,
      setEditorText: (value: string) => {
        editor = value;
      },
      notify: (message: string, level?: string) => {
        notifications.push([message, level]);
      },
    },
  } as unknown as ExtensionContext;

  await keys.get("ctrl+q")!.handler(ctx);
  assert.equal(editor, "Draft\n\n> Second answer\n\n");
  assert.deepEqual(lookups, []);

  lookups.length = 0;
  editor = "";
  await cmds.get("quote")!.handler("2", ctx);
  assert.equal(editor, "> Second question\n\n");

  editor = "";
  await cmds.get("quote")!.handler("3", ctx);
  assert.equal(editor, "> Follow-up answer\n\n");
  assert.deepEqual(notifications, []);

  ctx.mode = "rpc";
  editor = "Draft";
  await cmds.get("quote")!.handler("latest", ctx);
  assert.equal(editor, "Draft");
  assert.deepEqual(notifications, [
    ["pi-quote is only available in TUI mode.", "warning"],
  ]);
});

test("the session tree rejects an entry without a message", async () => {
  initTheme("dark");
  const keys = new Map<string, Shortcut>();

  const api = {
    registerCommand() {},
    registerShortcut(key: string, options: unknown) {
      keys.set(key, options as Shortcut);
    },
  };

  extension(api as unknown as ExtensionAPI);

  let editor = "";
  const notifications: string[] = [];

  const branch = [
    user("u1", null, "First question"),
    reply("a1", "u1", [{ type: "text", text: "First fragment" }]),
    tool("t1", "a1", [{ type: "text", text: "tool output" }]),
    user("u2", "t1", "Second question"),
    {
      type: "message",
      id: "a1b",
      parentId: "u2",
      message: {
        role: "assistant",
        content: [],
        stopReason: "aborted",
      },
    },
    reply("a2", "a1b", [{ type: "text", text: "Second answer" }]),
  ];

  let tree: any;
  for (const entry of [...branch].reverse()) {
    tree = [{ entry, children: tree ?? [] }];
  }

  const ctx = {
    mode: "tui",
    sessionManager: {
      getLeafEntry: () => branch.at(-1),
      getEntry: (entry: string) => branch.find(({ id }) => id === entry),
      getLeafId: () => branch.at(-1)!.id,
      getTree: () => tree,
    },

    ui: {
      getEditorText: () => editor,
      setEditorText: (value: string) => {
        editor = value;
      },

      notify(message: string) {
        notifications.push(message);
      },

      custom: async (factory: (...args: any[]) => any) =>
        await new Promise<unknown>((resolve) => {
          const ui = factory(
            { terminal: { rows: 24 }, requestRender() {} },
            {},
            {},
            resolve,
          );

          assert.equal(ui.constructor.name, "TreeSelectorComponent");

          ui.handleInput("\x1b[A");
          ui.handleInput("\r");
          ui.handleInput("\x1b[A");
          ui.handleInput("\r");
        }),
    },
  } as unknown as ExtensionContext;

  await keys.get("alt+q")!.handler(ctx);
  assert.equal(editor, "> Second question\n\n");
  assert.deepEqual(notifications, ["No message in this entry."]);
});
