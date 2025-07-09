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
import { withRetry } from "../lib/utils.js";

const registryIndexItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  author: z.string(),
  categories: z.array(z.string()).optional(),
  type: z.string().optional(),
  publishedAt: z.string().optional(),
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
  .option("-a, --author <author>", "Filter by author")
  .option(
    "-s, --sort <field>",
    "Sort by (name, author, date)",
    "name",
  )
  .option("-o, --output <format>", "Output format (table, json, csv)", "table")
  .option(
    "-t, --type <type>",
    "Filter by component type (ui, hook, theme, etc.)",
  )
  .option("-v, --verbose", "Show detailed information")
  .option("-q, --quiet", "Minimal output")
  .action(async (keyword, options) => {
    if (
      !keyword ||
      typeof keyword !== "string" ||
      keyword.trim().length === 0
    ) {
      console.error(chalk.red("❌ Search keyword is required"));
      process.exit(1);
    }

    const limit = parseInt(options.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      console.error(chalk.red("❌ Limit must be a number between 1 and 100"));
      process.exit(1);
    }

    const validOutputFormats = ["table", "json", "csv"];
    if (!validOutputFormats.includes(options.output)) {
      console.error(
        chalk.red(
          `❌ Invalid output format. Must be one of: ${validOutputFormats.join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const validSortFields = ["name", "author", "date"];
    if (!validSortFields.includes(options.sort)) {
      console.error(
        chalk.red(
          `❌ Invalid sort field. Must be one of: ${validSortFields.join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const fetchSpinner = options.quiet
      ? null
      : ora("🔍 Searching registry...").start();

    try {
      let registryIndex: any[];

      if (!options.force) {
        const cached = await getCachedRegistryIndex();
        if (cached) {
          if (!options.quiet) {
            fetchSpinner?.succeed(chalk.green("✅ Using cached registry data"));
          }
          registryIndex = cached;
        } else {
          if (!options.quiet) {
            fetchSpinner!.text = "📥 Fetching from registry...";
          }
          const { data } = await withRetry(
            () => axios.get(REGISTRY_INDEX_URL),
            {},
            "Fetch registry index"
          );
          registryIndex = data;
          await setCachedRegistryIndex(data);
          if (!options.quiet) {
            fetchSpinner?.succeed(
              chalk.green("✅ Registry data fetched and cached"),
            );
          }
        }
      } else {
        if (!options.quiet) {
          fetchSpinner!.text = "🔄 Force refreshing registry data...";
        }
        const { data } = await withRetry(
          () => axios.get(REGISTRY_INDEX_URL),
          {},
          "Fetch registry index"
        );
        registryIndex = data;
        await setCachedRegistryIndex(data);
        if (!options.quiet) {
          fetchSpinner?.succeed(
            chalk.green("✅ Registry data refreshed and cached"),
          );
        }
      }

      const validation = registryIndexSchema.safeParse(registryIndex);

      if (!validation.success) {
        if (!options.quiet) {
          fetchSpinner?.fail(
            chalk.red(
              "❌ Failed to parse registry index. Registry might be malformed",
            ),
          );
          console.error(validation.error.issues);
        }
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

      if (options.author) {
        searchResults = searchResults.filter((item) =>
          item.author.toLowerCase().includes(options.author.toLowerCase()),
        );
      }

      if (options.type) {
        searchResults = searchResults.filter(
          (item) =>
            item.type &&
            item.type.toLowerCase().includes(options.type.toLowerCase()),
        );
      }

      searchResults = searchResults.sort((a, b) => {
        switch (options.sort) {
          case "author":
            return a.author.localeCompare(b.author);
          case "date":
            return (b.publishedAt || "").localeCompare(a.publishedAt || "");
          case "name":
          default:
            return a.name.localeCompare(b.name);
        }
      });

      searchResults = searchResults.slice(0, limit);

      if (!options.quiet) {
        console.log(
          chalk.green(`✅ Found ${searchResults.length} matching components`),
        );
      }

      if (searchResults.length > 0) {
        if (options.output === "json") {
          console.log(JSON.stringify(searchResults, null, 2));
        } else if (options.output === "csv") {
          console.log("name,author,description,categories,type,publishedAt");
          searchResults.forEach((item) => {
            const categories = item.categories?.join(";") || "";
            const type = item.type || "";
            const publishedAt = item.publishedAt || "";
            console.log(
              `"${item.name}","${item.author}","${item.description}","${categories}","${type}","${publishedAt}"`,
            );
          });
        } else {
          if (!options.quiet) {
            console.log("");
          }
          searchResults.forEach((item, index) => {
            if (options.verbose) {
              console.log(
                `  ${index + 1}. ${chalk.cyan(item.name)} by ${chalk.yellow(item.author)}`,
              );
              console.log(`     ${item.description}`);
              if (item.categories && item.categories.length > 0) {
                console.log(
                  `     Categories: ${chalk.gray(item.categories.join(", "))}`,
                );
              }
              if (item.type) {
                console.log(`     Type: ${chalk.gray(item.type)}`);
              }
              if (item.publishedAt) {
                console.log(`     Published: ${chalk.gray(item.publishedAt)}`);
              }
              console.log("");
            } else {
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
            }
          });
        }
      } else {
        if (!options.quiet) {
          console.log(
            chalk.yellow("No components found matching your search criteria"),
          );
        }
      }
    } catch (error) {
      if (!options.quiet) {
        fetchSpinner?.fail(chalk.red("❌ Failed to fetch registry index"));
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.error(chalk.red("Registry index not found"));
        } else {
          console.error(error);
        }
      }
      process.exit(1);
    }
  });
