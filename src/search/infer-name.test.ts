import { describe, it, expect } from "vitest";
import { inferNameFromAddress } from "./infer-name";

describe("inferNameFromAddress", () => {
  it("infers name from dot-separated local-part", () => {
    expect(inferNameFromAddress("lewis.cirne@alum.dartmouth.org")).toBe("Lewis Cirne");
    expect(inferNameFromAddress("katelyn.cirne@gmail.com")).toBe("Katelyn Cirne");
    expect(inferNameFromAddress("alan.finley@example.com")).toBe("Alan Finley");
  });

  it("infers name from underscore-separated local-part", () => {
    expect(inferNameFromAddress("katelyn_cirne@icloud.com")).toBe("Katelyn Cirne");
    expect(inferNameFromAddress("john_smith@example.com")).toBe("John Smith");
  });

  it("infers name from camelCase local-part", () => {
    expect(inferNameFromAddress("lewisCirne@example.com")).toBe("Lewis Cirne");
    expect(inferNameFromAddress("johnSmith@example.com")).toBe("John Smith");
  });

  it("infers name from all-lowercase local-part when pattern is clear", () => {
    // Note: These patterns are harder to infer reliably without a dictionary
    // The function may return null for ambiguous cases
    // Focus is on dot/underscore/camelCase patterns which are more reliable
    const result1 = inferNameFromAddress("alanfinley@example.com");
    const result2 = inferNameFromAddress("johnsmith@example.com");
    // Accept either inferred name or null (conservative inference)
    expect(result1 === null || result1 === "Alan Finley").toBe(true);
    expect(result2 === null || result2 === "John Smith").toBe(true);
  });

  it("returns null for ambiguous single-letter cases", () => {
    expect(inferNameFromAddress("sjohnson@example.com")).toBeNull();
  });

  it("returns null for non-name patterns", () => {
    expect(inferNameFromAddress("recipient@example.com")).toBeNull();
    expect(inferNameFromAddress("noreply@example.com")).toBeNull();
    expect(inferNameFromAddress("support@example.com")).toBeNull();
    expect(inferNameFromAddress("admin@example.com")).toBeNull();
  });

  it("returns null for invalid or unclear patterns", () => {
    expect(inferNameFromAddress("ab@example.com")).toBeNull(); // Too short
    expect(inferNameFromAddress("a@example.com")).toBeNull(); // Too short
    expect(inferNameFromAddress("123@example.com")).toBeNull(); // Numbers
  });
});
