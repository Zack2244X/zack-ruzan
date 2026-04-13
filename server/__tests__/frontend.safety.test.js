/**
 * @file Frontend safety baseline tests
 * Static checks to prevent regression of unsafe HTML rendering in quiz review paths.
 */
const fs = require("fs");
const path = require("path");

describe("Frontend safety checks", () => {
  test("quiz review should escape dynamic question/hint text", () => {
    const filePath = path.join(__dirname, "../../client/js/modules/quiz.js");
    const src = fs.readFileSync(filePath, "utf8");

    expect(src.includes("sanitizeHTML(currentQ.question)")).toBe(true);
    expect(src.includes("sanitizeHTML(currentQ.hint)")).toBe(true);
  });
});
