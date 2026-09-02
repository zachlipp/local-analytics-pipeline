// Explicit file for semver testing as opposed to other parts of the schema
import { semverRegex } from "@core/schema";
import { describe, test, expect } from "vitest";

describe("semver", () => {
  const cases = [
    { pass: true, inp: "v0.1.0" },
    { pass: true, inp: "1.0.0" },
    { pass: true, inp: "0.0.100" },
    { pass: false, inp: "12" },
    { pass: false, inp: "12.0." },
    { pass: false, inp: "not a version" },
    { pass: true, inp: "v0.1.0-hotfix" },
    { pass: true, inp: "1.0.0-hotfix" },
    { pass: false, inp: "v0.1.0-hotfix-hotfix" },
    { pass: false, inp: "v0.1.0-hotfix.1" },
    { pass: false, inp: "v0.1.0-alpha" },
    { pass: false, inp: "v0.1.0-h1a2b3c" },
    { pass: false, inp: "v0.1.0+build" },
    { pass: false, inp: "v01.1.0" },
  ];
  test.each(cases)("semverRegex.test($inp) === $pass", ({ pass, inp }) => {
    expect(semverRegex.test(inp)).toBe(pass);
  });
});
