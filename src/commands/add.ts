import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { getCachedComponent, setCachedComponent } from "../lib/cache.js";
import { isReservedComponentName } from "../lib/constants.js";
import {
  getComponentFileUrl,
  getComponentRegistryUrl,
  resolveComponentVersion,
} from "../lib/registry.js";

/**
 * Command to add a component to the current project.
 */
export const add = new Command()
  .name("add")
  .description("Add a component to your project")
  .argument("<component-name>", "Component name (e.g., user/button[@1.0.0])")
  .option("-f, --force", "Force refresh cache")
  .option("-d, --dry-run", "Show what would be installed without installing")
  .option("-p, --path <path>", "Custom installation path")
  .option("-s, --skip-deps", "Skip installing dependencies")
  .option("-v, --verbose", "Show detailed installation info")
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

    if (isReservedComponentName(name)) {
      console.log(
        chalk.yellow(`⚠️  "${name}" is a reserved shadcn/ui component name`),
      );
      console.log(chalk.blue(`🔄 Redirecting to shadcn add ${name}...`));

      if (options.dryRun) {
        console.log(chalk.cyan(`Would run: npx shadcn@latest add ${name}`));
        return;
      }

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

    const spinner = options.verbose
      ? null
      : ora(`📦 Fetching ${chalk.cyan(componentIdWithVersion)}...`).start();

    try {
      let registryItem: any;

      const cacheKey = `${namespace}-${name}-${resolvedVersion}`;
      if (!options.force) {
        const cached = await getCachedComponent(namespace, name);
        if (cached) {
          if (options.verbose) {
            console.log(
              chalk.green(
                `✅ Using cached data for ${chalk.cyan(componentIdWithVersion)}`,
              ),
            );
          } else {
            spinner?.succeed(
              chalk.green(
                `✅ Using cached data for ${chalk.cyan(componentIdWithVersion)}`,
              ),
            );
          }
          registryItem = cached;
        } else {
          if (options.verbose) {
            console.log(
              chalk.blue(`📥 Fetching from registry: ${componentUrl}`),
            );
          }
          const { data } = await axios.get(componentUrl);
          registryItem = data;
          await setCachedComponent(namespace, name, data);
          if (options.verbose) {
            console.log(
              chalk.green(`✅ Fetched ${chalk.cyan(componentIdWithVersion)}`),
            );
          } else {
            spinner?.succeed(
              chalk.green(`✅ Fetched ${chalk.cyan(componentIdWithVersion)}`),
            );
          }
        }
      } else {
        if (options.verbose) {
          console.log(
            chalk.blue(`🔄 Force refreshing from registry: ${componentUrl}`),
          );
        }
        const { data } = await axios.get(componentUrl);
        registryItem = data;
        await setCachedComponent(namespace, name, data);
        if (options.verbose) {
          console.log(
            chalk.green(`✅ Fetched ${chalk.cyan(componentIdWithVersion)}`),
          );
        } else {
          spinner?.succeed(
            chalk.green(`✅ Fetched ${chalk.cyan(componentIdWithVersion)}`),
          );
        }
      }

      if (options.verbose) {
        console.log(chalk.blue(`📋 Component details:`));
        console.log(`  Name: ${registryItem.name}`);
        console.log(`  Title: ${registryItem.title || "N/A"}`);
        console.log(`  Description: ${registryItem.description || "N/A"}`);
        console.log(`  Author: ${registryItem.author || "N/A"}`);
        console.log(`  Type: ${registryItem.type || "N/A"}`);
        console.log(`  Files: ${registryItem.files?.length || 0}`);
        if (registryItem.dependencies?.length > 0) {
          console.log(
            `  Dependencies: ${registryItem.dependencies.join(", ")}`,
          );
        }
        if (registryItem.registryDependencies?.length > 0) {
          console.log(
            `  Registry Dependencies: ${registryItem.registryDependencies.join(", ")}`,
          );
        }
        console.log("");
      }

      if (options.dryRun) {
        console.log(
          chalk.cyan(
            `🔍 DRY RUN - Would install ${chalk.cyan(componentIdWithVersion)}`,
          ),
        );
        console.log(chalk.gray(`📁 Files to be installed:`));
        for (const file of registryItem.files || []) {
          const localPath = file.path.replace(
            "components",
            aliases.components.replace("@/", ""),
          );
          const installPath = path.join(CWD, localPath);
          console.log(chalk.gray(`  - ${path.relative(CWD, installPath)}`));
        }

        if (registryItem.dependencies?.length > 0 && !options.skipDeps) {
          console.log(
            chalk.gray(
              `📦 Dependencies to install: ${registryItem.dependencies.join(", ")}`,
            ),
          );
        }

        if (
          registryItem.registryDependencies?.length > 0 &&
          !options.skipDeps
        ) {
          console.log(
            chalk.gray(
              `🔗 Registry dependencies to install: ${registryItem.registryDependencies.join(", ")}`,
            ),
          );
        }

        if (registryItem.cssVars) {
          console.log(chalk.gray(`🎨 CSS variables would be applied`));
        }

        return;
      }

      const installSpinner = options.verbose
        ? null
        : ora("🔧 Installing component...").start();

      const customPath = options.path;
      const baseComponentsPath =
        customPath || aliases.components.replace("@/", "");

      for (const file of registryItem.files || []) {
        const fileUrl = getComponentFileUrl(
          namespace,
          name,
          resolvedVersion,
          file.path,
        );

        if (options.verbose) {
          console.log(chalk.blue(`📥 Downloading: ${file.path}`));
        }

        const { data: fileContent } = await axios.get(fileUrl);

        const localPath = file.path.replace("components", baseComponentsPath);
        const installPath = path.join(CWD, localPath);

        if (options.verbose) {
          console.log(
            chalk.green(`📝 Writing: ${path.relative(CWD, installPath)}`),
          );
        }

        await fs.ensureDir(path.dirname(installPath));
        await fs.writeFile(installPath, fileContent);
      }

      if (registryItem.dependencies?.length > 0 && !options.skipDeps) {
        if (options.verbose) {
          console.log(
            chalk.blue(
              `📦 Installing npm dependencies: ${registryItem.dependencies.join(", ")}`,
            ),
          );
        } else {
          installSpinner!.text = "📦 Installing npm dependencies...";
        }

        const { execSync } = await import("child_process");
        try {
          const packageManager = await detectPackageManager(CWD);
          const installCommand = getInstallCommand(
            packageManager,
            registryItem.dependencies,
          );

          if (options.verbose) {
            console.log(chalk.gray(`Running: ${installCommand}`));
          }

          execSync(installCommand, { stdio: "inherit", cwd: CWD });

          if (options.verbose) {
            console.log(
              chalk.green(`✅ NPM dependencies installed successfully`),
            );
          }
        } catch (error) {
          console.warn(
            chalk.yellow(
              "⚠️  Failed to install npm dependencies. Install manually.",
            ),
          );
        }
      }

      if (registryItem.registryDependencies?.length > 0 && !options.skipDeps) {
        if (options.verbose) {
          console.log(
            chalk.blue(
              `🔗 Installing registry dependencies: ${registryItem.registryDependencies.join(", ")}`,
            ),
          );
        } else {
          installSpinner!.text = "🔗 Installing registry dependencies...";
        }

        for (const dep of registryItem.registryDependencies) {
          try {
            const { execSync } = await import("child_process");
            const depName = dep.split("/").pop() || dep;
            if (isReservedComponentName(depName)) {
              if (options.verbose) {
                console.log(
                  chalk.yellow(
                    `⚠️  Dependency "${depName}" is a reserved shadcn/ui component`,
                  ),
                );
                console.log(
                  chalk.blue(`🔄 Installing ${depName} using shadcn/ui...`),
                );
              } else {
                console.log(
                  chalk.yellow(
                    `⚠️  Dependency "${depName}" is a reserved shadcn/ui component`,
                  ),
                );
                console.log(
                  chalk.blue(`🔄 Installing ${depName} using shadcn/ui...`),
                );
              }
              execSync(`npx shadcn@latest add ${depName}`, {
                stdio: "inherit",
                cwd: CWD,
              });
            } else {
              if (options.verbose) {
                console.log(
                  chalk.blue(`📦 Installing registry dependency: ${dep}`),
                );
              }
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
        if (options.verbose) {
          console.log(chalk.blue(`🎨 Applying CSS variables...`));
        } else {
          installSpinner!.text = "🎨 Applying CSS variables...";
        }
        await applyCssVariables(registryItem.cssVars, aliases, CWD);
      }

      await trackInstalledComponent(
        componentWithoutVersion,
        resolvedVersion,
        CWD,
      );

      if (options.verbose) {
        console.log(
          chalk.green(
            `✅ ${chalk.cyan(componentIdWithVersion)} installed successfully`,
          ),
        );
      } else {
        installSpinner?.succeed(
          chalk.green(
            `✅ ${chalk.cyan(componentIdWithVersion)} installed successfully`,
          ),
        );
      }
    } catch (error) {
      if (options.verbose) {
        console.error(
          chalk.red(
            `❌ Failed to install ${chalk.cyan(componentIdWithVersion)}`,
          ),
        );
      } else {
        spinner?.fail(
          chalk.red(
            `❌ Failed to install ${chalk.cyan(componentIdWithVersion)}`,
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

/**
 * Detects the package manager used in the current project.
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
 * Generates the install command for the specified package manager.
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
 * Applies CSS variables to the project's CSS file.
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
 * Tracks an installed component for future updates.
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
    // Tracking is not critical, so fail silently
    console.warn(chalk.yellow("⚠️  Failed to track installed component"));
  }
}
