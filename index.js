// loop-guard — no-progress guard for the OpenCode agent tool loop.
// Blocks a third identical (tool, args) call within a sliding window and
// surfaces a repetition-detected error to the model, so an unchanged
// observation no longer re-executes silently.
// Configurable via plugin options in opencode.json:
//   { "plugins": [{ "package": "./plugins/loop-guard",
//                   "options": { "window": 3, "blockAfter": 2 } }] }
import { createHash } from "node:crypto"

const DEFAULTS = { window: 3, blockAfter: 2 }

function canonical(obj) {
  if (obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(canonical)
  const out = {}
  for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k])
  return out
}

function argsSig(tool, args) {
  return createHash("sha256").update(JSON.stringify({ tool, args: canonical(args ?? {}) })).digest("hex")
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export default {
  id: "loop-guard",
  async setup(ctx) {
    const window = positiveInt(ctx.options?.window, DEFAULTS.window)
    const blockAfter = positiveInt(ctx.options?.blockAfter, DEFAULTS.blockAfter)
    const recent = [] // signatures of completed calls, this server process

    function noteCall(tool, args) {
      recent.push(argsSig(tool, args))
      if (recent.length > window) recent.shift()
    }

    function refuseIfRepeating(tool, args) {
      const sig = argsSig(tool, args)
      if (recent.filter((s) => s === sig).length >= blockAfter) {
        throw new Error(
          `repetition detected: ${tool} already ran ${blockAfter} times with these exact arguments. ` +
            "Retrying identically adds no information — change approach or report the blocker to the user."
        )
      }
    }

    await ctx.tool.hook("execute.after", (event) => {
      if (event.status === "completed") noteCall(event.tool, event.input)
    })
    await ctx.tool.hook("execute.before", (event) => refuseIfRepeating(event.tool, event.input))

    return () => { recent.length = 0 }
  },
}
