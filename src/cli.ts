#!/usr/bin/env node

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { add } from "./commands/add.js";
import { create } from "./commands/create.js";
import { fork } from "./commands/fork.js";
import { login, logoutCmd } from "./commands/login.js";
import { preview } from "./commands/preview.js";
import { publish } from "./commands/publish.js";
import { search } from "./commands/search.js";
import { update } from "./commands/update.js";

const { version, description } = pkg;
const program = new Command();

program.name("scm").description(description).version(version);

// Register all commands
program.addCommand(create);
program.addCommand(login);
program.addCommand(logoutCmd);
program.addCommand(add);
program.addCommand(publish);
program.addCommand(search);
program.addCommand(preview);
program.addCommand(update);
program.addCommand(fork);

program.parse(process.argv);
