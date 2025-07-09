import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { isReservedComponentName } from "../lib/constants.js";
import { getGitHubUser } from "../lib/github.js";
import {
  getComponentFileUrl,
  getComponentReadmeUrl,
  getComponentRegistryUrl,
  resolveComponentVersion,
} from "../lib/registry.js";

/**
 * Command to fork a component from the registry
 */
export const fork = new Command()
  .name("fork")
  .description("Fork a component from the registry")
  .argument("<component-name>", "Component name (e.g., user/button[@1.0.0])")
  .option("-n, --name <name>", "New name for forked component")
  .option("-d, --description <description>", "Custom description for fork")
  .option("-p, --path <path>", "Custom output path")
  .option("-f, --force", "Overwrite existing directory")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (componentName, options) => {
    const versionMatch = componentName.match(/^(.+?)@(.+)$/);
    const componentWithoutVersion = versionMatch
      ? versionMatch[1]
      : componentName;
    const version = versionMatch ? versionMatch[2] : "latest";

    const [namespace, name] = componentWithoutVersion.split("/");
    if (!namespace || !name) {
      console.error(
        chalk.red(
          "❌ Invalid component name. Use: <namespace>/<component>[@version]",
        ),
      );
      process.exit(1);
    }

    const CWD = process.cwd();

    const resolvedVersion = await resolveComponentVersion(
      componentWithoutVersion,
      version,
    );
    const componentIdWithVersion = `${componentWithoutVersion}@${resolvedVersion}`;

    const componentUrl = getComponentRegistryUrl(
      namespace,
      name,
      resolvedVersion,
    );

    const fetchSpinner = ora(
      `📦 Fetching ${chalk.cyan(componentIdWithVersion)}...`,
    ).start();
    try {
      const { data: registryItem } = await axios.get(componentUrl);
      fetchSpinner.succeed(
        chalk.green(`✅ Fetched ${chalk.cyan(componentIdWithVersion)}`),
      );

      let newComponentName = options.name;
      if (!newComponentName) {
        if (options.yes) {
          newComponentName = `${name}-fork`;
        } else {
          const { name: inputName } = await inquirer.prompt([
            {
              type: "input",
              name: "name",
              message: "Enter new name for forked component:",
              default: `${name}-fork`,
            },
          ] as any);
          newComponentName = inputName;
        }
      }

      if (isReservedComponentName(newComponentName)) {
        console.error(
          chalk.red(`❌ Component name "${newComponentName}" is reserved`),
        );
        console.error(
          chalk.yellow(
            "This name conflicts with an existing shadcn/ui component",
          ),
        );
        console.error(
          chalk.gray(
            "Please choose a different name for your forked component",
          ),
        );
        process.exit(1);
      }

      let newNamespace: string;
      try {
        const user = await getGitHubUser();
        newNamespace = user.login;
      } catch (error) {
        if (options.yes) {
          console.error(chalk.red("❌ Authentication required for forking"));
          console.error(chalk.yellow("Please run 'scm login' first"));
          process.exit(1);
        }
        const { namespace: inputNamespace } = await inquirer.prompt([
          {
            type: "input",
            name: "namespace",
            message: "Enter your GitHub username:",
          },
        ] as any);
        newNamespace = inputNamespace;
      }

      const customPath = options.path;
      const basePath = customPath || CWD;
      const newComponentDir = path.join(
        basePath,
        "components",
        newComponentName,
      );

      if (await fs.pathExists(newComponentDir)) {
        if (options.force) {
          await fs.remove(newComponentDir);
        } else {
          console.error(
            chalk.red(
              `❌ Component directory already exists: ${newComponentDir}`,
            ),
          );
          console.error(
            chalk.yellow("Use --force to overwrite existing directory"),
          );
          process.exit(1);
        }
      }

      const forkSpinner = ora(
        `🔀 Forking to ${chalk.cyan(`${newNamespace}/${newComponentName}`)}...`,
      ).start();

      await fs.ensureDir(newComponentDir);

      for (const file of registryItem.files || []) {
        const fileUrl = getComponentFileUrl(
          namespace,
          name,
          resolvedVersion,
          file.path,
        );
        const { data: fileContent } = await axios.get(fileUrl);

        const fileName = path.basename(file.path);
        const newFilePath = path.join(newComponentDir, fileName);
        await fs.writeFile(newFilePath, fileContent);
      }

      const readmeUrl = getComponentReadmeUrl(namespace, name, resolvedVersion);
      try {
        const { data: readmeContent } = await axios.get(readmeUrl);
        await fs.writeFile(
          path.join(newComponentDir, "README.md"),
          readmeContent,
        );
      } catch (error) {
        const customDescription =
          options.description || registryItem.description;
        const basicReadme = `# ${newComponentName}

This is a fork of ${componentWithoutVersion} by ${registryItem.author}.

## Original Component
- **Name**: ${registryItem.title || registryItem.name}
- **Author**: ${registryItem.author || "Unknown"}
- **Original**: ${namespace}/${name}@${resolvedVersion}

## Description
${customDescription || "No description available"}

## Modifications
This component has been forked and may contain modifications. Please review the changes before using in production.

${registryItem.description || ""}
`;
        await fs.writeFile(
          path.join(newComponentDir, "README.md"),
          basicReadme,
        );
      }

      const customDescription = options.description || registryItem.description;
      const newRegistryItem = {
        ...registryItem,
        name: newComponentName,
        title: `${registryItem.title || registryItem.name} (Fork)`,
        description:
          customDescription ||
          `Fork of ${registryItem.title || registryItem.name} by ${registryItem.author || "Unknown"}. ${registryItem.description || ""}`,
        author: `${newNamespace} <${newNamespace}@users.noreply.github.com>`,
        files:
          registryItem.files?.map((file: any) => ({
            ...file,
            path: path.basename(file.path),
          })) || [],
      };

      await fs.writeJson(
        path.join(newComponentDir, "registry.json"),
        newRegistryItem,
        { spaces: 2 },
      );

      forkSpinner.succeed(
        chalk.green(
          `✅ Forked ${chalk.cyan(componentIdWithVersion)} to ${chalk.cyan(`${newNamespace}/${newComponentName}`)}`,
        ),
      );

      console.log(
        chalk.green(`📁 Component forked to: ${chalk.cyan(newComponentDir)}`),
      );
      console.log(chalk.yellow(`💡 Next steps:`));
      console.log(`   1. Review and modify the component files`);
      console.log(`   2. Update the registry.json metadata if needed`);
      console.log(`   3. Test your changes`);
      console.log(
        `   4. Run ${chalk.cyan(`scm publish`)} to publish your forked component`,
      );
    } catch (error) {
      fetchSpinner.fail(
        chalk.red(`❌ Failed to fork ${chalk.cyan(componentIdWithVersion)}`),
      );
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Component not found in registry"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
