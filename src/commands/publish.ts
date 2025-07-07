import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import {
  REGISTRY_BASE_BRANCH,
  REGISTRY_OWNER,
  REGISTRY_REPO,
} from "../lib/constants.js";
import {
  createBranch,
  createOrUpdateFile,
  createPullRequest,
  getGitHubUser,
  getMainBranchSha,
} from "../lib/github.js";
import { registryItemSchema, registrySchema } from "../lib/registry.js";
import { validateComponent } from "../lib/validator.js";
import { detectVersionChanges } from "../lib/versioning.js";

export const publish = new Command()
  .name("publish")
  .description("Publish a component to the registry")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-m, --message <message>", "Custom commit message")
  .option(
    "-i, --item <item>",
    "Specific item to publish from registry collection",
  )
  .action(async (options) => {
    const CWD = process.cwd();
    const registryJsonPath = path.join(CWD, "registry.json");

    if (!(await fs.pathExists(registryJsonPath))) {
      console.error(chalk.red("❌ registry.json not found"));
      console.log(
        chalk.yellow(
          "Make sure you are in a component directory with a valid registry.json file",
        ),
      );
      process.exit(1);
    }

    const spinner = ora("🔍 Reading and validating registry.json...").start();

    try {
      const registryJson = await fs.readJson(registryJsonPath);

      // First, try to validate as a registry collection
      const registryValidation = registrySchema.safeParse(registryJson);

      let selectedItem;
      let componentName;
      let files;

      if (registryValidation.success) {
        // It's a registry collection - ask which item to publish
        spinner.succeed(
          chalk.green(
            `✅ Found registry collection: ${chalk.cyan(registryJson.name)}`,
          ),
        );

        const items = registryValidation.data.items;

        if (items.length === 0) {
          spinner.fail(chalk.red("❌ No items found in registry collection"));
          process.exit(1);
        }

        // If specific item is provided via --item flag
        if (options.item) {
          selectedItem = items.find((item) => item.name === options.item);
          if (!selectedItem) {
            spinner.fail(
              chalk.red(
                `❌ Item '${options.item}' not found in registry collection`,
              ),
            );
            console.log(chalk.yellow("Available items:"));
            items.forEach((item) =>
              console.log(chalk.gray(`  - ${item.name}`)),
            );
            process.exit(1);
          }
        } else {
          // Ask user to select an item
          const { selectedItemName } = await inquirer.prompt([
            {
              type: "list",
              name: "selectedItemName",
              message: "Which item would you like to publish?",
              choices: items.map((item) => ({
                name: `${item.name}${item.title ? ` - ${item.title}` : ""}${item.description ? ` (${item.description.substring(0, 50)}...)` : ""}`,
                value: item.name,
              })),
            },
          ] as any);

          selectedItem = items.find((item) => item.name === selectedItemName);
        }

        // Validate the selected item
        if (!selectedItem) {
          spinner.fail(chalk.red("❌ No item selected"));
          process.exit(1);
        }

        const itemValidation = registryItemSchema.safeParse(selectedItem);
        if (!itemValidation.success) {
          spinner.fail(chalk.red("❌ Invalid item in registry collection"));
          console.error(chalk.red("Validation errors:"));
          itemValidation.error.issues.forEach((issue) => {
            console.error(
              chalk.red(`  - ${issue.path.join(".")}: ${issue.message}`),
            );
          });
          process.exit(1);
        }

        componentName = selectedItem.name;
        files = selectedItem.files;

        spinner.succeed(
          chalk.green(`✅ Selected item: ${chalk.cyan(componentName)}`),
        );
      } else {
        // Try to validate as a single registry item
        const itemValidation = registryItemSchema.safeParse(registryJson);

        if (!itemValidation.success) {
          spinner.fail(chalk.red("❌ Invalid registry.json file"));
          console.error(chalk.red("Validation errors:"));
          itemValidation.error.issues.forEach((issue) => {
            console.error(
              chalk.red(`  - ${issue.path.join(".")}: ${issue.message}`),
            );
          });
          process.exit(1);
        }

        selectedItem = registryJson;
        componentName = selectedItem.name;
        files = selectedItem.files;

        spinner.succeed(
          chalk.green(`✅ Validated component: ${chalk.cyan(componentName)}`),
        );
      }

      // Validate component files and structure
      spinner.text = "🔍 Validating component files...";
      const validationResult = await validateComponent(CWD);
      if (!validationResult.isValid) {
        spinner.fail(chalk.red("❌ Component validation failed"));
        validationResult.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
        process.exit(1);
      }
      spinner.succeed(chalk.green("✅ Component files validated"));

      // Detect version changes
      spinner.text = "📊 Analyzing version changes...";
      const currentVersion = selectedItem.version || "1.0.0";
      const versionInfo = await detectVersionChanges(CWD, currentVersion);

      if (versionInfo.hasChanges) {
        spinner.succeed(
          chalk.green(
            `📈 Version change: ${versionInfo.currentVersion} → ${versionInfo.newVersion}`,
          ),
        );

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Publish ${componentName} as version ${versionInfo.newVersion}?`,
              default: true,
            },
          ] as any);

          if (!confirm) {
            spinner.fail(chalk.yellow("❌ Publish cancelled"));
            process.exit(0);
          }
        }
      } else {
        spinner.succeed(chalk.green("✅ No version changes detected"));
      }

      // Get GitHub user and prepare for publish
      spinner.text = "🔧 Preparing for publish...";
      const user = await getGitHubUser();
      const version = versionInfo.hasChanges
        ? versionInfo.newVersion
        : currentVersion;
      const branchName = `component/${user.login}/${componentName}-${version}`;

      // Get the latest commit from main branch
      const mainBranchSha = await getMainBranchSha();

      spinner.text = "🌿 Creating new branch...";
      await createBranch(
        REGISTRY_OWNER,
        REGISTRY_REPO,
        branchName,
        mainBranchSha,
      );

      // Upload component files
      spinner.text = "📤 Uploading component files...";
      const componentDir = `components/${user.login}/${componentName}/${version}`;

      // Upload registry.json first (use the selected item, not the full collection)
      const updatedRegistryJson = {
        ...selectedItem,
        version: version,
        publishedAt: new Date().toISOString(),
        publisher: user.login,
      };

      await createOrUpdateFile(
        REGISTRY_OWNER,
        REGISTRY_REPO,
        `${componentDir}/registry.json`,
        options.message || `feat: add ${componentName} v${version}`,
        JSON.stringify(updatedRegistryJson, null, 2),
        branchName,
      );

      // Upload component files
      if (files && files.length > 0) {
        for (const file of files) {
          const filePath = path.join(CWD, file.path);
          if (await fs.pathExists(filePath)) {
            const fileContent = await fs.readFile(filePath, "utf-8");
            const registryPath = `${componentDir}/${file.path}`;

            await createOrUpdateFile(
              REGISTRY_OWNER,
              REGISTRY_REPO,
              registryPath,
              options.message || `feat: add ${componentName} v${version}`,
              fileContent,
              branchName,
            );
          }
        }
      }

      // Upload README if it exists
      const readmePath = path.join(CWD, "README.md");
      if (await fs.pathExists(readmePath)) {
        const readmeContent = await fs.readFile(readmePath, "utf-8");
        await createOrUpdateFile(
          REGISTRY_OWNER,
          REGISTRY_REPO,
          `${componentDir}/README.md`,
          options.message || `feat: add ${componentName} v${version}`,
          readmeContent,
          branchName,
        );
      }

      // Create pull request
      spinner.text = "🔗 Creating pull request...";
      const pr = await createPullRequest(
        REGISTRY_OWNER,
        REGISTRY_REPO,
        `[Component] Add ${componentName} v${version}`,
        `## Component: ${componentName} v${version}

**Author:** @${user.login}
**Description:** ${selectedItem.description}

### Files Added:
${files ? files.map((file: any) => `- \`${file.path}\` (${file.type})`).join("\n") : "- No files specified"}

### Dependencies:
${selectedItem.dependencies ? `- **NPM:** ${selectedItem.dependencies.join(", ")}` : "- None"}
${selectedItem.registryDependencies ? `- **Registry:** ${selectedItem.registryDependencies.join(", ")}` : ""}

### Categories:
${selectedItem.categories ? selectedItem.categories.map((cat: string) => `- ${cat}`).join("\n") : "- None"}

---
*Published via SCM CLI*`,
        branchName,
        REGISTRY_BASE_BRANCH,
      );

      spinner.succeed(
        chalk.green(
          `✅ Successfully published ${chalk.cyan(componentName)} v${version}`,
        ),
      );
      console.log(chalk.blue(`📋 Pull Request: ${chalk.cyan(pr.html_url)}`));
      console.log(
        chalk.green(`✅ Your component has been submitted for review`),
      );
      console.log(
        chalk.yellow(
          `💡 The component will be available for installation once the PR is merged`,
        ),
      );
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to publish component"));
      if (error instanceof Error) {
        console.error(chalk.red("Error:"), error.message);
        if (error.message.includes("Not Found")) {
          console.error(
            chalk.yellow(
              "The registry repository might not exist or you might not have access to it",
            ),
          );
        }
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
