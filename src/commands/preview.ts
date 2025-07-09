import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { getCachedComponent, setCachedComponent } from "../lib/cache.js";
import {
  getComponentFileUrl,
  getComponentReadmeUrl,
  getComponentRegistryUrl,
  resolveComponentVersion,
} from "../lib/registry.js";
import { parseComponentName, validateVersion, withRetry } from "../lib/utils.js";

/**
 * Command to preview a component from the registry
 */
export const preview = new Command()
  .name("preview")
  .description("Preview a component from the registry")
  .argument("<component-name>", "Component name (e.g., user/button[@1.0.0])")
  .option("-f, --force", "Force refresh cache")
  .option(
    "-o, --output <format>",
    "Output format (text, json, markdown)",
    "text",
  )
  .option("-r, --raw", "Show raw file content")
  .option("-d, --dependencies", "Show dependency tree")
  .option("-c, --code", "Show only code without metadata")
  .option("-v, --verbose", "Show detailed information")
  .action(async (componentName, options) => {
    const parsedComponent = parseComponentName(componentName);
    if (!parsedComponent.isValid) {
      console.error(chalk.red(`❌ ${parsedComponent.error}`));
      process.exit(1);
    }

    const { namespace, name, version } = parsedComponent;

    if (version !== "latest") {
      const versionValidation = validateVersion(version);
      if (!versionValidation.isValid) {
        console.error(chalk.red(`❌ ${versionValidation.error}`));
        process.exit(1);
      }
    }

    const resolvedVersion = await resolveComponentVersion(
      `${namespace}/${name}`,
      version,
    );

    const componentUrl = getComponentRegistryUrl(
      namespace,
      name,
      resolvedVersion,
    );

    const fetchSpinner = options.code
      ? null
      : ora(
          `📦 Fetching ${chalk.cyan(`${namespace}/${name}@${resolvedVersion}`)}...`,
        ).start();

    try {
      let registryItem: any;

      if (!options.force) {
        const cached = await getCachedComponent(namespace, name);
        if (cached) {
          if (options.verbose) {
            console.log(chalk.green("✅ Using cached data"));
          }
          registryItem = cached;
        }
      }

      if (!registryItem) {
        if (options.verbose) {
          console.log(chalk.blue(`📥 Fetching from registry: ${componentUrl}`));
        }
        const { data } = await withRetry(
          () => axios.get(componentUrl),
          {},
          `Fetch component ${namespace}/${name}@${resolvedVersion}`
        );
        registryItem = data;
        await setCachedComponent(namespace, name, data);
      }

      if (!options.code) {
        fetchSpinner?.succeed(
          chalk.green(
            `✅ Fetched ${chalk.cyan(`${namespace}/${name}@${resolvedVersion}`)}`,
          ),
        );
      }

      if (options.output === "json") {
        console.log(JSON.stringify(registryItem, null, 2));
        return;
      }

      if (options.code) {
        for (const file of registryItem.files || []) {
          const fileUrl = getComponentFileUrl(
            namespace,
            name,
            resolvedVersion,
            file.path,
          );
          const { data: fileContent } = await withRetry(
            () => axios.get(fileUrl),
            {},
            `Download file ${file.path}`
          );
          console.log(`// ${file.path}`);
          console.log(fileContent);
          console.log("");
        }
        return;
      }

      if (options.raw) {
        console.log(JSON.stringify(registryItem, null, 2));
        return;
      }

      if (options.dependencies) {
        console.log(
          chalk.bold(
            `\n📦 Dependencies for ${registryItem.name}@${resolvedVersion}`,
          ),
        );
        console.log(chalk.gray("─".repeat(50)));

        if (registryItem.dependencies?.length > 0) {
          console.log(chalk.cyan("\n📦 NPM Dependencies:"));
          registryItem.dependencies.forEach((dep: string) => {
            console.log(`  - ${dep}`);
          });
        } else {
          console.log(chalk.gray("\n📦 NPM Dependencies: None"));
        }

        if (registryItem.registryDependencies?.length > 0) {
          console.log(chalk.cyan("\n🔗 Registry Dependencies:"));
          registryItem.registryDependencies.forEach((dep: string) => {
            console.log(`  - ${dep}`);
          });
        } else {
          console.log(chalk.gray("\n🔗 Registry Dependencies: None"));
        }

        if (registryItem.devDependencies?.length > 0) {
          console.log(chalk.cyan("\n🔧 Dev Dependencies:"));
          registryItem.devDependencies.forEach((dep: string) => {
            console.log(`  - ${dep}`);
          });
        }

        return;
      }

      if (options.output === "markdown") {
        console.log(`# ${registryItem.title || registryItem.name}`);
        console.log(`\n**Author:** ${registryItem.author || "Unknown"}`);
        console.log(`**Version:** ${resolvedVersion}`);
        console.log(`**Type:** ${registryItem.type || "Unknown"}`);
        console.log(`**Published:** ${registryItem.publishedAt || "Unknown"}`);

        if (registryItem.description) {
          console.log(`\n## Description\n\n${registryItem.description}`);
        }

        if (registryItem.categories?.length > 0) {
          console.log(
            `\n## Categories\n\n${registryItem.categories.join(", ")}`,
          );
        }

        if (registryItem.dependencies?.length > 0) {
          console.log(
            `\n## Dependencies\n\n${registryItem.dependencies.join(", ")}`,
          );
        }

        if (registryItem.registryDependencies?.length > 0) {
          console.log(
            `\n## Registry Dependencies\n\n${registryItem.registryDependencies.join(", ")}`,
          );
        }

        console.log(`\n## Files\n`);
        registryItem.files?.forEach((file: any, index: number) => {
          console.log(`${index + 1}. \`${file.path}\` (${file.type})`);
        });

        if (registryItem.cssVars) {
          console.log(`\n## CSS Variables\n`);
          if (registryItem.cssVars.theme) {
            console.log(
              `### Theme\n\`\`\`css\n${Object.entries(
                registryItem.cssVars.theme,
              )
                .map(([key, value]) => `--${key}: ${value};`)
                .join("\n")}\n\`\`\``,
            );
          }
          if (registryItem.cssVars.light) {
            console.log(
              `### Light Theme\n\`\`\`css\n${Object.entries(
                registryItem.cssVars.light,
              )
                .map(([key, value]) => `--${key}: ${value};`)
                .join("\n")}\n\`\`\``,
            );
          }
          if (registryItem.cssVars.dark) {
            console.log(
              `### Dark Theme\n\`\`\`css\n${Object.entries(
                registryItem.cssVars.dark,
              )
                .map(([key, value]) => `--${key}: ${value};`)
                .join("\n")}\n\`\`\``,
            );
          }
        }

        return;
      }

      console.log(chalk.bold(`\n${registryItem.title || registryItem.name}`));
      console.log(chalk.gray(`by ${registryItem.author || "Unknown"}`));
      console.log(chalk.gray(`Version: ${resolvedVersion}`));
      console.log(chalk.gray(`Type: ${registryItem.type || "Unknown"}`));
      if (registryItem.publishedAt) {
        console.log(chalk.gray(`Published: ${registryItem.publishedAt}`));
      }
      console.log(
        `\n${registryItem.description || "No description available"}\n`,
      );

      if (registryItem.categories?.length > 0) {
        console.log(
          chalk.cyan("Categories:"),
          registryItem.categories.join(", "),
        );
      }

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

      const readmeUrl = getComponentReadmeUrl(namespace, name, resolvedVersion);
      try {
        const { data: readmeContent } = await withRetry(
          () => axios.get(readmeUrl),
          {},
          `Download README for ${namespace}/${name}@${resolvedVersion}`
        );
        console.log(chalk.bold("\n📖 README:"));
        console.log(chalk.gray("─".repeat(50)));
        console.log(readmeContent);
        console.log(chalk.gray("─".repeat(50)));
      } catch (error) {
        console.log(chalk.yellow("\nNo README found for this component"));
      }

      console.log(chalk.bold("\n📁 Files:"));
      registryItem.files?.forEach((file: any, index: number) => {
        console.log(`  ${index + 1}. ${chalk.cyan(file.path)} (${file.type})`);
      });

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
          `\n💡 To install this component, run: ${chalk.cyan(`scm add ${namespace}/${name}@${resolvedVersion}`)}`,
        ),
      );
    } catch (error) {
      if (!options.code) {
        fetchSpinner?.fail(
          chalk.red(
            `❌ Failed to fetch ${chalk.cyan(`${namespace}/${name}@${resolvedVersion}`)}`,
          ),
        );
      }
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Component not found in registry"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
