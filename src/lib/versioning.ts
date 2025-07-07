import chalk from "chalk";
import crypto from "crypto";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import semver from "semver";

export interface VersionInfo {
  currentVersion: string;
  newVersion: string;
  changeType: "patch" | "minor" | "major";
  hasChanges: boolean;
}

export async function detectVersionChanges(
  componentPath: string,
  currentVersion: string,
): Promise<VersionInfo> {
  const spinner = ora("📊 Analyzing component changes...").start();

  try {
    // Get all files in the component directory
    const files = await getAllFiles(componentPath);
    const fileHashes: Record<string, string> = {};

    // Calculate hashes for all files
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      fileHashes[path.relative(componentPath, file)] = hash;
    }

    // Check if we have previous hashes stored
    const hashFile = path.join(componentPath, ".version-hashes.json");
    let previousHashes: Record<string, string> = {};

    if (await fs.pathExists(hashFile)) {
      previousHashes = await fs.readJson(hashFile);
    }

    // Compare hashes to detect changes
    const changedFiles: string[] = [];
    const newFiles: string[] = [];
    const deletedFiles: string[] = [];

    // Check for changed and new files
    for (const [file, hash] of Object.entries(fileHashes)) {
      if (previousHashes[file]) {
        if (previousHashes[file] !== hash) {
          changedFiles.push(file);
        }
      } else {
        newFiles.push(file);
      }
    }

    // Check for deleted files
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

    // Determine change type based on file changes
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

    // Save new hashes
    await fs.writeJson(hashFile, fileHashes, { spaces: 2 });

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

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const items = await fs.readdir(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and .git
      if (item !== "node_modules" && item !== ".git") {
        files.push(...(await getAllFiles(fullPath)));
      }
    } else {
      // Only include relevant file types
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

function determineChangeType(
  changedFiles: string[],
  newFiles: string[],
  deletedFiles: string[],
): "patch" | "minor" | "major" {
  // Major version bump for breaking changes
  const breakingChanges = ["registry.json", "package.json"]; // Schema changes, dependency changes

  for (const file of [...changedFiles, ...newFiles, ...deletedFiles]) {
    if (breakingChanges.some((pattern) => file.includes(pattern))) {
      return "major";
    }
  }

  // Minor version bump for new features
  const featureFiles = [".tsx", ".ts", ".js", ".jsx"]; // Component files

  const hasNewFeatures = newFiles.some((file) =>
    featureFiles.some((ext) => file.endsWith(ext)),
  );

  if (hasNewFeatures) {
    return "minor";
  }

  // Patch version bump for bug fixes and minor changes
  return "patch";
}

export function validateVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

export function compareVersions(v1: string, v2: string): number {
  return semver.compare(v1, v2);
}

export function isVersionGreater(v1: string, v2: string): boolean {
  return semver.gt(v1, v2);
}
