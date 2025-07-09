import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { REGISTRY_INDEX_URL } from "../lib/constants.js";
import { getComponentRegistryUrl } from "../lib/registry.js";
import { parseComponentName, validateVersion, withRetry } from "../lib/utils.js";
import { isVersionGreater } from "../lib/versioning.js";

/**
 * Command to update an installed component to the latest version
 */
export const update = new Command()
  .name("update")
  .description("Update an installed component to the latest version")
  .argument(
    "[component-name]",
    "Component name. If not provided, all components will be checked",
  )
  .option("-f, --force", "Force update even if no newer version is available")
  .option("-d, --dry-run", "Show what would be updated without making changes")
  .option(
    "-v, --version <version>",
    "Update to specific version (instead of latest)",
  )
  .option("-a, --all", "Update all components (explicit flag)")
  .option("-s, --skip-deps", "Skip updating dependencies")
  .option("-c, --check-only", "Only check for updates, don't install")
  .option("-i, --interactive", "Interactive mode for each component")
  .option("--verbose", "Show detailed information")
  .action(async (componentName, options) => {
    const CWD = process.cwd();

    if (componentName) {
      await updateComponent(componentName, CWD, options);
    } else {
      await updateAllComponents(CWD, options);
    }
  });

/**
 * Updates a specific component
 */
async function updateComponent(
  componentName: string,
  cwd: string,
  options: any,
) {
  const parsedComponent = parseComponentName(componentName);
  if (!parsedComponent.isValid) {
    console.error(chalk.red(`❌ ${parsedComponent.error}`));
    process.exit(1);
  }

  const { namespace, name } = parsedComponent;

  if (options.version) {
    const versionValidation = validateVersion(options.version);
    if (!versionValidation.isValid) {
      console.error(chalk.red(`❌ ${versionValidation.error}`));
      process.exit(1);
    }
  }

  const spinner = ora(
    `🔍 Checking for updates for ${chalk.cyan(componentName)}...`,
  ).start();

  try {
    const currentVersion = await getCurrentVersion(componentName, cwd);

    let targetVersion: string | null;
    if (options.version) {
      targetVersion = options.version;
    } else {
      targetVersion = await getLatestVersion(namespace, name);
    }

    if (!targetVersion) {
      spinner.fail(
        chalk.red(
          `❌ Could not find ${options.version ? "specified" : "latest"} version for ${chalk.cyan(componentName)}`,
        ),
      );
      process.exit(1);
    }

    if (!currentVersion) {
      spinner.fail(
        chalk.red(
          `❌ Component ${chalk.cyan(componentName)} is not installed or version not tracked`,
        ),
      );
      process.exit(1);
    }

    if (options.checkOnly) {
      if (isVersionGreater(targetVersion, currentVersion)) {
        spinner.succeed(
          chalk.green(
            `📈 Update available: ${currentVersion} → ${targetVersion}`,
          ),
        );
      } else if (options.version) {
        spinner.succeed(
          chalk.yellow(
            `🔄 Would update to specified version: ${currentVersion} → ${targetVersion}`,
          ),
        );
      } else {
        spinner.succeed(
          chalk.green(
            `✅ ${chalk.cyan(componentName)} is already up to date (${currentVersion})`,
          ),
        );
      }
      return;
    }

    const shouldUpdate =
      isVersionGreater(targetVersion, currentVersion) ||
      options.force ||
      options.version;

    if (shouldUpdate) {
      if (isVersionGreater(targetVersion, currentVersion)) {
        spinner.succeed(
          chalk.green(
            `📈 Update available: ${currentVersion} → ${targetVersion}`,
          ),
        );
      } else if (options.version) {
        spinner.succeed(
          chalk.yellow(
            `🔄 Updating to specified version: ${currentVersion} → ${targetVersion}`,
          ),
        );
      } else {
        spinner.succeed(
          chalk.yellow(
            `🔄 Forcing update of ${chalk.cyan(componentName)} (no newer version available)`,
          ),
        );
      }

      if (options.dryRun) {
        console.log(
          chalk.yellow(
            `Would update ${chalk.cyan(componentName)} from ${currentVersion} to ${targetVersion}`,
          ),
        );
        return;
      }

      if (options.interactive) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Update ${componentName} from ${currentVersion} to ${targetVersion}?`,
            default: true,
          },
        ] as any);

        if (!confirm) {
          spinner.fail(chalk.yellow("❌ Update cancelled"));
          return;
        }
      }

      const updateSpinner = ora(
        `🔄 Updating ${chalk.cyan(componentName)}...`,
      ).start();
      try {
        await performUpdate(
          componentName,
          currentVersion,
          targetVersion,
          cwd,
          options,
        );
        updateSpinner.succeed(
          chalk.green(
            `✅ Successfully updated ${chalk.cyan(componentName)} to ${targetVersion}`,
          ),
        );
      } catch (error) {
        updateSpinner.fail(
          chalk.red(`❌ Failed to update ${chalk.cyan(componentName)}`),
        );
        console.error(error);
        process.exit(1);
      }
    } else {
      spinner.succeed(
        chalk.green(
          `✅ ${chalk.cyan(componentName)} is already up to date (${currentVersion})`,
        ),
      );
    }
  } catch (error) {
    spinner.fail(
      chalk.red(`❌ Failed to check updates for ${chalk.cyan(componentName)}`),
    );
    console.error(error);
    process.exit(1);
  }
}

/**
 * Updates all installed components
 */
async function updateAllComponents(cwd: string, options: any) {
  const spinner = ora("🔍 Checking for component updates...").start();

  try {
    const installedComponents = await getInstalledComponents(cwd);

    if (installedComponents.length === 0) {
      spinner.succeed(chalk.green("✅ No components installed to update"));
      return;
    }

    spinner.succeed(
      chalk.green(
        `✅ Found ${installedComponents.length} installed components`,
      ),
    );

    const updates: Array<{
      component: string;
      current: string;
      latest: string;
    }> = [];

    for (const component of installedComponents) {
      try {
        const parsedComponent = parseComponentName(component.name);
        if (!parsedComponent.isValid) {
          console.warn(
            chalk.yellow(
              `⚠️  Skipping invalid component name: ${component.name}`,
            ),
          );
          continue;
        }

        const { namespace, name } = parsedComponent;
        const currentVersion = component.version;
        let latestVersion: string | null;

        if (options.version) {
          latestVersion = options.version;
        } else {
          latestVersion = await getLatestVersion(namespace, name);
        }

        if (
          latestVersion &&
          (isVersionGreater(latestVersion, currentVersion) || options.version)
        ) {
          updates.push({
            component: component.name,
            current: currentVersion,
            latest: latestVersion,
          });
        }
      } catch (error) {
        console.warn(
          chalk.yellow(`⚠️  Failed to check updates for ${component.name}`),
        );
      }
    }

    if (updates.length === 0) {
      console.log(chalk.green("✅ All components are up to date"));
      return;
    }

    console.log(
      chalk.yellow(`\n📈 Found ${updates.length} components with updates:`),
    );
    updates.forEach((update) => {
      console.log(
        `  ${chalk.cyan(update.component)}: ${update.current} → ${update.latest}`,
      );
    });

    if (options.checkOnly) {
      console.log(chalk.yellow("\nCheck-only mode - no updates performed"));
      return;
    }

    if (options.dryRun) {
      console.log(chalk.yellow("\nDry run - no changes made"));
      return;
    }

    if (options.interactive) {
      for (const update of updates) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Update ${update.component} from ${update.current} to ${update.latest}?`,
            default: true,
          },
        ] as any);

        if (confirm) {
          try {
            await performUpdate(
              update.component,
              update.current,
              update.latest,
              cwd,
              options,
            );
            console.log(
              chalk.green(`✅ Updated ${update.component} to ${update.latest}`),
            );
          } catch (error) {
            console.error(
              chalk.red(`❌ Failed to update ${update.component}: ${error}`),
            );
          }
        } else {
          console.log(chalk.yellow(`⏭️  Skipped ${update.component}`));
        }
      }
    } else {
      for (const update of updates) {
        try {
          await performUpdate(
            update.component,
            update.current,
            update.latest,
            cwd,
            options,
          );
          console.log(
            chalk.green(`✅ Updated ${update.component} to ${update.latest}`),
          );
        } catch (error) {
          console.error(
            chalk.red(`❌ Failed to update ${update.component}: ${error}`),
          );
        }
      }
    }
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to check for updates"));
    console.error(error);
    process.exit(1);
  }
}

