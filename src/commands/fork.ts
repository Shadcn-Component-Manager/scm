import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { REGISTRY_URL, isReservedComponentName } from "../lib/constants.js";
import { getGitHubUser } from "../lib/github.js";

/**
 * Command to fork a component from the registry
 */
export const fork = new Command()
  .name("fork")
  .description("Fork a component from the registry")
  .argument("<component-name>", "Component name (e.g., user/button)")
  .option("-v, --version <version>", "Version to fork", "latest")
  .option("-n, --name <name>", "New name for forked component")
  .action(async (componentName, options) => {
    const [namespace, name] = componentName.split("/");
    if (!namespace || !name) {
      console.error(
        chalk.red("❌ Invalid component name. Use: <namespace>/<component>"),
      );
      process.exit(1);
    }

    const CWD = process.cwd();
    const componentUrl = `${REGISTRY_URL}/${namespace}/${name}/${options.version}/registry.json`;

    const fetchSpinner = ora(
      `📦 Fetching ${chalk.cyan(componentName)}...`,
    ).start();
    try {
      const { data: registryItem } = await axios.get(componentUrl);
      fetchSpinner.succeed(
        chalk.green(`✅ Fetched ${chalk.cyan(componentName)}`),
      );

      let newComponentName = options.name;
      if (!newComponentName) {
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

      // Validate that the new component name is not reserved
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
        // If authentication fails after auto-login, fall back to manual input
        const { namespace: inputNamespace } = await inquirer.prompt([
          {
            type: "input",
            name: "namespace",
            message: "Enter your GitHub username:",
          },
        ] as any);
        newNamespace = inputNamespace;
      }

      const forkSpinner = ora(
        `🔀 Forking to ${chalk.cyan(`${newNamespace}/${newComponentName}`)}...`,
      ).start();

      const newComponentDir = path.join(CWD, "components", newComponentName);
      await fs.ensureDir(newComponentDir);

      for (const file of registryItem.files) {
        const fileUrl = `${REGISTRY_URL}/${namespace}/${name}/${options.version}/${file.path}`;
        const { data: fileContent } = await axios.get(fileUrl);

        const fileName = path.basename(file.path);
        const newFilePath = path.join(newComponentDir, fileName);
        await fs.writeFile(newFilePath, fileContent);
      }

      const readmeUrl = `${REGISTRY_URL}/${namespace}/${name}/${options.version}/README.md`;
      try {
        const { data: readmeContent } = await axios.get(readmeUrl);
        await fs.writeFile(
          path.join(newComponentDir, "README.md"),
          readmeContent,
        );
      } catch (error) {
        const basicReadme = `# ${newComponentName}

This is a fork of ${componentName} by ${registryItem.author}.

## Original Component
- **Name**: ${registryItem.title}
- **Author**: ${registryItem.author}
- **Original**: ${namespace}/${name}@${options.version}

## Modifications
This component has been forked and may contain modifications. Please review the changes before using in production.

${registryItem.description}
`;
        await fs.writeFile(
          path.join(newComponentDir, "README.md"),
          basicReadme,
        );
      }

      const newRegistryItem = {
        ...registryItem,
        name: newComponentName,
        title: `${registryItem.title} (Fork)`,
        description: `Fork of ${registryItem.title} by ${registryItem.author}. ${registryItem.description}`,
        author: `${newNamespace} <${newNamespace}@users.noreply.github.com>`,
        files: registryItem.files.map((file: any) => ({
          ...file,
          path: path.basename(file.path),
        })),
      };

      await fs.writeJson(
        path.join(newComponentDir, "registry.json"),
        newRegistryItem,
        { spaces: 2 },
      );

      forkSpinner.succeed(
        chalk.green(
          `✅ Forked ${chalk.cyan(componentName)} to ${chalk.cyan(`${newNamespace}/${newComponentName}`)}`,
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
        chalk.red(`❌ Failed to fork ${chalk.cyan(componentName)}`),
      );
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Component not found in registry"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
