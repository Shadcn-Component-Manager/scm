import chalk from "chalk";
import crypto from "crypto";
import fs from "fs-extra";
import ora from "ora";
import os from "os";
import path from "path";
import semver from "semver";

export interface VersionInfo {
  currentVersion: string;
  newVersion: string;
  changeType: "patch" | "minor" | "major";
  hasChanges: boolean;
}

/**
 * Detects version changes by analyzing file modifications
 * @param componentPath - Path to the component directory
 * @param currentVersion - Current version string
 * @returns Promise resolving to version information
 */
export async function detectVersionChanges(
  componentPath: string,
  currentVersion: string,
): Promise<VersionInfo> {
  const spinner = ora("📊 Analyzing component changes...").start();

  try {
    const files = await getAllFiles(componentPath);
    const fileHashes: Record<string, string> = {};

    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      fileHashes[path.relative(componentPath, file)] = hash;
    }

    const scmDir = path.join(os.homedir(), ".scm");
    const hashFile = path.join(scmDir, "version-hashes.json");
    let previousHashes: Record<string, string> = {};

    if (await fs.pathExists(hashFile)) {
      try {
        const allHashes = await fs.readJson(hashFile);
        const componentKey = path.basename(componentPath);
        previousHashes = allHashes[componentKey] || {};
      } catch (error) {
        await fs.remove(hashFile);
      }
    }

    const changedFiles: string[] = [];
    const newFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const [file, hash] of Object.entries(fileHashes)) {
      if (previousHashes[file]) {
        if (previousHashes[file] !== hash) {
          changedFiles.push(file);
        }
      } else {
        newFiles.push(file);
      }
    }

    for (const file of Object.keys(previousHashes)) {
      if (!fileHashes[file]) {
        deletedFiles.push(file);
      }
    }

    const hasChanges =
      changedFiles.length > 0 || newFiles.length > 0 || deletedFiles.length > 0;

    if (!hasChanges) {
      spinner.succeed(chalk.green("✅ No changes detected"));
      return {
        currentVersion,
        newVersion: currentVersion,
        changeType: "patch",
        hasChanges: false,
      };
    }

    const changeType = determineChangeType(
      changedFiles,
      newFiles,
      deletedFiles,
    );
    const newVersion = semver.inc(currentVersion, changeType);

    if (!newVersion) {
      throw new Error(
        `Failed to increment version ${currentVersion} with type ${changeType}`,
      );
    }

    await fs.ensureDir(scmDir);
    const componentKey = path.basename(componentPath);
    const allHashes = (await fs.pathExists(hashFile))
      ? await fs.readJson(hashFile)
      : {};
    allHashes[componentKey] = fileHashes;
    await fs.writeJson(hashFile, allHashes, { spaces: 2 });

    spinner.succeed(
      chalk.green(
        `📈 Changes detected: ${changeType} version bump (${currentVersion} → ${newVersion})`,
      ),
    );

    return {
      currentVersion,
      newVersion,
      changeType,
      hasChanges: true,
    };
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to analyze changes"));
    throw error;
  }
}

/**
 * Recursively gets all relevant files in a directory
 * @param dir - Directory to scan
 * @returns Promise resolving to array of file paths
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const items = await fs.readdir(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      if (item !== "node_modules" && item !== ".git" && !item.startsWith(".")) {
        files.push(...(await getAllFiles(fullPath)));
      }
    } else {
      if (
        item.endsWith(".tsx") ||
        item.endsWith(".ts") ||
        item.endsWith(".js") ||
        item.endsWith(".jsx") ||
        item.endsWith(".json") ||
        item.endsWith(".md") ||
        item.endsWith(".css") ||
        item.endsWith(".scss")
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Determines the type of version change based on file modifications
 * @param changedFiles - Array of changed file paths
 * @param newFiles - Array of new file paths
 * @param deletedFiles - Array of deleted file paths
 * @returns Change type (patch, minor, or major)
 */
function determineChangeType(
  changedFiles: string[],
  newFiles: string[],
  deletedFiles: string[],
): "patch" | "minor" | "major" {
  const breakingChanges = ["registry.json", "package.json"];

  for (const file of [...changedFiles, ...newFiles, ...deletedFiles]) {
    if (breakingChanges.some((pattern) => file.includes(pattern))) {
      return "major";
    }
  }

  const featureFiles = [".tsx", ".ts", ".js", ".jsx"];

  const hasNewFeatures = newFiles.some((file) =>
    featureFiles.some((ext) => file.endsWith(ext)),
  );

  if (hasNewFeatures) {
    return "minor";
  }

  return "patch";
}

/**
 * Validates if a version string is valid semver
 * @param version - Version string to validate
 * @returns True if valid, false otherwise
 */
export function validateVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Compares two version strings
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns Comparison result (-1, 0, 1)
 */
export function compareVersions(v1: string, v2: string): number {
  return semver.compare(v1, v2);
}

/**
 * Checks if version v1 is greater than v2
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns True if v1 > v2, false otherwise
 */
export function isVersionGreater(v1: string, v2: string): boolean {
  return semver.gt(v1, v2);
}
