import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import os from "os";
import path from "path";
import { z } from "zod";

const configDir = path.join(os.homedir(), ".scm");
const configPath = path.join(configDir, "config.json");

const configSchema = z.object({
  token: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Reads a package.json file and returns its contents (synchronous)
 */
export function readPackageJsonSync(packagePath: string): any | null {
  try {
    if (fs.existsSync(packagePath)) {
      const content = fs.readFileSync(packagePath, "utf-8");
      return JSON.parse(content);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Reads a package.json file and returns its contents
 */
export async function readPackageJson(
  packagePath: string,
): Promise<any | null> {
  try {
    if (await fs.pathExists(packagePath)) {
      const content = await fs.readFile(packagePath, "utf-8");
      return JSON.parse(content);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Reads the SCM configuration file
 */
export async function readConfig(): Promise<Config> {
  const spinner = ora("📖 Reading configuration...").start();
  try {
    if (!(await fs.pathExists(configPath))) {
      spinner.succeed("✅ No config file found. Using default configuration");
      return {};
    }
    const configContent = await fs.readJson(configPath);
    const parsedConfig = configSchema.parse(configContent);
    spinner.succeed(chalk.green("✅ Configuration loaded successfully"));
    return parsedConfig;
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to read configuration"));
    if (error instanceof z.ZodError) {
      console.error(
        chalk.red("Configuration file is corrupted:"),
        error.issues,
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Writes the SCM configuration to file
 */
export async function writeConfig(config: Config): Promise<void> {
  const spinner = ora("💾 Saving configuration...").start();
  try {
    await fs.ensureDir(configDir);
    await fs.writeJson(configPath, config, { spaces: 2 });
    spinner.succeed(chalk.green("✅ Configuration saved successfully"));
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to save configuration"));
    console.error(error);
    process.exit(1);
  }
}
