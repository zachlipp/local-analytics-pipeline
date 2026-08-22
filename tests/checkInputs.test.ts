import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { checkInputs, compareInputs, type InputProblem } from "@core/checkInputs";
import type { TableReference } from "@core/references";
import { DagSchema, type Dag, type Operation } from "@core/schema";

const FIXTURES: Record<string, { sql: string; ast: unknown }> = JSON.parse(
  readFileSync(new URL("./fixtures/asts.json", import.meta.url), "utf8"),
);

function dagOf(nodeNames: string[], operations: Record<string, unknown>): Dag {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    nodes: Object.fromEntries(
      nodeNames.map((name) => [
        name,
        { kind: "operation_result", description: name },
      ]),
    ),
    operations,
  });
}

function operationOf(inputs: string[], output: string): Operation {
  return { id: crypto.randomUUID(), description: "", inputs, query: "", output };
}

function refs(...names: string[]): TableReference[] {
  return names.map((name) => ({ name }));
}

function kinds(problems: InputProblem[]): string[] {
  return problems.map((problem) => problem.kind).sort();
}

describe("agreement between declared inputs and the query", () => {
  const dag = dagOf(["orgs", "grants", "out"], {});

  test("matching inputs and references are silent", () => {
    const operation = operationOf(["orgs", "grants"], "out");
    expect(compareInputs("op", operation, dag, refs("orgs", "grants"))).toEqual([]);
  });

  test("B: a table the query reads but never declares", () => {
    const operation = operationOf(["orgs"], "out");
    const [problem] = compareInputs("op", operation, dag, refs("orgs", "grants"));
    expect(problem.kind).toBe("undeclared");
    expect(problem.message).toContain("“grants”");
  });

  test("B: a reference matching no node at all reads differently", () => {
    const operation = operationOf(["orgs"], "out");
    const [problem] = compareInputs("op", operation, dag, refs("orgs", "nowhere"));
    expect(problem.kind).toBe("unknown_node");
    expect(problem.message).toContain("not a node in this pipeline");
  });

  test("C: a declared input the query never reads", () => {
    const operation = operationOf(["orgs", "grants"], "out");
    const [problem] = compareInputs("op", operation, dag, refs("orgs"));
    expect(problem.kind).toBe("unused");
    expect(problem.message).toContain("“grants”");
  });

  test("C: several unused inputs are reported as one fix", () => {
    const operation = operationOf(["orgs", "grants"], "out");
    const problems = compareInputs("op", operation, dag, []);
    expect(problems.filter((p) => p.kind === "unused")).toHaveLength(1);
  });

  test("B and C fire independently on the same operation", () => {
    const operation = operationOf(["orgs"], "out");
    expect(kinds(compareInputs("op", operation, dag, refs("grants")))).toEqual([
      "undeclared",
      "unused",
    ]);
  });

  test("reading its own output is a cycle, not an undeclared input", () => {
    const operation = operationOf(["orgs"], "out");
    const problems = compareInputs("op", operation, dag, refs("orgs", "out"));
    expect(kinds(problems)).toEqual(["self_reference"]);
  });

  test("a schema-qualified name is rejected", () => {
    const operation = operationOf(["orgs"], "out");
    const problems = compareInputs("op", operation, dag, [
      { name: "orgs", qualifier: "main" },
    ]);
    expect(kinds(problems)).toEqual(["qualified", "unused"]);
  });
});

describe("checkInputs over a whole dag", () => {
  const parse = async (sql: string) => {
    const found = Object.values(FIXTURES).find((f) => f.sql === sql);
    if (!found) throw new Error(`No fixture for ${sql}`);
    return found.ast;
  };

  test("a CTE is not mistaken for a missing input", async () => {
    const dag = dagOf(["grants", "out"], {
      op: { description: "", inputs: ["grants"], query: FIXTURES.cte_body.sql, output: "out" },
    });
    expect(await checkInputs(dag, parse)).toEqual([]);
  });

  test("unparsable SQL is reported against its operation", async () => {
    const dag = dagOf(["a", "b", "out"], {
      op: { description: "", inputs: ["a", "b"], query: FIXTURES.broken.sql, output: "out" },
    });
    const [problem] = await checkInputs(dag, parse);
    expect(problem.kind).toBe("unparsable");
    expect(problem.message).toContain("WHERE");
  });
});

describe("a parse function that throws instead of returning an envelope", () => {
  test("is reported, not propagated", async () => {
    const dag = dagOf(["a", "out"], {
      op: { description: "", inputs: ["a"], query: "SELECT nope FROM", output: "out" },
    });
    const throwing = async () => {
      throw new Error("parser error: syntax error at end of input");
    };
    const [problem] = await checkInputs(dag, throwing);
    expect(problem.kind).toBe("unparsable");
    expect(problem.message).toContain("syntax error");
  });
});
