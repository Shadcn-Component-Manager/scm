import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { getCachedComponent, setCachedComponent } from "../lib/cache.js";
import {
  getComponentFileUrl,
  getComponentRegistryUrl,
  resolveComponentVersion,
} from "../lib/registry.js";
import {
  handleFileConflict,
  mergeCssVariables,
  parseComponentName,
  resolveDependencies,
  validateFileContent,
  validateFileTargets,
  validateVersion,
  withRetry,
} from "../lib/utils.js";

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
  .option("-o, --overwrite", "Overwrite existing files")
  .action(async (componentName, options) => {
    const CWD = process.cwd();

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
      `${namespace}/${name}`,
      version,
    );
    const componentIdWithVersion = `${namespace}/${name}@${resolvedVersion}`;

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

      if (!options.force) {
        const cached = await getCachedComponent(namespace, name);
        if (cached && cached.version === resolvedVersion) {
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
          const { data } = await withRetry(
            () => axios.get(componentUrl),
            {},
            `Fetch component ${componentIdWithVersion}`
          );
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
        const { data } = await withRetry(
          () => axios.get(componentUrl),
          {},
          `Fetch component ${componentIdWithVersion}`
        );
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

      const fileValidation = validateFileTargets(registryItem.files || [], CWD);
      if (!fileValidation.isValid) {
        spinner?.fail(chalk.red("❌ File validation failed"));
        fileValidation.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
        process.exit(1);
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

      const installedFiles: string[] = [];

      try {
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

          const { data: fileContent } = await withRetry(
            () => axios.get(fileUrl),
            {},
            `Download file ${file.path}`
          );

          const validatedContent = validateFileContent(fileContent, file.path);

          const safePath = file.path.replace(/^components\//, "");
          if (
            safePath.includes("..") ||
            safePath.includes("\\") ||
            safePath.startsWith("/")
          ) {
            throw new Error(`Unsafe file path detected: ${file.path}`);
          }
          const localPath = path.join(baseComponentsPath, safePath);
          const installPath = path.join(CWD, localPath);

          if (!installPath.startsWith(CWD)) {
            throw new Error(`Path traversal attack detected: ${file.path}`);
          }

          const shouldWrite = await handleFileConflict(installPath, options);
          if (!shouldWrite) {
            if (options.verbose) {
              console.log(
                chalk.yellow(`⏭️  Skipped: ${path.relative(CWD, installPath)}`),
              );
            }
            continue;
          }

          if (options.verbose) {
            console.log(
              chalk.green(`📝 Writing: ${path.relative(CWD, installPath)}`),
            );
          }

          await fs.ensureDir(path.dirname(installPath));
          await fs.writeFile(installPath, validatedContent);
          installedFiles.push(installPath);
        }

      } catch (error) {
        for (const filePath of installedFiles) {
          try {
            await fs.remove(filePath);
          } catch (rollbackError) {
            console.warn(
              chalk.yellow(`⚠️  Could not remove ${filePath} during rollback`),
            );
          }
        }
        throw error;
      }

      if (!options.skipDeps) {
        const resolvedDeps = await resolveDependencies(
          registryItem.dependencies || [],
          registryItem.registryDependencies || [],
        );

        if (resolvedDeps.conflicts.length > 0) {
          console.warn(chalk.yellow("⚠️  Dependency conflicts detected:"));
          resolvedDeps.conflicts.forEach((conflict) =>
            console.warn(chalk.yellow(`  - ${conflict}`)),
          );
        }

        if (resolvedDeps.npm.length > 0) {
          if (options.verbose) {
            console.log(
              chalk.blue(
                `📦 Installing npm dependencies: ${resolvedDeps.npm.join(", ")}`,
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
              resolvedDeps.npm,
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
            console.error(
              chalk.red(`❌ Failed to install npm dependencies: ${error}`),
            );
            console.log(
              chalk.yellow(
                "💡 Install manually: " + resolvedDeps.npm.join(" "),
              ),
            );
          }
        }

        if (resolvedDeps.registry.length > 0) {
          if (options.verbose) {
            console.log(
              chalk.blue(
                `🔗 Installing registry dependencies: ${resolvedDeps.registry.join(", ")}`,
              ),
            );
          } else {
            installSpinner!.text = "🔗 Installing registry dependencies...";
          }

          const currentDeps = new Set([`${namespace}/${name}`]);
          const checkCircular = (
            dep: string,
            visited: Set<string> = new Set(),
          ): boolean => {
            if (visited.has(dep)) return true;
            if (currentDeps.has(dep)) return true;
            visited.add(dep);
            return false;
          };

          for (const dep of resolvedDeps.registry) {
            if (checkCircular(dep)) {
              console.error(
                chalk.red(`❌ Circular dependency detected: ${dep}`),
              );
              continue;
            }

            try {
              const { execSync } = await import("child_process");
              if (options.verbose) {
                console.log(
                  chalk.blue(`📦 Installing registry dependency: ${dep}`),
                );
              }
              execSync(`scm add ${dep} --skip-deps`, {
                stdio: "inherit",
                cwd: CWD,
              });
            } catch (error) {
              console.error(
                chalk.red(`❌ Failed to install dependency ${dep}: ${error}`),
              );
            }
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
        `${namespace}/${name}`,
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
 * Applies CSS variables to the project's CSS file with smart merging.
 */
async function applyCssVariables(cssVars: any, aliases: any, cwd: string) {
  const cssPath = path.join(cwd, aliases.css || "src/app/globals.css");

  if (await fs.pathExists(cssPath)) {
    const existingCss = await fs.readFile(cssPath, "utf-8");
    const mergedCss = mergeCssVariables(existingCss, cssVars);
    await fs.writeFile(cssPath, mergedCss);
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
    console.warn(chalk.yellow("⚠️  Failed to track installed component"));
  }
}
