import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { z } from "zod";
import {
  getCachedRegistryIndex,
  setCachedRegistryIndex,
} from "../lib/cache.js";
import { REGISTRY_INDEX_URL } from "../lib/constants.js";

const registryIndexItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  author: z.string(),
  categories: z.array(z.string()).optional(),
});

const registryIndexSchema = z.array(registryIndexItemSchema);

/**
 * Command to search for components in the registry
 */
export const search = new Command()
  .name("search")
  .description("Search for components in the registry")
  .argument("<keyword>", "Search keyword")
  .option("-f, --force", "Force refresh cache")
  .option("-c, --category <category>", "Filter by category")
  .option("-l, --limit <number>", "Limit results", "10")
  .action(async (keyword, options) => {
    const fetchSpinner = ora("🔍 Searching registry...").start();

    try {
      let registryIndex: any[];

      if (!options.force) {
        const cached = await getCachedRegistryIndex();
        if (cached) {
          fetchSpinner.succeed(chalk.green("✅ Using cached registry data"));
          registryIndex = cached;
        } else {
          fetchSpinner.text = "📥 Fetching from registry...";
          const { data } = await axios.get(REGISTRY_INDEX_URL);
          registryIndex = data;
          await setCachedRegistryIndex(data);
          fetchSpinner.succeed(
            chalk.green("✅ Registry data fetched and cached"),
          );
        }
      } else {
        fetchSpinner.text = "🔄 Force refreshing registry data...";
        const { data } = await axios.get(REGISTRY_INDEX_URL);
        registryIndex = data;
        await setCachedRegistryIndex(data);
        fetchSpinner.succeed(
          chalk.green("✅ Registry data refreshed and cached"),
        );
      }

      const validation = registryIndexSchema.safeParse(registryIndex);

      if (!validation.success) {
        fetchSpinner.fail(
          chalk.red(
            "❌ Failed to parse registry index. Registry might be malformed",
          ),
        );
        console.error(validation.error.issues);
        process.exit(1);
      }

      let searchResults = validation.data.filter(
        (item) =>
          item.name.toLowerCase().includes(keyword.toLowerCase()) ||
          item.description.toLowerCase().includes(keyword.toLowerCase()),
      );

      if (options.category) {
        searchResults = searchResults.filter(
          (item) =>
            item.categories &&
            item.categories.some((cat) =>
              cat.toLowerCase().includes(options.category.toLowerCase()),
            ),
        );
      }

      const limit = parseInt(options.limit);
      searchResults = searchResults.slice(0, limit);

      console.log(
        chalk.green(`✅ Found ${searchResults.length} matching components`),
      );

      if (searchResults.length > 0) {
        console.log("");
        searchResults.forEach((item, index) => {
          console.log(
            `  ${index + 1}. ${chalk.cyan(item.name)} by ${chalk.yellow(item.author)}`,
          );
          console.log(`     ${item.description}`);
          if (item.categories && item.categories.length > 0) {
            console.log(
              `     Categories: ${chalk.gray(item.categories.join(", "))}`,
            );
          }
          console.log("");
        });
      }
    } catch (error) {
      fetchSpinner.fail(chalk.red("❌ Failed to fetch registry index"));
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.error(chalk.red("Registry index not found"));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });
