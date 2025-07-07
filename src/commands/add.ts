import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { getCachedComponent, setCachedComponent } from "../lib/cache.js";
import { REGISTRY_URL } from "../lib/constants.js";

export const add = new Command()
  .name("add")
  .description("Add a component to your project")
  .argument("<component-name>", "Component name (e.g., user/button[@1.0.0])")
  .option("-f, --force", "Force refresh cache")
  .action(async (componentName, options) => {
    // Parse component name and version
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
    const componentsJsonPath = path.join(CWD, "components.json");

    // Validate shadcn/ui setup
    if (!(await fs.pathExists(componentsJsonPath))) {
      console.error(chalk.red("❌ components.json not found"));
      console.log(
        chalk.yellow("💡 Set up shadcn/ui first: npx shadcn@latest init"),
      );
      process.exit(1);
    }

    // Read aliases from components.json
    let aliases = { components: "@/components", utils: "@/lib/utils" };
    try {
      const componentsJson = await fs.readJson(componentsJsonPath);
      if (componentsJson.aliases) aliases = componentsJson.aliases;
    } catch (error) {
      console.error(chalk.red("❌ Failed to read components.json"));
      process.exit(1);
    }

    const componentUrl = `${REGISTRY_URL}/${namespace}/${name}/${version}/registry.json`;
    const spinner = ora(`📦 Fetching ${chalk.cyan(componentName)}...`).start();

    try {
      let registryItem: any;

      // Try cache first (unless force refresh)
      const cacheKey = `${namespace}-${name}-${version}`;
      if (!options.force) {
        const cached = await getCachedComponent(namespace, name);
        if (cached) {
          spinner.succeed(
            chalk.green(
              `✅ Using cached data for ${chalk.cyan(componentName)}`,
            ),
          );
          registryItem = cached;
        } else {
          const { data } = await axios.get(componentUrl);
          registryItem = data;
          await setCachedComponent(namespace, name, data);
          spinner.succeed(
            chalk.green(`✅ Fetched ${chalk.cyan(componentName)}`),
          );
        }
      } else {
        const { data } = await axios.get(componentUrl);
        registryItem = data;
        await setCachedComponent(namespace, name, data);
        spinner.succeed(chalk.green(`✅ Fetched ${chalk.cyan(componentName)}`));
      }

      const installSpinner = ora("🔧 Installing component...").start();

      // Install component files
      for (const file of registryItem.files) {
        const fileUrl = `${REGISTRY_URL}/${namespace}/${name}/${version}/${file.path}`;
        const { data: fileContent } = await axios.get(fileUrl);

        // Map to local aliases
        const localPath = file.path.replace(
          "components",
          aliases.components.replace("@/", ""),
        );
        const installPath = path.join(CWD, localPath);

        await fs.ensureDir(path.dirname(installPath));
        await fs.writeFile(installPath, fileContent);
      }

      // Install npm dependencies using current package manager
      if (registryItem.dependencies?.length > 0) {
        installSpinner.text = "📦 Installing npm dependencies...";
        const { execSync } = await import("child_process");
        try {
          const packageManager = await detectPackageManager(CWD);
          const installCommand = getInstallCommand(
            packageManager,
            registryItem.dependencies,
          );
          execSync(installCommand, { stdio: "inherit", cwd: CWD });
        } catch (error) {
          console.warn(
            chalk.yellow(
              "⚠️  Failed to install npm dependencies. Install manually.",
            ),
          );
        }
      }

      // Install registry dependencies from our SCM registry
      if (registryItem.registryDependencies?.length > 0) {
        installSpinner.text = "🔗 Installing registry dependencies...";
        for (const dep of registryItem.registryDependencies) {
          try {
            const { execSync } = await import("child_process");
            // Use our SCM registry for dependencies
            execSync(`scm add ${dep}`, { stdio: "inherit", cwd: CWD });
          } catch (error) {
            console.warn(
              chalk.yellow(
                `⚠️  Failed to install dependency ${dep}. Install manually.`,
              ),
            );
          }
        }
      }

      // Apply CSS variables
      if (registryItem.cssVars) {
        installSpinner.text = "🎨 Applying CSS variables...";
        await applyCssVariables(registryItem.cssVars, aliases, CWD);
      }

      installSpinner.succeed(
        chalk.green(`✅ ${chalk.cyan(componentName)} installed successfully`),
      );
    } catch (error) {
      spinner.fail(
        chalk.red(`❌ Failed to install ${chalk.cyan(componentName)}`),
      );
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Component not found in registry"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });

async function detectPackageManager(cwd: string): Promise<string> {
  const packageManagers = [
    { name: "pnpm", files: ["pnpm-lock.yaml"] },
    { name: "yarn", files: ["yarn.lock"] },
    { name: "bun", files: ["bun.lockb"] },
    { name: "npm", files: ["package-lock.json"] },
  ];

  for (const pm of packageManagers) {
    for (const file of pm.files) {
      if (await fs.pathExists(path.join(cwd, file))) {
        return pm.name;
      }
    }
  }

  // Default to npm if no lock file found
  return "npm";
}

function getInstallCommand(
  packageManager: string,
  dependencies: string[],
): string {
  const deps = dependencies.join(" ");

  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${deps}`;
    case "yarn":
      return `yarn add ${deps}`;
    case "bun":
      return `bun add ${deps}`;
    case "npm":
    default:
      return `npm install ${deps}`;
  }
}

async function applyCssVariables(cssVars: any, aliases: any, cwd: string) {
  const cssPath = path.join(cwd, aliases.css || "src/app/globals.css");

  if (await fs.pathExists(cssPath)) {
    let cssContent = await fs.readFile(cssPath, "utf-8");

    const cssVarsContent = `
/* SCM Component CSS Variables */
:root {
  ${Object.entries(cssVars.theme || {})
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}
}

.light {
  ${Object.entries(cssVars.light || {})
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}
}

.dark {
  ${Object.entries(cssVars.dark || {})
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}
}
`;

    cssContent += cssVarsContent;
    await fs.writeFile(cssPath, cssContent);
  }
}
