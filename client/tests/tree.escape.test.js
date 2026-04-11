import { describe, it, expect } from "vitest";
import { escapeHtml } from "../js/modules/helpers.js";

describe("tree rendering safety", () => {
  it("escapes user-controlled HTML before render", () => {
    const payload = "<img src=x onerror=alert('xss')>";
    const escaped = escapeHtml(payload);

    expect(escaped).toContain("&lt;img");
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("onerror=");
    expect(escaped).not.toContain(">");
  });
});
