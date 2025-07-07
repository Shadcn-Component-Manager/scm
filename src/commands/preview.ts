import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { REGISTRY_URL } from "../lib/constants.js";

export const preview = new Command()
  .name("preview")
  .description("Preview a component from the registry")
  .argument("<component-name>", "Component name (e.g., user/button)")
  .option("-v, --version <version>", "Version to preview", "latest")
  .action(async (componentName, options) => {
    const [namespace, name] = componentName.split("/");
    if (!namespace || !name) {
      console.error(
        chalk.red("❌ Invalid component name. Use: <namespace>/<component>"),
      );
      process.exit(1);
    }

    const componentUrl = `${REGISTRY_URL}/${namespace}/${name}/${options.version}/registry.json`;

    const fetchSpinner = ora(
      `📦 Fetching ${chalk.cyan(componentName)}...`,
    ).start();
    try {
      const { data: registryItem } = await axios.get(componentUrl);
      fetchSpinner.succeed(
        chalk.green(`✅ Fetched ${chalk.cyan(componentName)}`),
      );

      // Display component information
      console.log(chalk.bold(`\n${registryItem.title}`));
      console.log(chalk.gray(`by ${registryItem.author}`));
      console.log(chalk.gray(`Version: ${options.version}`));
      console.log(chalk.gray(`Type: ${registryItem.type}`));
      console.log(`\n${registryItem.description}\n`);

      // Display categories
      if (registryItem.categories?.length > 0) {
        console.log(
          chalk.cyan("Categories:"),
          registryItem.categories.join(", "),
        );
      }

      // Display dependencies
      if (registryItem.dependencies?.length > 0) {
        console.log(
          chalk.yellow("\nDependencies:"),
          registryItem.dependencies.join(", "),
        );
      }

      if (registryItem.registryDependencies?.length > 0) {
        console.log(
          chalk.yellow("Registry Dependencies:"),
          registryItem.registryDependencies.join(", "),
        );
      }

      // Try to fetch and display README
      const readmeUrl = `${REGISTRY_URL}/${namespace}/${name}/${options.version}/README.md`;
      try {
        const { data: readmeContent } = await axios.get(readmeUrl);
        console.log(chalk.bold("\n📖 README:"));
        console.log(chalk.gray("─".repeat(50)));
        console.log(readmeContent);
        console.log(chalk.gray("─".repeat(50)));
      } catch (error) {
        console.log(chalk.yellow("\nNo README found for this component"));
      }

      // Display files included in the component
      console.log(chalk.bold("\n📁 Files:"));
      registryItem.files.forEach((file: any, index: number) => {
        console.log(`  ${index + 1}. ${chalk.cyan(file.path)} (${file.type})`);
      });

      // Display CSS variables
      if (registryItem.cssVars) {
        console.log(chalk.bold("\n🎨 CSS Variables:"));
        if (registryItem.cssVars.theme) {
          console.log(
            chalk.gray("  Theme:"),
            Object.keys(registryItem.cssVars.theme).join(", "),
          );
        }
        if (registryItem.cssVars.light) {
          console.log(
            chalk.gray("  Light:"),
            Object.keys(registryItem.cssVars.light).join(", "),
          );
        }
        if (registryItem.cssVars.dark) {
          console.log(
            chalk.gray("  Dark:"),
            Object.keys(registryItem.cssVars.dark).join(", "),
          );
        }
      }

      console.log(
        chalk.green(
          `\n💡 To install this component, run: ${chalk.cyan(`scm add ${componentName}@${options.version}`)}`,
        ),
      );
    } catch (error) {
      fetchSpinner.fail(
        chalk.red(`❌ Failed to fetch ${chalk.cyan(componentName)}`),
      );
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Component not found in registry"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
