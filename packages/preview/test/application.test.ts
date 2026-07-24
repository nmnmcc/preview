import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import { strictEqual } from "@effect/vitest/utils";
import { application, done, emit } from "../src/Application";

describe("application preview", () => {
  it("returns immediately outside an active capture", async () => {
    strictEqual(await emit("default"), undefined);
    strictEqual(done(), undefined);
  });

  it("rejects an invalid state name outside an active capture", async () => {
    await assert.rejects(() => emit("Invalid state"));
  });

  it("rejects an empty application location", () => {
    assert.throws(() => application({ location: "" }), /non-empty location/);
  });
});
