import chalk from "chalk";
import { Command } from "commander";
import { readConfig, writeConfig } from "../lib/config.js";
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
  .action(async (options) => {
    try {
      const config = await readConfig();

      if (config.token && !options.force) {
        const isValid = await validateToken(config.token);
        if (isValid) {
          console.log(chalk.green("✅ Already logged in to GitHub"));
          console.log(chalk.blue("Use --force to re-authenticate"));
          return;
        }
      }

      console.log(chalk.blue("🔐 Starting GitHub OAuth authentication..."));
      console.log(
        chalk.gray("This will open your browser to authorize the application"),
      );

      const token = await authenticateWithGitHub();

      config.token = token;
      await writeConfig(config);

      console.log(chalk.green("✅ Successfully authenticated with GitHub"));
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
  .action(async () => {
    try {
      await logout();
      console.log(chalk.green("✅ Successfully logged out from GitHub"));
      console.log(chalk.gray("Your access token has been cleared"));
    } catch (error) {
      console.error(chalk.red("❌ Logout failed:"), error);
      process.exit(1);
    }
  });
