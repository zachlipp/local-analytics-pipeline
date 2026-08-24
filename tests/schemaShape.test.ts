import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPipeline } from "@core/pipeline";
import { runPipeline } from "@core/runPipeline";
import { DagSchema, type Dag } from "@core/schema";
import { checkDeclaredColumns, undeclaredColumns } from "@core/shapes";
import type { NodeResult } from "@core/status";
import { nodeEngine, type NodeEngine } from "../src/node/engine";

let engine: NodeEngine;
beforeAll(async () => {
  engine = await nodeEngine();
});
afterAll(() => engine.close());

// Digits all the way down, so sniffing would call it BIGINT. No `year` column:
// the operation downstream is what puts one there.
const NEW_GRANTS = "ein,name,amount\n392075804,Foo,10\n450226714,Bar,20\n";

function dag(): Dag {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    schemas: {
      // Its own shape, not the historic grants' — no `year`, because the
      // operation downstream is what puts one there.
      incoming_grants: {
        ein: "VARCHAR",
        name: "VARCHAR",
        amount: "DOUBLE",
      },
    },
    nodes: {
      incoming_grants: {
        kind: "file",
        schema: "incoming_grants",
        description: "",
      },
      year: { kind: "user_input", description: "" },
      consolidated_grants: { kind: "operation_result", description: "" },
    },
    operations: {
      consolidate: {
        description: "",
        inputs: ["incoming_grants", "year"],
        output: "consolidated_grants",
        query: `SELECT ng.ein, ng.name, ng.amount, year.value::INT AS year
                  FROM incoming_grants ng CROSS JOIN year`,
      },
    },
  }) as Dag;
}

describe("loadCsv with declared types", () => {
  it("types the columns the file has", async () => {
    await engine.loadCsv("typed", NEW_GRANTS, {
      ein: "VARCHAR",
      name: "VARCHAR",
      amount: "DOUBLE",
    });
    const described = await engine.query("DESCRIBE typed");
    expect(described.map((r) => [r.column_name, r.column_type])).toEqual([
      ["ein", "VARCHAR"],
      ["name", "VARCHAR"],
      ["amount", "DOUBLE"],
    ]);
  });

});

describe("undeclared columns", () => {
  const WITH_EXTRAS =
    "ein,name,amount,notes,internal_id\n392075804,Foo,10,hi,7\n";

  it("names the columns the schema left out", () => {
    expect(
      undeclaredColumns({ ein: "VARCHAR", name: "VARCHAR" }, WITH_EXTRAS),
    ).toEqual(["amount", "notes", "internal_id"]);
  });

  it("names none when a node declared no schema", () => {
    expect(undeclaredColumns(undefined, WITH_EXTRAS)).toEqual([]);
  });

  it("leaves them out of the table, in schema order", async () => {
    await engine.loadCsv("dropped", WITH_EXTRAS, {
      amount: "DOUBLE",
      ein: "VARCHAR",
    });
    const described = await engine.query("DESCRIBE dropped");
    expect(described.map((r) => [r.column_name, r.column_type])).toEqual([
      ["amount", "DOUBLE"],
      ["ein", "VARCHAR"],
    ]);
  });

  it("reports them on the node, without failing the run", async () => {
    const parsed = dag();
    const results: Record<string, NodeResult> = {
      [parsed.nodes.incoming_grants.id]: {
        file: { name: "new.csv", text: WITH_EXTRAS },
      },
      [parsed.nodes.year.id]: { value: "2026" },
    };

    const patches: Record<string, NodeResult> = {};
    const outcome = await runPipeline(
      engine,
      buildPipeline(parsed),
      parsed,
      results,
      (id, patch) => (patches[id] = { ...patches[id], ...patch }),
      "consolidated_grants",
    );

    expect(outcome).toMatchObject({ ok: true });
    const patch = patches[parsed.nodes.incoming_grants.id];
    expect(patch.dropped).toEqual(["notes", "internal_id"]);
    expect(patch.error).toBeUndefined();
  });
});

describe("checkDeclaredColumns", () => {
  it("passes a CSV carrying every declared column", () => {
    expect(
      checkDeclaredColumns("incoming_grants", { ein: "VARCHAR" }, NEW_GRANTS),
    ).toBeUndefined();
  });

  it("says nothing about a node that declared no shape", () => {
    expect(checkDeclaredColumns("loose", undefined, "a,b\n1,2\n")).toBeUndefined();
  });

  it("names the one column a CSV is missing, and what it has", () => {
    expect(
      checkDeclaredColumns(
        "incoming_grants",
        { ein: "VARCHAR", year: "INTEGER" },
        NEW_GRANTS,
      ),
    ).toBe(
      "“incoming_grants” needs a column called “year”. The columns it has are “ein”, “name”, and “amount”.",
    );
  });

  it("lists several missing columns", () => {
    expect(
      checkDeclaredColumns(
        "incoming_grants",
        { ein: "VARCHAR", year: "INTEGER", is_active: "BOOLEAN" },
        NEW_GRANTS,
      ),
    ).toBe(
      "“incoming_grants” needs these columns: “year” and “is_active”. The columns it has are “ein”, “name”, and “amount”.",
    );
  });

  it("says so when there are no columns at all", () => {
    expect(checkDeclaredColumns("empty", { ein: "VARCHAR" }, "")).toBe(
      "“empty” needs a column called “ein”. It has no columns at all.",
    );
  });
});

describe("a file that does not match its schema", () => {
  it("fails the run with the node named", async () => {
    const parsed = dag();
    parsed.schemas.incoming_grants.year = "INTEGER";
    const results: Record<string, NodeResult> = {
      [parsed.nodes.incoming_grants.id]: {
        file: { name: "new.csv", text: NEW_GRANTS },
      },
      [parsed.nodes.year.id]: { value: "2026" },
    };

    const outcome = await runPipeline(
      engine,
      buildPipeline(parsed),
      parsed,
      results,
      () => {},
      "consolidated_grants",
    );

    expect(outcome).toMatchObject({
      ok: false,
      failed: "incoming_grants",
    });
    expect((outcome as { error: string }).error).toContain(
      "needs a column called “year”",
    );
  });
});

describe("running a target", () => {
  it("does not fail an upstream file node whose schema names columns it lacks", async () => {
    const parsed = dag();
    const pipeline = buildPipeline(parsed);
    const results: Record<string, NodeResult> = {
      [parsed.nodes.incoming_grants.id]: {
        file: { name: "new.csv", text: NEW_GRANTS },
      },
      [parsed.nodes.year.id]: { value: "2026" },
    };

    const patches: Record<string, NodeResult> = {};
    const report = (id: string, patch: NodeResult) => {
      patches[id] = { ...patches[id], ...patch };
    };

    const outcome = await runPipeline(
      engine,
      pipeline,
      parsed,
      results,
      report,
      "consolidated_grants",
    );

    expect(outcome).toMatchObject({ ok: true });
    expect(patches[parsed.nodes.incoming_grants.id].error).toBeUndefined();

    const [row] = await engine.query(
      "SELECT typeof(ein) AS ein_type, typeof(year) AS year_type FROM consolidated_grants LIMIT 1",
    );
    expect(row.ein_type).toBe("VARCHAR");
    expect(row.year_type).toBe("INTEGER");
  });
});
