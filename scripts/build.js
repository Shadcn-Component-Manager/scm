#!/usr/bin/env node

import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs-extra";
import ora from "ora";
import path from "path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

const commands = {
  build: async () => {
    const spinner = ora(chalk.blue("Building CLI...")).start();

    try {
      await fs.remove(distDir);
      execSync("tsc", { stdio: "pipe" });

      const cliPath = path.join(distDir, "cli.js");
      if (await fs.pathExists(cliPath)) {
        await fs.chmod(cliPath, 0o755);
      }

      const packageJson = await fs.readJson(path.join(rootDir, "package.json"));
      const distPackageJson = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        bin: packageJson.bin,
        type: packageJson.type,
        engines: packageJson.engines,
      };
      await fs.writeJson(path.join(distDir, "package.json"), distPackageJson, {
        spaces: 2,
      });

      spinner.succeed(chalk.green("Build completed"));
      console.log(chalk.gray(`Output: ${chalk.cyan(distDir)}`));
    } catch (error) {
      spinner.fail(chalk.red("Build failed"));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  },

  binary: async () => {
    const spinner = ora(chalk.blue("Creating binaries...")).start();

    try {
      await commands.build();
      execSync(
        "pkg dist/cli.js --out-path dist --targets node18-win-x64,node18-linux-x64,node18-macos-x64",
        { stdio: "pipe" },
      );

      const files = await fs.readdir(distDir);
      const binaries = files.filter(
        (file) => !file.endsWith(".js") && !file.endsWith(".json"),
      );

      spinner.succeed(chalk.green("Binaries created"));
      console.log(chalk.gray("Available in:"), chalk.cyan(distDir));
      binaries.forEach((binary) => console.log(chalk.cyan(`  ${binary}`)));
    } catch (error) {
      spinner.fail(chalk.red("Binary creation failed"));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  },

  dev: async () => {
    const spinner = ora(chalk.blue("Starting dev mode...")).start();
    spinner.succeed(chalk.green("Dev mode active"));
    console.log(chalk.gray("Press Ctrl+C to stop\n"));

    try {
      execSync("tsc --watch", { stdio: "inherit" });
    } catch (error) {
      if (error.signal === "SIGINT") {
        console.log(chalk.yellow("Dev mode stopped"));
      } else {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    }
  },
};

const command = process.argv[2];

if (command && commands[command]) {
  commands[command]();
} else {
  console.log(chalk.bold.blue("SCM CLI Builder\n"));
  console.log(chalk.gray("Usage: node scripts/build.js [command]\n"));
  console.log(chalk.bold.blue("Commands:"));
  Object.keys(commands).forEach((cmd) => {
    console.log(chalk.cyan(`  ${cmd}`));
  });
  process.exit(1);
}
