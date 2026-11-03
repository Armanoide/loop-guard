// loop-guard — no-progress guard for the agent tool loop.
// V2 shape: default export = { id, setup(ctx) }.
// After each call: hash (tool, canonical args) into a window of 3.
// Before each call: identical tool+args already seen twice = no new
// information entering the loop -> throw "repetition detected" so the model
// reads a NEW observation instead of re-running blindly.
import { createHash } from "node:crypto"

const WINDOW = 3
const recent = [] // signatures of completed calls, this server process

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

function noteCall(tool, args) {
  recent.push(argsSig(tool, args))
  if (recent.length > WINDOW) recent.shift()
}

function refuseIfRepeating(tool, args) {
  const sig = argsSig(tool, args)
  if (recent.filter((s) => s === sig).length >= 2) {
    throw new Error(
      `repetition detected: ${tool} already ran twice with these exact arguments. ` +
        "Retrying identically adds no information — change approach or report the blocker to the user."
    )
  }
}

export default {
  id: "loop-guard",
  async setup(ctx) {
    await ctx.tool.hook("execute.after", (event) => {
      if (event.status === "completed") noteCall(event.tool, event.input)
    })
    await ctx.tool.hook("execute.before", (event) => refuseIfRepeating(event.tool, event.input))
    return () => { recent.length = 0 }
  },
}
