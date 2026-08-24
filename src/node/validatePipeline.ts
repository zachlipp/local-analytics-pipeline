import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  checkInputs,
  type InputProblem,
  type ProblemKind,
} from "@core/checkInputs";
import { checkReads, type ReadProblem } from "@core/checkReads";
import { buildPipeline } from "@core/pipeline";
import { DagSchema } from "@core/schema";
import { checkSchemas, type SchemaError } from "@core/schemaErrors";
import { materializeShapes, type ShapeIssue } from "@core/shapes";
import { nodeEngine } from "./engine";
import { missingScripts, type MissingScript } from "./scripts";

const DEFAULT_PATH = "data/schema.yaml";

type Options = { path: string; verbose: boolean };

function options(argv: string[]): Options {
  const args = argv.slice(2);
  return {
    verbose: args.includes("--verbose") || args.includes("-v"),
    path: resolve(args.find((arg) => !arg.startsWith("-")) ?? DEFAULT_PATH),
  };
}

// NO_COLOR and FORCE_COLOR are the conventions; CI renders ANSI without a tty.
function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY) || process.env.CI === "true";
}

const RESET = "\x1b[0m";
function paint(code: string) {
  return (text: string) => (COLOR ? `${code}${text}${RESET}` : text);
}

const COLOR = colorEnabled();
const bold = paint("\x1b[1m");
const dim = paint("\x1b[2m");
const red = paint("\x1b[31m");
const green = paint("\x1b[32m");
const yellow = paint("\x1b[33m");

const PASS = green("✓");
const FAIL = red("✘");
const SKIP = yellow("–");

// One line per subject: the name, then a short summary of what is wrong with it.
type Finding = { subject: string; summary: string; detail: string };

async function main(): Promise<number> {
  const { path, verbose } = options(process.argv);
  console.log(`\n${bold(`validate pipeline · ${path}`)}`);

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return fatal(`There is no file at ${path}.`);
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    return fatal("This file is not valid YAML.", message(cause));
  }

  const parsed = DagSchema.safeParse(raw);
  if (!parsed.success) {
    console.log(`\n${bold("Pipeline description")}`);
    for (const issue of parsed.error.issues) {
      const where = issue.path.join(".") || "(top level)";
      console.log(` ${FAIL} ${bold(where)}`);
      console.log(dim(indent(issue.message, 3)));
    }
    console.log("");
    return 1;
  }

  const dag = parsed.data;
  const pipeline = buildPipeline(dag);
  const nodeCount = Object.keys(dag.nodes).length;
  const operations = Object.keys(dag.operations);
  console.log(
    dim(
      `${dag.pipeline_name} ${dag.version} · ${nodeCount} nodes · ${operations.length} operations`,
    ),
  );

  const engine = await nodeEngine();
  try {
    const report = await materializeShapes(engine, pipeline, dag);

    // Parse-only, so it covers every operation including the blocked ones.
    // A query that doesn't parse is already reported above, so it's dropped here.
    const drifted = (await checkInputs(dag, engine.parse)).filter(
      (problem) => problem.kind !== "unparsable",
    );

    const sql = report.issues.filter((issue) => issue.operation);
    const nodeSchemas = report.issues.filter((issue) => !issue.operation);
    const schemaErrors = checkSchemas(dag.schemas);
    const scripts = missingScripts(dag);
    const reads = checkReads(dag, report.built);
    const byKind = (...kinds: ProblemKind[]) =>
      drifted.filter((problem) => kinds.includes(problem.kind));

    const problemCount =
      report.issues.length +
      drifted.length +
      schemaErrors.length +
      scripts.length +
      reads.length;
    const blockedNames = report.blocked.map(
      (issue) => issue.operation ?? issue.node,
    );
    // An operation that bound but whose inputs disagree with its query has not
    // passed, so it is only listed once, under whatever is wrong with it.
    const faulted = new Set([
      ...report.issues.map((issue) => issue.operation),
      ...drifted.map((problem) => problem.operation),
    ]);
    const bound = operations.filter(
      (name) => report.built.has(outputOf(dag, name)) && !faulted.has(name),
    );

    console.log(
      `\n ${PASS} ${report.built.size} built   ${problemCount > 0 ? FAIL : PASS} ${problemCount} ${plural(problemCount, "problem")}   ${SKIP} ${blockedNames.length} not checked`,
    );

    if (bound.length > 0) section("Passed", bound);
    group("SQL Syntax Errors", sql.map(fromShape), verbose);
    group("Schemas", nodeSchemas.map(fromShape), verbose);
    group("Schema Errors", schemaErrors.map(fromSchema), verbose);
    group("Missing Scripts", scripts.map(fromScript), verbose);
    group("Input Columns", reads.map(fromReads), verbose);
    group("Undeclared Inputs", byKind("undeclared", "unknown_node", "not_a_table").map(fromInput), verbose);
    group("Unused Declarations", byKind("unused").map(fromInput), verbose);
    group("Other", byKind("qualified", "self_reference", "walker").map(fromInput), verbose);

    if (blockedNames.length > 0) {
      console.log(`\n${bold("Not checked")}`);
      if (verbose) {
        for (const issue of report.blocked) {
          console.log(` ${SKIP} ${bold(issue.operation ?? issue.node)}`);
          console.log(dim(lay(issue.message, verbose)));
          console.log("");
        }
      } else {
        console.log(dim(`   ${blockedNames.join(", ")}`));
      }
    }

    if (problemCount === 0) {
      console.log(`\n ${green("Everything binds.")}\n`);
      return 0;
    }
    if (!verbose) console.log(dim("\n run with --verbose for detail"));
    console.log("");
    return 1;
  } finally {
    engine.close();
  }
}

