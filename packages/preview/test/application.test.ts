import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { application, ready } from "../src/Application";
import {
  ApplicationReadyStateKey,
  ApplicationReadyStateVersion,
} from "../src/internal/protocol";

describe("application preview", () => {
  it("marks only the active capture state as ready", () => {
    const key = Symbol.for(ApplicationReadyStateKey);
    Reflect.deleteProperty(globalThis, key);

    ready();
    strictEqual(Reflect.has(globalThis, key), false);

    const state = {
      version: ApplicationReadyStateVersion,
      status: "loading",
    };
    Reflect.set(globalThis, key, state);
    ready();
    ready();

    deepStrictEqual(state, {
      version: ApplicationReadyStateVersion,
      status: "ready",
    });
    Reflect.deleteProperty(globalThis, key);
  });

  it("ignores an unknown capture protocol version", () => {
    const key = Symbol.for(ApplicationReadyStateKey);
    const state = { version: -1, status: "loading" };
    Reflect.set(globalThis, key, state);

    ready();

    deepStrictEqual(state, { version: -1, status: "loading" });
    Reflect.deleteProperty(globalThis, key);
  });

  it("rejects an empty application location", () => {
    assert.throws(() => application({ location: "" }), /non-empty location/);
  });
});
