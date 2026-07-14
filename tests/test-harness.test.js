import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs ESM tests in happy-dom", () => {
    expect(document.createElement("div")).toBeInstanceOf(HTMLDivElement);
  });
});
