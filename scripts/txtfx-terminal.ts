#!/usr/bin/env bun

import { runTerminalCli } from "../src/engine/terminal-cli";

const code = await runTerminalCli(process.argv.slice(2));
process.exit(code);
