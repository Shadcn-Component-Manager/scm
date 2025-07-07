import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { isVersionGreater } from "../lib/versioning.js";

export const update = new Command()
  .name("update")
  .description("Update an installed component to the latest version")
  .argument(
    "[component-name]",
    "Component name. If not provided, all components will be checked",
  )
  .option("-f, --force", "Force update even if no newer version is available")
  .option("-d, --dry-run", "Show what would be updated without making changes")
  .action(async (componentName, options) => {
    const CWD = process.cwd();

    if (componentName) {
      await updateComponent(componentName, CWD, options);
    } else {
      await updateAllComponents(CWD, options);
    }
  });

async function updateComponent(
  componentName: string,
  cwd: string,
  options: any,
) {
  const [namespace, name] = componentName.split("/");
  if (!namespace || !name) {
    console.error(
      chalk.red("❌ Invalid component name. Use: <namespace>/<component>"),
    );
    process.exit(1);
  }

  const spinner = ora(
    `🔍 Checking for updates for ${chalk.cyan(componentName)}...`,
  ).start();

  try {
    // Get current version (would need local manifest tracking)
    const currentVersion = await getCurrentVersion(componentName, cwd);

    // Get latest version from registry
    const latestVersion = await getLatestVersion(namespace, name);

    if (!latestVersion) {
      spinner.fail(
        chalk.red(
          `❌ Could not find latest version for ${chalk.cyan(componentName)}`,
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

    if (isVersionGreater(latestVersion, currentVersion)) {
      spinner.succeed(
        chalk.green(
          `📈 Update available: ${currentVersion} → ${latestVersion}`,
        ),
      );

      if (options.dryRun) {
        console.log(
          chalk.yellow(
            `Would update ${chalk.cyan(componentName)} from ${currentVersion} to ${latestVersion}`,
          ),
        );
        return;
      }

      // Perform the update
      const updateSpinner = ora(
        `🔄 Updating ${chalk.cyan(componentName)}...`,
      ).start();
      try {
        await performUpdate(componentName, currentVersion, latestVersion, cwd);
        updateSpinner.succeed(
          chalk.green(
            `✅ Successfully updated ${chalk.cyan(componentName)} to ${latestVersion}`,
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
      if (options.force) {
        spinner.succeed(
          chalk.yellow(
            `🔄 Forcing update of ${chalk.cyan(componentName)} (no newer version available)`,
          ),
        );
        // Force update logic here
      } else {
        spinner.succeed(
          chalk.green(
            `✅ ${chalk.cyan(componentName)} is already up to date (${currentVersion})`,
          ),
        );
      }
    }
  } catch (error) {
    spinner.fail(
      chalk.red(`❌ Failed to check updates for ${chalk.cyan(componentName)}`),
    );
    console.error(error);
    process.exit(1);
  }
}

async function updateAllComponents(cwd: string, options: any) {
  const spinner = ora("🔍 Checking for component updates...").start();

  try {
    // This would read a local manifest file that tracks installed components
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
        const [namespace, name] = component.name.split("/");
        const currentVersion = component.version;
        const latestVersion = await getLatestVersion(namespace, name);

        if (latestVersion && isVersionGreater(latestVersion, currentVersion)) {
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

    if (options.dryRun) {
      console.log(chalk.yellow("\nDry run - no changes made"));
      return;
    }

    // Perform updates
    for (const update of updates) {
      try {
        await performUpdate(
          update.component,
          update.current,
          update.latest,
          cwd,
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
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to check for updates"));
    console.error(error);
    process.exit(1);
  }
}

async function getCurrentVersion(
  componentName: string,
  cwd: string,
): Promise<string | null> {
  // This would read from a local manifest file
  // For now, return null to indicate not implemented
  return null;
}

async function getLatestVersion(
  namespace: string,
  name: string,
): Promise<string | null> {
  try {
    // This would need to be implemented by checking the registry
    // For now, return a placeholder
    return "1.0.0";
  } catch (error) {
    return null;
  }
}

async function performUpdate(
  componentName: string,
  currentVersion: string,
  newVersion: string,
  cwd: string,
) {
  // This would remove the old version and install the new version
  // For now, just call the add command with the new version
  const { execSync } = await import("child_process");
  execSync(`scm add ${componentName}@${newVersion}`, { stdio: "inherit", cwd });
}

async function getInstalledComponents(
  cwd: string,
): Promise<Array<{ name: string; version: string }>> {
  // This would read from a local manifest file
  // For now, return empty array
  return [];
}
