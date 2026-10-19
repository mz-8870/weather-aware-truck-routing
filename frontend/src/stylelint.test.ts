// @vitest-environment node
import stylelint from "stylelint";
import { expect, test } from "vitest";

const lint = async (code: string) => {
  const { results } = await stylelint.lint({ code, codeFilename: "src/components/X.module.css" });
  return results[0].warnings.map((w) => w.rule);
};

test("stylelint rejects raw colors and px in component styles", async () => {
  const rules = await lint(".a { color: #fff; background: rgb(0 0 0); border-color: red; padding: 4px; }\n");
  expect(rules).toEqual(
    expect.arrayContaining(["color-no-hex", "function-disallowed-list", "color-named", "unit-disallowed-list"]),
  );
});

test("stylelint accepts token vars", async () => {
  expect(await lint(".a { color: var(--color-text-primary); padding: var(--space-4); }\n")).toEqual([]);
});
