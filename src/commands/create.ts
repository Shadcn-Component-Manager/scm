import chalk from "chalk";
import { Command } from "commander";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { isReservedComponentName } from "../lib/constants.js";

export const create = new Command()
  .name("create")
  .description("Create a new component")
  .argument("<component-name>", "Component name")
  .action(async (componentName) => {
    const CWD = process.cwd();
    const componentDir = path.join(CWD, "components", componentName);

    // Validate component name against reserved names
    if (isReservedComponentName(componentName)) {
      console.error(
        chalk.red(`❌ Component name "${componentName}" is reserved`),
      );
      console.error(
        chalk.yellow(
          "This name conflicts with an existing shadcn/ui component",
        ),
      );
      console.error(
        chalk.gray("Please choose a different name for your component"),
      );
      process.exit(1);
    }

    if (await fs.pathExists(componentDir)) {
      console.error(
        chalk.red(`❌ Component directory already exists: ${componentDir}`),
      );
      process.exit(1);
    }

    // Create registry item in shadcn/ui format
    const registryItem = {
      name: componentName,
      type: "registry:ui",
      files: [
        {
          path: `${componentName}.tsx`,
          type: "registry:ui",
        },
      ],
    };

    // Create component files
    const spinner = ora(`📝 Creating ${chalk.cyan(componentName)}...`).start();
    try {
      await fs.ensureDir(componentDir);

      // Write registry.json
      const registryPath = path.join(componentDir, "registry.json");
      await fs.writeJson(registryPath, registryItem, { spaces: 2 });

      // Create default component file
      const componentPath = path.join(componentDir, `${componentName}.tsx`);
      const componentContent = generateDefaultComponent(componentName);
      await fs.writeFile(componentPath, componentContent);

      spinner.succeed(
        chalk.green(`✅ Component created at ${chalk.yellow(componentDir)}`),
      );

      console.log(chalk.green("\n📁 Files created:"));
      console.log(chalk.gray(`  - ${path.relative(CWD, registryPath)}`));
      console.log(chalk.gray(`  - ${path.relative(CWD, componentPath)}`));

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

function generateDefaultComponent(componentName: string): string {
  const componentNamePascal = componentName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

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
