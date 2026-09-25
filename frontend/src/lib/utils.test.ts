import { describe, expect, it } from "vitest";
import { formatSalary, hostFromUrl, initials, parseDate, pluralize, titleCase } from "./utils";

describe("parseDate", () => {
  it("treats naive API timestamps as UTC", () => {
    expect(parseDate("2026-09-24T20:45:00")?.toISOString()).toBe("2026-09-24T20:45:00.000Z");
  });
  it("keeps explicit offsets", () => {
    expect(parseDate("2026-09-24T20:45:00+02:00")?.toISOString()).toBe("2026-09-24T18:45:00.000Z");
  });
  it("returns null for empty or invalid input", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("formatSalary", () => {
  it("formats yearly ranges compactly", () => {
    expect(formatSalary(55000, 70000, "yearly", "CAD")).toMatch(/55k.*70k\/yr/);
  });
  it("formats hourly single values", () => {
    expect(formatSalary(25, null, "hourly", "CAD")).toMatch(/25\/hr$/);
  });
  it("returns null when no salary is listed", () => {
    expect(formatSalary(null, null, null, null)).toBeNull();
  });
});

describe("string helpers", () => {
  it("initials", () => expect(initials("Mit Patel")).toBe("MP"));
  it("pluralize", () => {
    expect(pluralize(1, "job")).toBe("1 job");
    expect(pluralize(3, "job")).toBe("3 jobs");
  });
  it("titleCase", () => expect(titleCase("full_time")).toBe("Full Time"));
  it("hostFromUrl", () => {
    expect(hostFromUrl("https://www.example.com/jobs/1")).toBe("example.com");
    expect(hostFromUrl("nope")).toBeNull();
  });
});
