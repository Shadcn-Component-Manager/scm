import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { MAX_FILE_SIZE } from "./constants.js";

/**
 * Validates if a file target is safe to write
 */
export function isSafeTarget(target: string, cwd: string): boolean {
  if (!target || typeof target !== "string") {
    return false;
  }

  const normalizedTarget = path.normalize(target);
  const normalizedCwd = path.normalize(cwd);

  if (
    normalizedTarget.includes("..") ||
    normalizedTarget.includes("\\") ||
    normalizedTarget.startsWith("/") ||
    (normalizedTarget.includes("~") && !normalizedTarget.startsWith("~/")) ||
    normalizedTarget.includes("$")
  ) {
    return false;
  }

  const resolvedPath = path.resolve(cwd, normalizedTarget);

  return (
    resolvedPath.startsWith(normalizedCwd) &&
    !resolvedPath.includes("node_modules") &&
    !resolvedPath.includes(".git") &&
    !resolvedPath.includes(".env") &&
    !resolvedPath.includes("package.json") &&
    !resolvedPath.includes("package-lock.json") &&
    !resolvedPath.includes("yarn.lock") &&
    !resolvedPath.includes("pnpm-lock.yaml")
  );
}

/**
 * Validates component name format
 */
export function validateComponentName(componentName: string): {
  isValid: boolean;
  error?: string;
} {
  if (!componentName || typeof componentName !== "string") {
    return { isValid: false, error: "Component name is required" };
  }

  const namePattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;
  if (!namePattern.test(componentName)) {
    return {
      isValid: false,
      error:
        "Component name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number",
    };
  }

  const reservedNames = [
    "node_modules",
    "package",
    "package.json",
    "components",
    "lib",
    "src",
    "dist",
    "build",
    "test",
    "tests",
    "docs",
    "examples",
    "config",
    "index",
    "main",
    "app",
    "utils",
    "types",
    "interfaces",
    "constants",
  ];

  if (reservedNames.includes(componentName.toLowerCase())) {
    return {
      isValid: false,
      error: `Component name '${componentName}' is reserved and cannot be used`,
    };
  }

  if (componentName.length < 2 || componentName.length > 50) {
    return {
      isValid: false,
      error: "Component name must be between 2 and 50 characters",
    };
  }

  if (componentName.includes("--")) {
    return {
      isValid: false,
      error: "Component name cannot contain consecutive hyphens",
    };
  }

  return { isValid: true };
}

/**
 * Validates namespace format
 */
export function validateNamespace(namespace: string): {
  isValid: boolean;
  error?: string;
} {
  if (!namespace || typeof namespace !== "string") {
    return { isValid: false, error: "Namespace is required" };
  }

  const namespacePattern = /^[a-zA-Z0-9_-]+$/;
  if (!namespacePattern.test(namespace)) {
    return {
      isValid: false,
      error:
        "Namespace can only contain letters, numbers, hyphens, and underscores",
    };
  }

  if (namespace.length < 1 || namespace.length > 39) {
    return {
      isValid: false,
      error: "Namespace must be between 1 and 39 characters",
    };
  }

  return { isValid: true };
}

/**
 * Parses component name with version
 */
export function parseComponentName(componentName: string): {
  namespace: string;
  name: string;
  version: string;
  isValid: boolean;
  error?: string;
} {
  const versionMatch = componentName.match(/^(.+?)@(.+)$/);
  const componentWithoutVersion = versionMatch
    ? versionMatch[1]
    : componentName;
  const version = versionMatch ? versionMatch[2] : "latest";

  const parts = componentWithoutVersion.split("/");
  if (parts.length !== 2) {
    return {
      namespace: "",
      name: "",
      version,
      isValid: false,
      error: "Invalid component name. Use: <namespace>/<component>[@version]",
    };
  }

  const [namespace, name] = parts;

  const namespaceValidation = validateNamespace(namespace);
  if (!namespaceValidation.isValid) {
    return {
      namespace,
      name,
      version,
      isValid: false,
      error: namespaceValidation.error,
    };
  }

  const nameValidation = validateComponentName(name);
  if (!nameValidation.isValid) {
    return {
      namespace,
      name,
      version,
      isValid: false,
      error: nameValidation.error,
    };
  }

  return {
    namespace,
    name,
    version,
    isValid: true,
  };
}

