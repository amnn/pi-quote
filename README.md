# pi-quote

A small [Pi](https://pi.dev) extension for replying with context. Press
`Ctrl+Q` to append the latest assistant message to the current input as a
Markdown block quote, then type your reply underneath it.

```md
> The cache should use a 24-hour TTL.
>
> Refresh the TTL on every read.

Wouldn't refreshing on reads prevent active users from ever expiring?
```

## Installation

Install the published package from npm (recommended):

```bash
pi install npm:pi-quote
```

Alternatively, install the latest source directly from GitHub:

```bash
pi install git:github.com/amnn/pi-quote
```

To install from a local checkout:

```bash
git clone https://github.com/amnn/pi-quote.git
cd pi-quote
pnpm install
pi install .
```

Confirm the installation with `pi list`. After installing an update or changing
a local checkout, run `/reload` in Pi or restart it.

## Features

- `C-q` quote the latest assistant message
- `M-q` pick an assistant message from the session tree to quote

`pi-quote` is intentionally TUI-only because it reads and updates Pi's
interactive editor. Quote actions are unavailable in RPC, JSON, and print
modes.

## Usage

| Action               | Shortcut | Command                     |
| -------------------- | -------- | --------------------------- |
| Quote latest message | `C-q`    | `/quote` or `/quote latest` |
| Pick a past message  | `M-q`    | `/quote pick`               |
| Quote by recency     | —        | `/quote 1`, `/quote 2`, …   |

Numbers are newest-first among visible assistant messages on the active branch:
`1` is the latest message and `2` is the message before it. The history picker
shows Pi's full session tree, so it can also quote a message from another
branch.

Each assistant session entry is quoted independently. Thinking blocks, tool
call payloads, and tool results are excluded. Run the picker again to append
another entry.

## Related extensions

The Pi package ecosystem already has richer tools for commenting on responses:

- [`pi-reply`][pi-reply] — browser workspace for selecting multiple snippets
  and writing replies
- [`pi-annotations`][pi-annotations] — TUI overlay for line-span annotations
  on the latest message
- [`@plannotator/pi-extension`][plannotator] — full browser-based plan, diff,
  and message review; `/plannotator-last` can switch among recent messages
- [`@xl0/pi-lovely-comment`][lovely-comment] — opens the latest response in an
  external editor and syncs the draft back

Those are good choices for detailed multi-point review. `pi-quote` is
intentionally narrower: one key, a Markdown quote in the existing Pi editor,
and no browser or external editor.

[pi-reply]: https://github.com/chronoAP/pi-reply
[pi-annotations]: https://github.com/patelparth3/pi-annotations
[plannotator]: https://github.com/backnotprop/plannotator
[lovely-comment]: https://github.com/xl0/agent-files

## Development

Development requires Node.js 22.19 or newer and pnpm. The repository's
`packageManager` field pins the pnpm version and lets pnpm download it when
necessary.

```sh
pnpm install
pnpm check
```

The full check verifies formatting, type-checks the package, runs the tests,
smoke-tests extension loading without a model request, and audits dependencies.
To check or apply formatting separately:

```sh
pnpm format:check
pnpm format
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
