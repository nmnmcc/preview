#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node-shared/NodeRuntime";
import { program } from "./program";

// `program` owns error output, so the runtime must not print each cause again.
NodeRuntime.runMain(program, { disableErrorReporting: true });