/**
 * Handles file conflicts with user confirmation
 */
export async function handleFileConflict(
  filePath: string,
  options: { overwrite?: boolean; yes?: boolean; verbose?: boolean },
): Promise<boolean> {
  if (!(await fs.pathExists(filePath))) {
    return true;
  }

  if (options.overwrite || options.yes) {
    if (options.verbose) {
      console.log(
        `Overwriting existing file: ${path.relative(process.cwd(), filePath)}`,
      );
    }
    return true;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `File already exists: ${path.relative(process.cwd(), filePath)}. Overwrite?`,
      default: false,
    },
  ] as any);

  return confirm;
}

/**
 * Merges CSS variables intelligently
 */
export function mergeCssVariables(existingCss: string, newVars: any): string {
  if (!existingCss || typeof existingCss !== "string") {
    return existingCss;
  }

  if (!newVars || typeof newVars !== "object") {
    return existingCss;
  }

  const lines = existingCss.split("\n");
  const result: string[] = [];
  let inRoot = false;
  let inLight = false;
  let inDark = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ":root {") {
      inRoot = true;
      result.push(line);
      continue;
    }

    if (trimmed === ".light {") {
      inRoot = false;
      inLight = true;
      result.push(line);
      continue;
    }

    if (trimmed === ".dark {") {
      inRoot = false;
      inLight = false;
      inDark = true;
      result.push(line);
      continue;
    }

    if (trimmed === "}") {
      if (inRoot && newVars.theme) {
        for (const [key, value] of Object.entries(newVars.theme)) {
          result.push(`  --${key}: ${value};`);
        }
      }
      if (inLight && newVars.light) {
        for (const [key, value] of Object.entries(newVars.light)) {
          result.push(`  --${key}: ${value};`);
        }
      }
      if (inDark && newVars.dark) {
        for (const [key, value] of Object.entries(newVars.dark)) {
          result.push(`  --${key}: ${value};`);
        }
      }
      inRoot = false;
      inLight = false;
      inDark = false;
      result.push(line);
      continue;
    }

    if (inRoot && trimmed.startsWith("--") && newVars.theme) {
      const key = trimmed.split(":")[0].substring(2);
      if (newVars.theme[key]) {
        continue;
      }
    }

    if (inLight && trimmed.startsWith("--") && newVars.light) {
      const key = trimmed.split(":")[0].substring(2);
      if (newVars.light[key]) {
        continue;
      }
    }

    if (inDark && trimmed.startsWith("--") && newVars.dark) {
      const key = trimmed.split(":")[0].substring(2);
      if (newVars.dark[key]) {
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Resolves dependency tree and handles conflicts
 */
export async function resolveDependencies(
  dependencies: string[] = [],
  registryDependencies: string[] = [],
): Promise<{ npm: string[]; registry: string[]; conflicts: string[] }> {
  const npmDeps = new Map<string, string>();
  const registryDeps = new Set<string>();
  const conflicts: string[] = [];

  for (const dep of dependencies) {
    if (typeof dep === "string" && dep.trim()) {
      npmDeps.set(dep.trim(), dep.trim());
    }
  }

  for (const dep of registryDependencies) {
    if (typeof dep === "string" && dep.trim()) {
      registryDeps.add(dep.trim());
    }
  }

  for (const registryDep of registryDeps) {
    if (npmDeps.has(registryDep)) {
      conflicts.push(
        `Conflict: ${registryDep} exists in both npm and registry dependencies`,
      );
    }
  }

  return {
    npm: Array.from(npmDeps.values()),
    registry: Array.from(registryDeps),
    conflicts,
  };
}

/**
 * Validates file targets for security
 */
export function validateFileTargets(
  files: any[] = [],
  cwd: string,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(files)) {
    return { isValid: false, errors: ["Files must be an array"] };
  }

  for (const file of files) {
    if (!file || typeof file !== "object") {
      errors.push("Invalid file object");
      continue;
    }

    if (file.path && typeof file.path !== "string") {
      errors.push("File path must be a string");
    }

    if (file.target && typeof file.target !== "string") {
      errors.push("File target must be a string");
    }

    if (file.type && typeof file.type !== "string") {
      errors.push("File type must be a string");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Ensures a directory exists and is writable
 */
export async function ensureWritableDirectory(
  dirPath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.ensureDir(dirPath);

    const testFile = path.join(dirPath, ".test-write");
    await fs.writeFile(testFile, "test");
    await fs.remove(testFile);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Directory ${dirPath} is not writable: ${error}`,
    };
  }
}

/**
 * Sanitizes a filename for safe file system operations
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Validates version string format
 */
export function validateVersion(version: string): {
  isValid: boolean;
  error?: string;
} {
  if (!version || typeof version !== "string") {
    return { isValid: false, error: "Version is required" };
  }

  const versionPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
  if (!versionPattern.test(version) && version !== "latest") {
    return {
      isValid: false,
      error: "Version must be in semver format (e.g., 1.0.0) or 'latest'",
    };
  }

  return { isValid: true };
}

/**
 * Formats bytes to human readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Debounces a function call
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Retry configuration for network operations
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration for network operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

/**
 * Rate limiting for network requests
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, [now]);
      return true;
    }

    const requests = this.requests.get(key)!;
    const recentRequests = requests.filter((time) => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }

  waitForNextWindow(key: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.canMakeRequest(key)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }
}

const rateLimiter = new RateLimiter(10, 60000);

/**
 * Creates a secure axios instance with security headers
 */
export function createSecureAxiosInstance() {
  const axios = require("axios");
  return axios.create({
    timeout: 30000,
    maxContentLength: MAX_FILE_SIZE, // 100MB max
    headers: {
      "User-Agent": "SCM-CLI/1.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate",
    },
    validateStatus: (status: number) => {
      return status >= 200 && status < 300;
    },
  });
}

/**
 * Performs a network operation with exponential backoff retry logic and rate limiting
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName: string = "Operation",
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  const requestKey = operationName;
  if (!rateLimiter.canMakeRequest(requestKey)) {
    console.log(
      chalk.yellow(`⏳ Rate limit reached for ${operationName}, waiting...`),
    );
    await rateLimiter.waitForNextWindow(requestKey);
  }

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("403")) {
          throw error;
        }
        if (error.message.includes("404")) {
          throw error;
        }
      }

      if (attempt === finalConfig.maxRetries) {
        break;
      }

      const delay = Math.min(
        finalConfig.baseDelay *
          Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `${operationName} failed after ${finalConfig.maxRetries + 1} attempts: ${lastError!.message}`,
  );
}

/**
 * Validates and sanitizes file content for security
 */
export function validateFileContent(content: any, filePath: string): string {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(
      `Invalid file content for ${filePath}: empty or non-string content`,
    );
  }

  const dangerousPatterns = [
    /<script\b[^>]*>/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /data:application\/javascript/i,
    /eval\s*\(/i,
    /setTimeout\s*\(/i,
    /setInterval\s*\(/i,
    /document\.write/i,
    /innerHTML\s*=/i,
    /outerHTML\s*=/i,
    /document\.createElement/i,
    /window\.open/i,
    /location\.href\s*=/i,
    /XMLHttpRequest/i,
    /process\.env/i,
    /__dirname/i,
    /__filename/i,
    /fs\./i,
    /child_process/i,
    /exec\s*\(/i,
    /spawn\s*\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      throw new Error(
        `Potentially unsafe content detected in ${filePath}: ${pattern.source}`,
      );
    }
  }

  const suspiciousExtensions = [
    ".exe",
    ".bat",
    ".cmd",
    ".ps1",
    ".sh",
    ".py",
    ".php",
    ".rb",
  ];
  for (const ext of suspiciousExtensions) {
    if (content.toLowerCase().includes(ext)) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: Suspicious file extension '${ext}' found in ${filePath}`,
        ),
      );
    }
  }

  return content;
}
