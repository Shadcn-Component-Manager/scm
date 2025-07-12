import chalk from "chalk";
import crypto from "crypto";
import fs from "fs-extra";
import ora from "ora";
import os from "os";
import path from "path";
import { z } from "zod";

const configDir = path.join(os.homedir(), ".scm");
const configPath = path.join(configDir, "config.json");

function getEncryptionKey(): Buffer {
  const systemInfo = `${os.homedir()}-${os.platform()}-${os.arch()}`;
  return crypto.createHash("sha256").update(systemInfo).digest();
}

function encryptData(data: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decryptData(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    throw new Error(
      "Failed to decrypt token - may be corrupted or from different system",
    );
  }
}

const configSchema = z.object({
  encryptedToken: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function setSecureToken(token: string): void {
  const encryptedToken = encryptData(token);
  const config = { encryptedToken };
  fs.writeJsonSync(configPath, config, { spaces: 2 });
  fs.chmodSync(configPath, 0o600);
}

export function getSecureToken(): string | null {
  try {
    if (!fs.existsSync(configPath)) return null;
    const config = fs.readJsonSync(configPath);
    const parsedConfig = configSchema.parse(config);
    if (!parsedConfig.encryptedToken) return null;
    return decryptData(parsedConfig.encryptedToken);
  } catch (error) {
    return null;
  }
}

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
 * Writes the SCM configuration to file with secure permissions
 */
export async function writeConfig(config: Config): Promise<void> {
  const spinner = ora("💾 Saving configuration...").start();
  try {
    await fs.ensureDir(configDir);
    await fs.writeJson(configPath, config, { spaces: 2 });
    await fs.chmod(configPath, 0o600);
    spinner.succeed(chalk.green("✅ Configuration saved successfully"));
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to save configuration"));
    console.error(error);
    process.exit(1);
  }
}
