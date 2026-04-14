import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { showAlertMock } = vi.hoisted(() => ({
  showAlertMock: vi.fn(),
}));

vi.mock("../js/modules/helpers.js", () => ({
  escapeHtml: (value) => String(value),
  showAlert: showAlertMock,
  logFunctionStatus: vi.fn(),
}));

vi.mock("../js/utils/logger.js", () => ({
  default: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../js/modules/state.js", () => ({
  default: {
    allNotes: [],
    editingNoteIndex: -1,
    currentViewMode: "notes",
  },
}));

vi.mock("../js/utils/sanitize.js", () => ({
  sanitizeHTML: (value) => String(value),
}));

vi.mock("../js/modules/api.js", () => ({
  apiCall: vi.fn(),
}));

vi.mock("../js/modules/navigation.js", () => ({
  _showThemeToggle: vi.fn(),
}));

import { forceDownload } from "../js/modules/notes.js";

describe("forceDownload security behavior", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    showAlertMock.mockReset();
    // jsdom logs navigation as not implemented when location.assign is called.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("rejects non-http(s) URLs", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("javascript:alert(1)");

    expect(showAlertMock).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("rejects malformed URLs", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("not a valid url@@@");

    expect(showAlertMock).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("rejects URLs containing embedded credentials", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("https://user:pass@example.com/file.pdf");

    expect(showAlertMock).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("navigates without opening a new popup window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("https://example.com/file.pdf");

    expect(openSpy).not.toHaveBeenCalled();
    expect(showAlertMock).toHaveBeenCalledTimes(0);
    openSpy.mockRestore();
  });

  it("accepts Google Drive links after transformation path", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("https://drive.google.com/file/d/abc123DEF_-/view?usp=sharing");

    expect(openSpy).not.toHaveBeenCalled();
    expect(showAlertMock).toHaveBeenCalledTimes(0);
    openSpy.mockRestore();
  });

  it("accepts SharePoint links after transformation path", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("https://contoso.sharepoint.com/:b:/s/team/AbCdEfGhIjKlMn?e=xyz");

    expect(openSpy).not.toHaveBeenCalled();
    expect(showAlertMock).toHaveBeenCalledTimes(0);
    openSpy.mockRestore();
  });

  it("accepts OneDrive links after transformation path", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    forceDownload("https://1drv.ms/b/s!AexampleToken");

    expect(openSpy).not.toHaveBeenCalled();
    expect(showAlertMock).toHaveBeenCalledTimes(0);
    openSpy.mockRestore();
  });
});
