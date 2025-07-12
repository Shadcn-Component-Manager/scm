import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { getSecureToken, readConfig, setSecureToken } from "../lib/config.js";
import {
  authenticateWithGitHub,
  logout,
  validateToken,
} from "../lib/github.js";

/**
 * Command to authenticate with GitHub using OAuth
 */
export const login = new Command()
  .name("login")
  .description("Authenticate with GitHub using OAuth")
  .option("-f, --force", "Force re-authentication")
  .option("-t, --token <token>", "Use existing token instead of OAuth flow")
  .option("-c, --check", "Check current authentication status")
  .option("-v, --verbose", "Show detailed auth info")
  .action(async (options) => {
    try {
      const config = await readConfig();

      if (options.check) {
        const token = getSecureToken();
        if (!token) {
          console.log(chalk.red("❌ Not logged in"));
          console.log(chalk.yellow("Run 'scm login' to authenticate"));
          return;
        }

        const isValid = await validateToken(token);
        if (isValid) {
          console.log(chalk.green("✅ Authentication status: Valid"));
          if (options.verbose) {
            console.log(chalk.gray(`Token: ${token.substring(0, 8)}...`));
          }
        } else {
          console.log(chalk.red("❌ Authentication status: Invalid"));
          console.log(chalk.yellow("Token has expired or is invalid"));
        }
        return;
      }

      if (options.token) {
        if (options.verbose) {
          console.log(chalk.blue("🔐 Validating provided token..."));
        }

        const isValid = await validateToken(options.token);
        if (!isValid) {
          console.error(chalk.red("❌ Invalid token provided"));
          process.exit(1);
        }

        setSecureToken(options.token);

        console.log(
          chalk.green("✅ Successfully authenticated with provided token"),
        );
        if (options.verbose) {
          console.log(chalk.gray(`Token: ${options.token.substring(0, 8)}...`));
        }
        return;
      }

      const existingToken = getSecureToken();
      if (existingToken && !options.force) {
        const isValid = await validateToken(existingToken);
        if (isValid) {
          console.log(chalk.green("✅ Already logged in to GitHub"));
          if (options.verbose) {
            console.log(
              chalk.gray(`Token: ${existingToken.substring(0, 8)}...`),
            );
          }
          console.log(chalk.blue("Use --force to re-authenticate"));
          return;
        }
      }

      if (options.verbose) {
        console.log(chalk.blue("🔐 Starting GitHub OAuth authentication..."));
        console.log(
          chalk.gray(
            "This will open your browser to authorize the application",
          ),
        );
      } else {
        console.log(chalk.blue("🔐 Starting GitHub OAuth authentication..."));
        console.log(
          chalk.gray(
            "This will open your browser to authorize the application",
          ),
        );
      }

      const token = await authenticateWithGitHub();

      setSecureToken(token);

      console.log(chalk.green("✅ Successfully authenticated with GitHub"));
      if (options.verbose) {
        console.log(chalk.gray(`Token: ${token.substring(0, 8)}...`));
      }
      console.log(chalk.gray("Your access token has been saved securely"));
    } catch (error) {
      console.error(chalk.red("❌ Authentication failed:"), error);
      process.exit(1);
    }
  });

/**
 * Command to log out from GitHub and clear credentials
 */
export const logoutCmd = new Command()
  .name("logout")
  .description("Log out from GitHub and clear credentials")
  .option("-a, --all", "Clear all cached data (not just token)")
  .option("-c, --cache", "Clear cache only")
  .option("-f, --force", "Force logout without confirmation")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    try {
      if (options.cache) {
        const { clearCache } = await import("../lib/cache.js");
        await clearCache();
        console.log(chalk.green("✅ Cache cleared successfully"));
        return;
      }

      if (options.all) {
        if (!options.force) {
          const { confirmed } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirmed",
              message: "This will clear all cached data and tokens. Continue?",
              default: false,
            },
          ] as any);

          if (!confirmed) {
            console.log(chalk.yellow("❌ Operation cancelled"));
            return;
          }
        }

        const { clearCache } = await import("../lib/cache.js");
        await clearCache();
        await logout();
        console.log(chalk.green("✅ All data cleared successfully"));
        console.log(chalk.gray("Cache and access token have been cleared"));
        return;
      }

      if (!options.force) {
        const { confirmed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmed",
            message: "Log out from GitHub? This will clear your access token.",
            default: true,
          },
        ] as any);

        if (!confirmed) {
          console.log(chalk.yellow("❌ Logout cancelled"));
          return;
        }
      }

      await logout();
      console.log(chalk.green("✅ Successfully logged out from GitHub"));
      console.log(chalk.gray("Your access token has been cleared"));
    } catch (error) {
      console.error(chalk.red("❌ Logout failed:"), error);
      process.exit(1);
    }
  });
