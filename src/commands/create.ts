import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import {
  ensureWritableDirectory,
  validateComponentName,
  validateFileTargets,
} from "../lib/utils.js";

/**
 * Command to create a new component
 */
export const create = new Command()
  .name("create")
  .description("Create a new component")
  .argument("<component-name>", "Component name")
  .option(
    "-t, --type <type>",
    "Component type (ui, hook, theme, block, page)",
    "ui",
  )
  .option("-d, --description <description>", "Component description")
  .option("-a, --author <author>", "Component author")
  .option("-c, --categories <categories>", "Comma-separated categories")
  .option("-p, --path <path>", "Custom output path")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-f, --force", "Overwrite existing directory")
  .option("-s, --skip-template", "Don't generate template files")
  .action(async (componentName, options) => {
    const CWD = process.cwd();

    const nameValidation = validateComponentName(componentName);
    if (!nameValidation.isValid) {
      console.error(chalk.red(`❌ ${nameValidation.error}`));
      process.exit(1);
    }

    const validTypes = ["ui", "hook", "theme", "block", "page"];
    if (!validTypes.includes(options.type)) {
      console.error(
        chalk.red(
          `❌ Invalid component type. Must be one of: ${validTypes.join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const customPath = options.path;
    const basePath = customPath || CWD;
    const componentDir = path.join(basePath, "components", componentName);

    if (await fs.pathExists(componentDir)) {
      if (options.force) {
        await fs.remove(componentDir);
      } else {
        console.error(
          chalk.red(`❌ Component directory already exists: ${componentDir}`),
        );
        console.error(
          chalk.yellow("Use --force to overwrite existing directory"),
        );
        process.exit(1);
      }
    }

    const dirCheck = await ensureWritableDirectory(path.dirname(componentDir));
    if (!dirCheck.success) {
      console.error(chalk.red(`❌ ${dirCheck.error}`));
      process.exit(1);
    }

    let description = options.description;
    let author = options.author;
    let categories = options.categories;

    if (!options.yes) {
      if (!description) {
        const { inputDescription } = await inquirer.prompt([
          {
            type: "input",
            name: "inputDescription",
            message: "Component description:",
            default: `A ${options.type} component`,
          },
        ] as any);
        description = inputDescription;
      }

      if (!author) {
        const { inputAuthor } = await inquirer.prompt([
          {
            type: "input",
            name: "inputAuthor",
            message: "Component author:",
            default: "Unknown",
          },
        ] as any);
        author = inputAuthor;
      }

      if (!categories) {
        const { inputCategories } = await inquirer.prompt([
          {
            type: "input",
            name: "inputCategories",
            message: "Categories (comma-separated):",
            default: options.type,
          },
        ] as any);
        categories = inputCategories;
      }
    } else {
      description = description || `A ${options.type} component`;
      author = author || "Unknown";
      categories = categories || options.type;
    }

    const registryItem = {
      name: componentName,
      type: `registry:${options.type}`,
      title: componentName,
      description: description,
      author: author,
      categories: categories
        ? categories.split(",").map((cat: string) => cat.trim())
        : [options.type],
      files: [
        {
          path: `${componentName}.tsx`,
          type: `registry:${options.type}`,
        },
      ],
    };

    const fileValidation = validateFileTargets(registryItem.files, CWD);
    if (!fileValidation.isValid) {
      console.error(chalk.red("❌ File validation failed"));
      fileValidation.errors.forEach((error) =>
        console.error(chalk.red(`  - ${error}`)),
      );
      process.exit(1);
    }

    const spinner = ora(`📝 Creating ${chalk.cyan(componentName)}...`).start();
    try {
      await fs.ensureDir(componentDir);

      const registryPath = path.join(componentDir, "registry.json");
      await fs.writeJson(registryPath, registryItem, { spaces: 2 });

      if (!options.skipTemplate) {
        const componentPath = path.join(componentDir, `${componentName}.tsx`);
        const componentContent = generateDefaultComponent(
          componentName,
          options.type,
        );
        await fs.writeFile(componentPath, componentContent);

        const readmePath = path.join(componentDir, "README.md");
        const readmeContent = generateDefaultReadme(
          componentName,
          description,
          author,
          options.type,
        );
        await fs.writeFile(readmePath, readmeContent);
      }

      spinner.succeed(
        chalk.green(`✅ Component created at ${chalk.yellow(componentDir)}`),
      );

      console.log(chalk.green("\n📁 Files created:"));
      console.log(chalk.gray(`  - ${path.relative(CWD, registryPath)}`));
      if (!options.skipTemplate) {
        console.log(
          chalk.gray(
            `  - ${path.relative(CWD, path.join(componentDir, `${componentName}.tsx`))}`,
          ),
        );
        console.log(
          chalk.gray(
            `  - ${path.relative(CWD, path.join(componentDir, "README.md"))}`,
          ),
        );
      }

      console.log(chalk.yellow("\n💡 Next steps:"));
      console.log(`   1. Review and modify the component files`);
      console.log(`   2. Test your component`);
      console.log(
        `   3. Run ${chalk.cyan(`scm publish`)} to publish your component`,
      );
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to create component"));
      console.error(error);
      process.exit(1);
    }
  });

/**
 * Generates the default component content
 */
function generateDefaultComponent(componentName: string, type: string): string {
  const componentNamePascal = componentName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  switch (type) {
    case "hook":
      return `import { useState, useEffect } from "react"

export function use${componentNamePascal}() {
  const [state, setState] = useState()

  useEffect(() => {
    // Initialize hook
  }, [])

  return {
    state,
    setState,
  }
}`;

    case "theme":
      return `export const ${componentName}Theme = {
  colors: {
    primary: "hsl(var(--primary))",
    secondary: "hsl(var(--secondary))",
  },
  spacing: {
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
  },
}`;

    case "block":
      return `import * as React from "react"
import { cn } from "@/lib/utils"

export interface ${componentNamePascal}Props extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
}

const ${componentNamePascal} = React.forwardRef<HTMLDivElement, ${componentNamePascal}Props>(
  ({ className, title, description, children, ...props }, ref) => {
    return (
      <div
        className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
        ref={ref}
        {...props}
      >
        {(title || description) && (
          <div className="flex flex-col space-y-1.5 p-6">
            {title && <h3 className="text-2xl font-semibold leading-none tracking-tight">{title}</h3>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        <div className="p-6 pt-0">
          {children}
        </div>
      </div>
    )
  }
)
${componentNamePascal}.displayName = "${componentNamePascal}"

export { ${componentNamePascal} }`;

    case "page":
      return `import * as React from "react"
import { cn } from "@/lib/utils"

export interface ${componentNamePascal}Props extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
}

const ${componentNamePascal} = React.forwardRef<HTMLDivElement, ${componentNamePascal}Props>(
  ({ className, title, children, ...props }, ref) => {
    return (
      <div
        className={cn("container mx-auto px-4 py-8", className)}
        ref={ref}
        {...props}
      >
        {title && (
          <div className="mb-8">
            <h1 className="text-4xl font-bold">{title}</h1>
          </div>
        )}
        {children}
      </div>
    )
  }
)
${componentNamePascal}.displayName = "${componentNamePascal}"

export { ${componentNamePascal} }`;

    default: // ui
      return `import * as React from "react"
import { cn } from "@/lib/utils"

export interface ${componentNamePascal}Props extends React.HTMLAttributes<HTMLDivElement> {
  // Add your component props here
}

const ${componentNamePascal} = React.forwardRef<HTMLDivElement, ${componentNamePascal}Props>(
  ({ className, ...props }, ref) => {
    return (
      <div
        className={cn("", className)}
        ref={ref}
        {...props}
      >
        {/* Your component content */}
        ${componentNamePascal}
      </div>
    )
  }
)
${componentNamePascal}.displayName = "${componentNamePascal}"

export { ${componentNamePascal} }`;
  }
}

/**
 * Generates the default README content
 */
function generateDefaultReadme(
  componentName: string,
  description: string,
  author: string,
  type: string,
): string {
  return `# ${componentName}

${description}

## Installation

\`\`\`bash
scm add ${author}/${componentName}
\`\`\`

## Usage

\`\`\`tsx
import { ${componentName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")} } from "@/components/${componentName}"

export default function Example() {
  return (
    <${componentName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")} />
  )
}
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| className | string | - | Additional CSS classes |

## Type

${type}

## Author

${author}
`;
}