// An operation's failure belongs to the operation the author wrote, not to the
// node name it happens to fill in.
function fromShape(issue: ShapeIssue): Finding {
  return {
    subject: issue.operation ?? issue.node,
    summary: firstLine(issue.message),
    detail: issue.message,
  };
}

function fromScript(missing: MissingScript): Finding {
  return {
    subject: missing.node,
    summary: `No script at ${missing.path}`,
    detail: `This node names \`${missing.src}\`, so there has to be a module at ${missing.path}. Create it, or point the node at one that exists.`,
  };
}

const fixes: Record<ReadProblem["field"], string> = {
  reads:
    "Fix the name in `reads:`, and in the script beside it, or add the column upstream.",
  key: "Fix the name in `key:`, or add the column upstream.",
  frozen: "Fix the name in `frozen:`, or add the column upstream.",
  links: "Fix the name in the `links:` template, or add the column upstream.",
};

function fromReads(problem: ReadProblem): Finding {
  const names = problem.missing.join(", ");
  const fix = fixes[problem.field];
  return {
    subject: problem.node,
    summary: `${problem.input} has no ${names}`,
    detail: `This node reads ${names} from \`${problem.input}\`, which has: ${problem.available.join(", ")}.\n${fix}`,
  };
}

function fromSchema(error: SchemaError): Finding {
  return { subject: error.schema, summary: error.summary, detail: error.detail };
}

// The names are the summary: the heading already says what is wrong with them.
function fromInput(problem: InputProblem): Finding {
  return {
    subject: problem.operation,
    summary: problem.names.join(", ") || firstLine(problem.message),
    detail: problem.message,
  };
}

// Names are padded to a column so the summaries line up and can be read down.
function group(title: string, findings: Finding[], verbose: boolean) {
  if (findings.length === 0) return;
  const width = Math.max(...findings.map((finding) => finding.subject.length));

  console.log(`\n${bold(title)}`);
  for (const finding of findings) {
    if (verbose) {
      console.log(` ${FAIL} ${bold(finding.subject)}`);
      console.log(dim(indent(finding.detail, 3)));
      console.log("");
    } else {
      console.log(
        ` ${FAIL} ${bold(finding.subject.padEnd(width))}  ${dim(finding.summary)}`,
      );
    }
  }
}

function section(title: string, names: string[]) {
  if (names.length === 0) return;
  console.log(`\n${bold(title)}`);
  console.log(` ${PASS} ${dim(names.join(", "))}`);
}

function outputOf(dag: { operations: Record<string, { output: string }> }, name: string) {
  return dag.operations[name].output;
}

function fatal(...lines: string[]): number {
  console.log("");
  for (const line of lines) console.log(` ${FAIL} ${line}`);
  console.log("");
  return 1;
}

// Default keeps one line per problem; verbose keeps the message's own layout.
function lay(text: string, verbose: boolean): string {
  return indent(verbose ? text : firstLine(text), 3);
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0];
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .trimEnd()
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

main().then(
  (code) => process.exit(code),
  (cause) => {
    console.error(message(cause));
    process.exit(1);
  },
);
