# loop-guard — no-progress guard for the OpenCode agent tool loop

An agent that re-runs the exact same tool call with the exact same arguments
is not making progress — it is looping. `loop-guard` detects that in the
server and refuses the third identical call, injecting a *new* observation
(a `repetition detected` error) so the model changes course instead of
burning turns on a call that already failed twice.

## Install

**Local plugin (recommended):**

```bash
git clone https://github.com/Armanoide/loop-guard ~/.config/opencode/plugins/loop-guard
```

Then add it to `plugins` in `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": [
    "./plugins/loop-guard"
  ]
}
```

Restart OpenCode (a full restart, not `/reload` — see Known limits).

## Options

Pass options through the object form in `opencode.json`:

```jsonc
{
  "plugins": [
    {
      "package": "./plugins/loop-guard",
      "options": { "window": 3, "blockAfter": 2 }
    }
  ]
}
```

| Option | Default | Meaning |
|---|---|---|
| `window` | `3` | Sliding window size — how many recent calls the guard remembers. |
| `blockAfter` | `2` | How many identical prior calls are tolerated before the next one is blocked. `1` = block on the 2nd repeat, `3` = allow two retries and block the third. |

Invalid values (non-integer, zero, negative) fall back to the defaults.

## What it does

- `ctx.tool.hook("execute.after")` — after every **completed** tool call, the
  pair `(tool, canonical arguments)` is hashed into a sliding window of the
  last 3 calls.
- `ctx.tool.hook("execute.before")` — before a tool runs, if the same tool
  with the same arguments is already in the window twice, the guard throws:

  > `repetition detected: <tool> already ran twice with these exact arguments.
  > Retrying identically adds no information — change approach or report the
  > blocker to the user.`

The throw reaches the model as a tool error. That is the point: an identical
result carries no new information for the model to correct against, so the
guard supplies one.

## Provenance

Pattern from particula.tech, "Stop AI Agents Looping on the Same Failed Tool
Call" (2026-06-30): a no-progress guard hashing call tuples and halting at
2–3 repeats. Prompt rules alone do not stop looping; changing what the model
*sees* does.

## Known limits (honest)

- The before-hook cannot see the result of the call about to run, so it keys
  on identical **arguments** seen twice. If the earlier results had differed,
  the agent would already have changed course.
- The window is in-memory per server process: restarting OpenCode clears it.
  Loops live inside one run, so that is acceptable.
- Legitimate polling with identical arguments (waiting for a state to change)
  is blocked on the third attempt. If that ever hurts, whitelist by tool name.
- Requires OpenCode v2 (`ctx.tool.hook` API). On v1 the plugin is ignored.

## Uninstall

Remove `"./plugins/loop-guard"` from `plugins` in `opencode.json`, delete the
cloned directory, restart OpenCode.

## License

MIT
