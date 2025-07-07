import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { RegistryItem, registryItemSchema } from "./registry.js";

export async function validateComponent(
  componentPath: string,
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const spinner = ora("🔍 Validating component...").start();

  try {
    // Check if registry.json exists
    const registryPath = path.join(componentPath, "registry.json");
    if (!(await fs.pathExists(registryPath))) {
      errors.push("registry.json not found");
      spinner.fail(chalk.red("❌ Validation failed: registry.json not found"));
      return { isValid: false, errors };
    }

    // Parse and validate registry.json
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

    const registryItem = validation.data;

    // Check if all files exist
    if (registryItem.files && registryItem.files.length > 0) {
      for (const file of registryItem.files) {
        const filePath = path.join(componentPath, file.path);
        if (!(await fs.pathExists(filePath))) {
          errors.push(`File not found: ${file.path}`);
        }
      }
    }

    if (errors.length > 0) {
      spinner.fail(chalk.red("❌ Validation failed: Missing files"));
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

export async function validateRegistryJson(
  registryPath: string,
): Promise<{ isValid: boolean; data?: RegistryItem; errors: string[] }> {
  const errors: string[] = [];

  try {
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
