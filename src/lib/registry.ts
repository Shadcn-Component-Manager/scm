import { z } from "zod";

/**
 * Schema for a single file in the registry
 */
export const registryItemFileSchema = z
  .object({
    path: z
      .string()
      .describe("The path to the file relative to the registry root"),
    content: z.string().optional().describe("The content of the file"),
    type: z
      .enum([
        "registry:lib",
        "registry:block",
        "registry:component",
        "registry:ui",
        "registry:hook",
        "registry:theme",
        "registry:page",
        "registry:file",
        "registry:style",
      ])
      .describe("The type of the file"),
    target: z
      .string()
      .optional()
      .describe("The target path of the file in the project"),
  })
  .refine(
    (data) => {
      if (data.type === "registry:file" || data.type === "registry:page") {
        return data.target !== undefined;
      }
      return true;
    },
    {
      message: "Target is required for registry:file and registry:page types",
    },
  );

/**
 * Schema for CSS variables
 */
export const cssVarsSchema = z.object({
  theme: z
    .record(z.string())
    .optional()
    .describe("CSS variables for the @theme directive (Tailwind v4)"),
  light: z
    .record(z.string())
    .optional()
    .describe("CSS variables for the light theme"),
  dark: z
    .record(z.string())
    .optional()
    .describe("CSS variables for the dark theme"),
});

/**
 * Schema for Tailwind configuration (deprecated, use cssVars.theme for Tailwind v4)
 */
export const tailwindConfigSchema = z.object({
  config: z
    .object({
      content: z.array(z.string()).optional(),
      theme: z.record(z.any()).optional(),
      plugins: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Schema for CSS definitions
 */
export const cssSchema = z
  .record(
    z.union([
      z.string(),
      z.record(z.union([z.string(), z.record(z.string())])),
    ]),
  )
  .describe("CSS definitions to be added to the project's CSS file");

/**
 * Schema for a single item in the registry (a component)
 * Based on https://ui.shadcn.com/schema/registry-item.json
 */
export const registryItemSchema = z.object({
  name: z
    .string()
    .describe(
      "The name of the item. This is used to identify the item in the registry",
    ),
  type: z
    .enum([
      "registry:lib",
      "registry:block",
      "registry:component",
      "registry:ui",
      "registry:hook",
      "registry:theme",
      "registry:page",
      "registry:file",
      "registry:style",
    ])
    .describe("The type of the item"),
  title: z
    .string()
    .optional()
    .describe("A human-readable title for your registry item"),
  description: z
    .string()
    .optional()
    .describe("A description of your registry item"),
  author: z
    .string()
    .optional()
    .describe("The author of the item. Recommended format: username <url>"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("An array of NPM dependencies required by the registry item"),
  devDependencies: z
    .array(z.string())
    .optional()
    .describe("An array of NPM dev dependencies required by the registry item"),
  registryDependencies: z
    .array(z.string())
    .optional()
    .describe("An array of registry items that this item depends on"),
  files: z
    .array(registryItemFileSchema)
    .optional()
    .describe("The main payload of the registry item"),
  cssVars: cssVarsSchema
    .optional()
    .describe("The css variables for the registry item"),
  css: cssSchema
    .optional()
    .describe("CSS definitions to be added to the project's CSS file"),
  tailwind: tailwindConfigSchema
    .optional()
    .describe("The tailwind configuration for the registry item (deprecated)"),
  meta: z
    .record(z.any())
    .optional()
    .describe("Additional metadata for the registry item"),
  docs: z
    .string()
    .optional()
    .describe("The documentation for the registry item"),
  categories: z
    .array(z.string())
    .optional()
    .describe("The categories of the registry item"),
  extends: z
    .string()
    .optional()
    .describe(
      "The name of the registry item to extend (for registry:style items only)",
    ),
});

/**
 * Schema for the main registry file
 * Based on https://ui.shadcn.com/schema/registry.json
 */
export const registrySchema = z.object({
  name: z.string().describe("The name of your registry"),
  homepage: z.string().describe("The homepage of your registry"),
  items: z.array(registryItemSchema).describe("The items in your registry"),
});

export type RegistryItem = z.infer<typeof registryItemSchema>;
export type Registry = z.infer<typeof registrySchema>;
export type RegistryItemFile = z.infer<typeof registryItemFileSchema>;