/**
 * Gets the current version of an installed component
 */
async function getCurrentVersion(
  componentName: string,
  cwd: string,
): Promise<string | null> {
  try {
    const trackingPath = path.join(cwd, ".scm-installed.json");
    if (await fs.pathExists(trackingPath)) {
      const tracking = await fs.readJson(trackingPath);
      return tracking[componentName]?.version || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Gets the latest version of a component from the registry
 */
async function getLatestVersion(
  namespace: string,
  name: string,
): Promise<string | null> {
  try {
    const { data: index } = await withRetry(
      () => axios.get(REGISTRY_INDEX_URL),
      {},
      "Fetch registry index"
    );

    const component = index.find(
      (item: any) => item.name === `${namespace}/${name}`,
    );

    if (component?.version) {
      return component.version;
    }

    const componentUrl = getComponentRegistryUrl(namespace, name, "latest");
    const { data: registryItem } = await withRetry(
      () => axios.get(componentUrl),
      {},
      `Fetch component ${namespace}/${name}`
    );

    return registryItem.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Performs the actual update operation
 */
async function performUpdate(
  componentName: string,
  currentVersion: string,
  newVersion: string,
  cwd: string,
  options: any,
) {
  const { execSync } = await import("child_process");
  const skipDepsFlag = options.skipDeps ? " --skip-deps" : "";
  execSync(`scm add ${componentName}@${newVersion}${skipDepsFlag}`, {
    stdio: "inherit",
    cwd,
  });
}

/**
 * Gets all installed components
 */
async function getInstalledComponents(
  cwd: string,
): Promise<Array<{ name: string; version: string }>> {
  try {
    const trackingPath = path.join(cwd, ".scm-installed.json");
    if (await fs.pathExists(trackingPath)) {
      const tracking = await fs.readJson(trackingPath);
      return Object.entries(tracking).map(([name, data]: [string, any]) => ({
        name,
        version: data.version,
      }));
    }
    return [];
  } catch (error) {
    return [];
  }
}
