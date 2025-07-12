export const REGISTRY_OWNER = "Shadcn-Component-Manager";
export const REGISTRY_REPO = "registry";
export const REGISTRY_BASE_BRANCH = "main";
export const REGISTRY_URL =
  "https://raw.githubusercontent.com/Shadcn-Component-Manager/registry/main/components";
export const REGISTRY_INDEX_URL =
  "https://raw.githubusercontent.com/Shadcn-Component-Manager/registry/main/registry.json";

// Security constants
export const ALLOWED_PROTOCOLS = ["https:"];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_COMPONENT_NAME_LENGTH = 50;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_DEPENDENCIES_COUNT = 100;

export const GITHUB_CLIENT_ID = "Ov23li0QT1pkOUZbSQiY";
export const GITHUB_SCOPES = ["repo", "read:user", "user:email"];

export const CACHE_TTL = 24 * 60 * 60 * 1000;
