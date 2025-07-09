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
  getLatestComponentVersion,
  getMainBranchSha,
} from "../lib/github.js";
import { registryItemSchema, registrySchema } from "../lib/registry.js";
import { validateFileTargets } from "../lib/utils.js";
import { validateComponent } from "../lib/validator.js";
import { detectVersionChanges } from "../lib/versioning.js";

/**
 * Command to publish a component to the registry
 */
export const publish = new Command()
  .name("publish")
  .description("Publish a component to the registry")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-m, --message <message>", "Custom commit message")
  .option(
    "-i, --item <item>",
    "Specific item to publish from registry collection",
  )
  .option(
    "-v, --version <version>",
    "Specify version manually (override auto-detection)",
  )
  .option("--verbose", "Show detailed information")
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

      const registryValidation = registrySchema.safeParse(registryJson);

      let selectedItem;
      let componentName;
      let files;

      if (registryValidation.success) {
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

      const fileValidation = validateFileTargets(files || [], CWD);
      if (!fileValidation.isValid) {
        spinner.fail(chalk.red("❌ File validation failed"));
        fileValidation.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
        process.exit(1);
      }

      spinner.text = "🔍 Validating component files...";
      const validationResult = await validateComponent(CWD, selectedItem);
      if (!validationResult.isValid) {
        spinner.fail(chalk.red("❌ Component validation failed"));
        validationResult.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
        process.exit(1);
      }
      spinner.succeed(chalk.green("✅ Component files validated"));

      spinner.text = "📊 Analyzing version changes...";

      const user = await getGitHubUser();

      const latestRemoteVersion = await getLatestComponentVersion(
        user.login,
        componentName,
      );
      const localVersion = selectedItem.version || "0.0.1";

      const baseVersion = latestRemoteVersion || localVersion;

      let versionInfo;
      if (options.version) {
        versionInfo = {
          currentVersion: baseVersion,
          newVersion: options.version,
          changeType: "manual" as const,
          hasChanges: true,
        };
        spinner.succeed(
          chalk.green(
            `📈 Manual version specified: ${versionInfo.currentVersion} → ${versionInfo.newVersion}`,
          ),
        );
      } else {
        versionInfo = await detectVersionChanges(CWD, baseVersion);
        if (versionInfo.hasChanges) {
          spinner.succeed(
            chalk.green(
              `📈 Version change: ${versionInfo.currentVersion} → ${versionInfo.newVersion}`,
            ),
          );
        } else {
          spinner.succeed(chalk.green("✅ No version changes detected"));
        }
      }

      if (versionInfo.hasChanges && !options.yes) {
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

      spinner.text = "🔧 Preparing for publish...";
      const version = versionInfo.hasChanges
        ? versionInfo.newVersion
        : baseVersion;
      const timestamp = Date.now();
      const branchName = `component/${user.login}/${componentName}-${version}-${timestamp}`;

      const mainBranchSha = await getMainBranchSha();

      spinner.text = "🌿 Creating new branch...";
      await createBranch(
        REGISTRY_OWNER,
        REGISTRY_REPO,
        branchName,
        mainBranchSha,
      );

      spinner.text = "📤 Uploading component files...";
      const componentDir = `components/${user.login}/${componentName}/${version}`;

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
