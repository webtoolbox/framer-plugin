import { describe, expect, it, vi } from "vitest"
import { installEmbed } from "./installEmbed.ts"

const CODE = '<script src="https://acme.websitetoolbox.com/js/mb/embed.js"></script>'

describe("installEmbed — Add to site with a clipboard fallback", () => {
  it("installs when Framer accepts the custom code", async () => {
    const install = vi.fn().mockResolvedValue(undefined)
    const copy = vi.fn().mockResolvedValue(undefined)
    const r = await installEmbed(CODE, install, copy)
    expect(r).toEqual({ status: "installed" })
    expect(install).toHaveBeenCalledWith(CODE)
    expect(copy).not.toHaveBeenCalled()
  })

  it("copies the snippet when the install is refused (paid-plan / permission gate)", async () => {
    const install = vi.fn().mockRejectedValue(new Error("Insufficient permissions, you need Design or Content"))
    const copy = vi.fn().mockResolvedValue(undefined)
    const r = await installEmbed(CODE, install, copy)
    expect(r).toEqual({
      status: "copied",
      reason: "Insufficient permissions, you need Design or Content",
    })
    expect(copy).toHaveBeenCalledWith(CODE)
  })

  it("reports the install failure when the clipboard is unavailable too", async () => {
    const install = vi.fn().mockRejectedValue(new Error("Insufficient permissions"))
    const copy = vi.fn().mockRejectedValue(new Error("Write permission denied"))
    const r = await installEmbed(CODE, install, copy)
    expect(r).toEqual({ status: "failed", reason: "Insufficient permissions" })
  })

  it("surfaces a non-Error rejection as its string form", async () => {
    const install = vi.fn().mockRejectedValue("nope")
    const copy = vi.fn().mockResolvedValue(undefined)
    const r = await installEmbed(CODE, install, copy)
    expect(r).toEqual({ status: "copied", reason: "nope" })
  })
})
