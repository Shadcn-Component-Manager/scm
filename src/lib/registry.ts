import axios from "axios";
import { z } from "zod";
import {
  ALLOWED_PROTOCOLS,
  REGISTRY_INDEX_URL,
  REGISTRY_URL,
} from "./constants.js";
import { withRetry } from "./utils.js";

/**
 * Validates that a URL uses HTTPS protocol
 */
function validateHttpsUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ALLOWED_PROTOCOLS.includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * Schema for a single file in the registry
 */
export const registryItemFileSchema = z
  .object({
    path: z
      .string()
      .min(1, "File path cannot be empty")
      .max(500, "File path too long")
      .refine((path) => {
        const dangerousPatterns = [
          /\.\./,
          /\\/,
          /^\/+/,
          /~+/,
          /\$\{/,
          /<script/i,
          /javascript:/i,
          /data:text\/html/i,
        ];
        return !dangerousPatterns.some((pattern) => pattern.test(path));
      }, "File path contains potentially dangerous content")
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
      .refine((target) => {
        if (!target) return true;
        const dangerousPatterns = [
          /\.\./,
          /\\/,
          /^\/+/,
          /~+/,
          /\$\{/,
          /node_modules/,
          /\.git/,
          /\.env/,
          /package\.json/,
          /package-lock\.json/,
          /yarn\.lock/,
          /pnpm-lock\.yaml/,
        ];
        return !dangerousPatterns.some((pattern) => pattern.test(target));
      }, "Target path contains potentially dangerous content")
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
    .min(1, "Name cannot be empty")
    .max(50, "Name too long")
    .regex(
      /^[a-z][a-z0-9-]*[a-z0-9]$/,
      "Name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number",
    )
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
    .max(200, "Title too long")
    .optional()
    .describe("A human-readable title for your registry item"),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .describe("A description of your registry item"),
  author: z
    .string()
    .max(200, "Author too long")
    .optional()
    .describe("The author of the item. Recommended format: username <url>"),
  dependencies: z
    .array(z.string().max(100, "Dependency name too long"))
    .max(100, "Too many dependencies")
    .optional()
    .describe("An array of NPM dependencies required by the registry item"),
  devDependencies: z
    .array(z.string().max(100, "Dev dependency name too long"))
    .max(100, "Too many dev dependencies")
    .optional()
    .describe("An array of NPM dev dependencies required by the registry item"),
  registryDependencies: z
    .array(z.string().max(100, "Registry dependency name too long"))
    .max(100, "Too many registry dependencies")
    .optional()
    .describe("An array of registry items that this item depends on"),
  files: z
    .array(registryItemFileSchema)
    .max(50, "Too many files")
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
    .array(z.string().max(50, "Category name too long"))
    .max(20, "Too many categories")
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

/**
 * Resolves the version of a component.
 * If the version is "latest", it will try to resolve it from the registry index.
 */
export async function resolveComponentVersion(
  componentName: string,
  version: string,
): Promise<string> {
  if (version !== "latest") {
    return version;
  }

  try {
    const { data: index } = await withRetry(
      () => axios.get(REGISTRY_INDEX_URL),
      {},
      "Fetch registry index for version resolution",
    );
    const component = (index as any[]).find(
      (item) => item.name === componentName,
    );
    if (component?.version) {
      return component.version;
    }
  } catch (error) {}

  return "latest";
}

/**
 * Constructs the URL for a component's registry.json file
 */
export function getComponentRegistryUrl(
  namespace: string,
  name: string,
  version: string,
): string {
  const url = `${REGISTRY_URL}/${namespace}/${name}/${version}/registry.json`;
  if (!validateHttpsUrl(url)) {
    throw new Error("Invalid registry URL - only HTTPS is allowed");
  }
  return url;
}

/**
 * Constructs the URL for a component's README.md file
 */
export function getComponentReadmeUrl(
  namespace: string,
  name: string,
  version: string,
): string {
  const url = `${REGISTRY_URL}/${namespace}/${name}/${version}/README.md`;
  if (!validateHttpsUrl(url)) {
    throw new Error("Invalid registry URL - only HTTPS is allowed");
  }
  return url;
}

/**
 * Constructs the URL for a component file
 */
export function getComponentFileUrl(
  namespace: string,
  name: string,
  version: string,
  filePath: string,
): string {
  const url = `${REGISTRY_URL}/${namespace}/${name}/${version}/${filePath}`;
  if (!validateHttpsUrl(url)) {
    throw new Error("Invalid registry URL - only HTTPS is allowed");
  }
  return url;
}
