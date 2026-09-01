import { describe, expect, it } from "vitest";
import { linkColumns, toRecords } from "@core/dataEntry";
import { NodeSchema, type DataEntryNode } from "@core/schema";

function entry(raw: Record<string, unknown> = {}): DataEntryNode {
  return NodeSchema.parse({
    kind: "data_entry",
    description: "",
    input: "source",
    key: "ein",
    frozen: ["name"],
    options: ["arts"],
    ...raw,
  }) as DataEntryNode;
}

const linked = entry({
  links: { name: "https://www.google.com/search?q={name} {city}" },
});

describe("entry links", () => {
  it("names every column its templates interpolate", () => {
    expect(linkColumns(linked)).toEqual(["name", "city"]);
    expect(linkColumns(entry())).toEqual([]);
  });

  it("interpolates a record's values, url-encoding them", () => {
    const [record] = toRecords(
      [{ ein: "1", name: "Kids & Co", city: "St. Paul" }],
      linked,
    );
    expect(record.links).toEqual({
      name: "https://www.google.com/search?q=Kids%20%26%20Co St.%20Paul",
    });
  });

  it("leaves a missing column blank rather than dropping the link", () => {
    const [record] = toRecords([{ ein: "1", name: "Kids & Co" }], linked);
    expect(record.links?.name).toBe("https://www.google.com/search?q=Kids%20%26%20Co ");
  });

  it("gives no link at all when nothing it names has a value", () => {
    const [record] = toRecords([{ ein: "1", name: "", city: "" }], linked);
    expect(record.links).toBeUndefined();
  });

  it("leaves records alone when the node declares no links", () => {
    const [record] = toRecords([{ ein: "1", name: "Kids & Co" }], entry());
    expect(record).toEqual({ key: "1", cells: ["Kids & Co"] });
  });

  it("refuses a link on a column the grid does not pin", () => {
    expect(() => entry({ links: { city: "https://example.com/{city}" } })).toThrow(
      /Only a frozen column/,
    );
  });

  it("counts the key as pinned when frozen is empty", () => {
    expect(() =>
      entry({ frozen: [], links: { ein: "https://example.com/{ein}" } }),
    ).not.toThrow();
  });
});
