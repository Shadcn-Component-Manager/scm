import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { RegistryItem, registryItemSchema } from "./registry.js";

/**
 * Validates a component's files and structure
 */
export async function validateComponent(
  componentPath: string,
  registryItem?: RegistryItem,
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const spinner = ora("🔍 Validating component...").start();

  try {
    let itemToValidate: RegistryItem;

    if (registryItem) {
      itemToValidate = registryItem;
    } else {
      const registryPath = path.join(componentPath, "registry.json");
      if (!(await fs.pathExists(registryPath))) {
        errors.push("registry.json not found");
        spinner.fail(
          chalk.red("❌ Validation failed: registry.json not found"),
        );
        return { isValid: false, errors };
      }

      const registryContent = await fs.readJson(registryPath);
      const validation = registryItemSchema.safeParse(registryContent);

      if (!validation.success) {
        validation.error.issues.forEach((issue) => {
          errors.push(`${issue.path.join(".")}: ${issue.message}`);
        });
        spinner.fail(
          chalk.red("❌ Validation failed: Invalid registry.json schema"),
        );
        return { isValid: false, errors };
      }

      itemToValidate = validation.data;
    }

    if (itemToValidate.files && itemToValidate.files.length > 0) {
      for (const file of itemToValidate.files) {
        const filePath = path.join(componentPath, file.path);
        if (!(await fs.pathExists(filePath))) {
          errors.push(`File not found: ${file.path}`);
        } else {
          try {
            await fs.access(filePath, fs.constants.R_OK);
          } catch (error) {
            errors.push(`File not readable: ${file.path}`);
          }
        }
      }
    }

    if (itemToValidate.name) {
      const namePattern = /^[a-zA-Z0-9_-]+$/;
      if (!namePattern.test(itemToValidate.name)) {
        errors.push(
          "Component name can only contain letters, numbers, hyphens, and underscores",
        );
      }
    }

    if (
      "version" in itemToValidate &&
      itemToValidate.version &&
      typeof itemToValidate.version === "string"
    ) {
      const versionPattern =
        /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      if (!versionPattern.test(itemToValidate.version)) {
        errors.push("Version must be in semver format (e.g., 1.0.0)");
      }
    }

    if (errors.length > 0) {
      spinner.fail(chalk.red("❌ Validation failed"));
      return { isValid: false, errors };
    }

    spinner.succeed(chalk.green("✅ Component validation passed"));
    return { isValid: true, errors: [] };
  } catch (error) {
    spinner.fail(chalk.red("❌ Validation failed: Unexpected error"));
    errors.push(`Unexpected error: ${error}`);
    return { isValid: false, errors };
  }
}

/**
 * Validates a registry item object
 */
export async function validateRegistryItem(
  registryItem: any,
): Promise<{ isValid: boolean; data?: RegistryItem; errors: string[] }> {
  const errors: string[] = [];

  try {
    const validation = registryItemSchema.safeParse(registryItem);

    if (!validation.success) {
      validation.error.issues.forEach((issue) => {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      });
      return { isValid: false, errors };
    }

    return { isValid: true, data: validation.data, errors: [] };
  } catch (error) {
    errors.push(`Failed to parse registry item: ${error}`);
    return { isValid: false, errors };
  }
}

/**
 * Validates a registry.json file
 */
export async function validateRegistryJson(
  registryPath: string,
): Promise<{ isValid: boolean; data?: RegistryItem; errors: string[] }> {
  const errors: string[] = [];

  try {
    if (!(await fs.pathExists(registryPath))) {
      errors.push("Registry file does not exist");
      return { isValid: false, errors };
    }

    const content = await fs.readJson(registryPath);
    const validation = registryItemSchema.safeParse(content);

    if (!validation.success) {
      validation.error.issues.forEach((issue) => {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      });
      return { isValid: false, errors };
    }

    return { isValid: true, data: validation.data, errors: [] };
  } catch (error) {
    errors.push(`Failed to parse registry.json: ${error}`);
    return { isValid: false, errors };
  }
}

/**
 * Validates component dependencies
 */
export function validateDependencies(
  dependencies: string[] = [],
  registryDependencies: string[] = [],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const dep of dependencies) {
    if (typeof dep !== "string" || dep.trim().length === 0) {
      errors.push("Invalid npm dependency: must be a non-empty string");
    }
  }

  for (const dep of registryDependencies) {
    if (typeof dep !== "string" || dep.trim().length === 0) {
      errors.push("Invalid registry dependency: must be a non-empty string");
    } else {
      const parts = dep.split("/");
      if (parts.length !== 2) {
        errors.push(
          `Invalid registry dependency format: ${dep}. Use: namespace/component`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
