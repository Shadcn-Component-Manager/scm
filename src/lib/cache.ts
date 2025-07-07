import chalk from "chalk";
import crypto from "crypto";
import fs from "fs-extra";
import ora from "ora";
import os from "os";
import path from "path";
import { CACHE_TTL } from "./constants.js";

const CACHE_DIR = path.join(os.homedir(), ".scm", "cache");

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class Cache {
  private static instance: Cache;

  private constructor() {}

  static getInstance(): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache();
    }
    return Cache.instance;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheFile = this.getCacheFilePath(key);

      if (!(await fs.pathExists(cacheFile))) {
        return null;
      }

      const entry: CacheEntry<T> = await fs.readJson(cacheFile);

      // Check if cache is expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      // If cache is corrupted, delete it and return null
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl: number = CACHE_TTL): Promise<void> {
    try {
      await fs.ensureDir(CACHE_DIR);

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };

      const cacheFile = this.getCacheFilePath(key);
      await fs.writeJson(cacheFile, entry, { spaces: 2 });
    } catch (error) {
      console.error(
        chalk.yellow(`⚠️  Failed to cache data for key ${key}:`, error),
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const cacheFile = this.getCacheFilePath(key);
      if (await fs.pathExists(cacheFile)) {
        await fs.remove(cacheFile);
      }
    } catch (error) {
      console.error(
        chalk.yellow(`⚠️  Failed to delete cache for key ${key}:`, error),
      );
    }
  }

  async clear(): Promise<void> {
    const spinner = ora("🧹 Clearing cache...").start();
    try {
      if (await fs.pathExists(CACHE_DIR)) {
        await fs.remove(CACHE_DIR);
      }
      spinner.succeed(chalk.green("✅ Cache cleared successfully"));
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to clear cache"));
      console.error(error);
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      if (!(await fs.pathExists(CACHE_DIR))) {
        return 0;
      }

      const files = await fs.readdir(CACHE_DIR);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  private getCacheFilePath(key: string): string {
    const hash = crypto.createHash("md5").update(key).digest("hex");
    return path.join(CACHE_DIR, `${hash}.json`);
  }
}

// Convenience functions
export async function getCachedRegistryIndex(): Promise<any[] | null> {
  const cache = Cache.getInstance();
  return await cache.get<any[]>("registry-index");
}

export async function setCachedRegistryIndex(data: any[]): Promise<void> {
  const cache = Cache.getInstance();
  await cache.set("registry-index", data);
}

export async function getCachedComponent(
  namespace: string,
  name: string,
): Promise<any | null> {
  const cache = Cache.getInstance();
  return await cache.get<any>(`component-${namespace}-${name}`);
}

export async function setCachedComponent(
  namespace: string,
  name: string,
  data: any,
): Promise<void> {
  const cache = Cache.getInstance();
  await cache.set(`component-${namespace}-${name}`, data);
}

export async function clearCache(): Promise<void> {
  const cache = Cache.getInstance();
  await cache.clear();
}

export async function getCacheInfo(): Promise<{
  size: number;
  entries: number;
}> {
  const cache = Cache.getInstance();
  const size = await cache.getCacheSize();

  let entries = 0;
  if (await fs.pathExists(CACHE_DIR)) {
    const files = await fs.readdir(CACHE_DIR);
    entries = files.length;
  }

  return { size, entries };
}
