import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { getCachedComponent, setCachedComponent } from "../lib/cache.js";
import { REGISTRY_URL, isReservedComponentName } from "../lib/constants.js";

/**
 * Command to add a component to the current project
 */
export const add = new Command()
  .name("add")
  .description("Add a component to your project")
  .argument("<component-name>", "Component name (e.g., user/button[@1.0.0])")
  .option("-f, --force", "Force refresh cache")
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

    // Check if this is a reserved component name
    if (isReservedComponentName(name)) {
      console.log(
        chalk.yellow(`⚠️  "${name}" is a reserved shadcn/ui component name`),
      );
      console.log(chalk.blue(`🔄 Redirecting to shadcn add ${name}...`));

      try {
        const { execSync } = await import("child_process");
        execSync(`npx shadcn@latest add ${name}`, {
          stdio: "inherit",
          cwd: process.cwd(),
        });
        console.log(
          chalk.green(`✅ Successfully installed ${name} using shadcn/ui`),
        );
        return;
      } catch (error) {
        console.error(
          chalk.red(`❌ Failed to install ${name} using shadcn/ui`),
        );
        console.error(
          chalk.yellow(
            "💡 Make sure you have shadcn/ui initialized in your project",
          ),
        );
        process.exit(1);
      }
    }

    const CWD = process.cwd();
    const componentsJsonPath = path.join(CWD, "components.json");

    if (!(await fs.pathExists(componentsJsonPath))) {
      console.error(chalk.red("❌ components.json not found"));
      console.log(
        chalk.yellow("💡 Set up shadcn/ui first: npx shadcn@latest init"),
      );
      process.exit(1);
    }

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

      for (const file of registryItem.files) {
        const fileUrl = `${REGISTRY_URL}/${namespace}/${name}/${version}/${file.path}`;
        const { data: fileContent } = await axios.get(fileUrl);

        const localPath = file.path.replace(
          "components",
          aliases.components.replace("@/", ""),
        );
        const installPath = path.join(CWD, localPath);

        await fs.ensureDir(path.dirname(installPath));
        await fs.writeFile(installPath, fileContent);
      }

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

      if (registryItem.registryDependencies?.length > 0) {
        installSpinner.text = "🔗 Installing registry dependencies...";
        for (const dep of registryItem.registryDependencies) {
          try {
            const { execSync } = await import("child_process");

            // Check if this dependency is a reserved component name
            const depName = dep.split("/").pop() || dep;
            if (isReservedComponentName(depName)) {
              console.log(
                chalk.yellow(
                  `⚠️  Dependency "${depName}" is a reserved shadcn/ui component`,
                ),
              );
              console.log(
                chalk.blue(`🔄 Installing ${depName} using shadcn/ui...`),
              );
              execSync(`npx shadcn@latest add ${depName}`, {
                stdio: "inherit",
                cwd: CWD,
              });
            } else {
              execSync(`scm add ${dep}`, { stdio: "inherit", cwd: CWD });
            }
          } catch (error) {
            console.warn(
              chalk.yellow(
                `⚠️  Failed to install dependency ${dep}. Install manually.`,
              ),
            );
          }
        }
      }

      if (registryItem.cssVars) {
        installSpinner.text = "🎨 Applying CSS variables...";
        await applyCssVariables(registryItem.cssVars, aliases, CWD);
      }

      // Track the installed component for future updates
      await trackInstalledComponent(componentName, version, CWD);

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

/**
 * Detects the package manager used in the current project
 * @param cwd - Current working directory
 * @returns Promise resolving to package manager name
 */
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

  return "npm";
}

/**
 * Generates the install command for the specified package manager
 * @param packageManager - Package manager name
 * @param dependencies - Array of dependencies to install
 * @returns Install command string
 */
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

/**
 * Applies CSS variables to the project's CSS file
 * @param cssVars - CSS variables object
 * @param aliases - Project aliases configuration
 * @param cwd - Current working directory
 */
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

/**
 * Tracks an installed component for future updates
 * @param componentName - Name of the component
 * @param version - Version that was installed
 * @param cwd - Current working directory
 */
async function trackInstalledComponent(
  componentName: string,
  version: string,
  cwd: string,
) {
  try {
    const trackingPath = path.join(cwd, ".scm-installed.json");
    let tracking: Record<string, { version: string; installedAt: string }> = {};

    if (await fs.pathExists(trackingPath)) {
      tracking = await fs.readJson(trackingPath);
    }

    tracking[componentName] = {
      version,
      installedAt: new Date().toISOString(),
    };

    await fs.writeJson(trackingPath, tracking, { spaces: 2 });
  } catch (error) {
    // Silently fail - tracking is not critical
    console.warn(chalk.yellow("⚠️  Failed to track installed component"));
  }
}
