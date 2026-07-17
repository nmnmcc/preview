import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import { strictEqual } from "@effect/vitest/utils";
import { application, ready } from "../src/Application";

describe("application preview", () => {
  it("returns immediately outside an active capture", () => {
    strictEqual(ready(), undefined);
  });

  it("rejects an empty application location", () => {
    assert.throws(() => application({ location: "" }), /non-empty location/);
  });
});
