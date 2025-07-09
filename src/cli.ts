#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import { fileURLToPath } from "url";
import { add } from "./commands/add.js";
import { create } from "./commands/create.js";
import { fork } from "./commands/fork.js";
import { login, logoutCmd } from "./commands/login.js";
import { preview } from "./commands/preview.js";
import { publish } from "./commands/publish.js";
import { search } from "./commands/search.js";
import { update } from "./commands/update.js";
import { readPackageJsonSync } from "./lib/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, "..", "package.json");

let version = "0.0.0";
let description =
  "Shadcn Component Manager (SCM) is a open-source CLI tool and registry ecosystem designed to extend shadcn's component model, enabling developers to create, share, and install UI components with ease.";

try {
  const packageJson = readPackageJsonSync(packageJsonPath);
  if (packageJson) {
    version = packageJson.version || version;
    description = packageJson.description || description;
  }
} catch (error) {
  console.warn(
    "Warning: Could not read package.json, using default version and description",
  );
}

const program = new Command();

program.name("scm").description(description).version(version);

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
