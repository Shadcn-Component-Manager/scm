import chalk from "chalk";
import crypto from "crypto";
import inquirer from "inquirer";
import { Octokit } from "octokit";
import ora from "ora";
import { readConfig, writeConfig } from "./config.js";
import {
  GITHUB_CLIENT_ID,
  GITHUB_SCOPES,
  REGISTRY_BASE_BRANCH,
  REGISTRY_OWNER,
  REGISTRY_REPO,
} from "./constants.js";

let octokit: Octokit | null = null;

export async function getOctokit(): Promise<Octokit> {
  if (octokit) {
    return octokit;
  }

  const config = await readConfig();
  if (!config.token) {
    throw new Error("You are not logged in. Please run `scm login` first");
  }

  octokit = new Octokit({ auth: config.token });
  return octokit;
}

export async function getGitHubUser() {
  const kit = await getOctokit();
  const { data: user } = await kit.rest.users.getAuthenticated();
  return user;
}

export async function authenticateWithGitHub(): Promise<string> {
  const spinner = ora("🔐 Starting GitHub authentication...").start();

  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(32).toString("hex");

    // Create authorization URL with PKCE
    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
    authUrl.searchParams.set("scope", GITHUB_SCOPES.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    spinner.succeed("✅ GitHub OAuth URL generated");

    console.log(chalk.blue("\n🔗 Please visit this URL to authorize SCM:"));
    console.log(chalk.cyan(authUrl.toString()));
    console.log(
      chalk.gray(
        "\nAfter authorization, you will receive a code. Please paste it below",
      ),
    );

    // Get authorization code from user
    const { code } = await inquirer.prompt([
      {
        type: "input",
        name: "code",
        message: "Enter the authorization code from GitHub:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Authorization code is required";
          }
          return true;
        },
      },
    ] as any);

    // Exchange code for access token using PKCE
    const token = await exchangeCodeForToken(code.trim(), codeVerifier, state);

    spinner.succeed(chalk.green("✅ Authentication successful"));
    return token;
  } catch (error) {
    spinner.fail(chalk.red("❌ Authentication failed"));
    console.error(chalk.red("Error during authentication:"), error);
    throw error;
  }
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  return hash.toString("base64url");
}

async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  expectedState: string,
): Promise<string> {
  const spinner = ora(
    "🔄 Exchanging authorization code for access token...",
  ).start();

  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          code,
          code_verifier: codeVerifier,
        }),
      },
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `GitHub API error: ${data.error_description || data.error}`,
      );
    }

    if (!data.access_token) {
      throw new Error("No access token received from GitHub");
    }

    spinner.succeed("✅ Access token received successfully");
    return data.access_token;
  } catch (error) {
    spinner.fail("❌ Failed to exchange code for token");
    throw error;
  }
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const testOctokit = new Octokit({ auth: token });
    await testOctokit.rest.users.getAuthenticated();
    return true;
  } catch (error) {
    return false;
  }
}

export async function logout(): Promise<void> {
  const config = await readConfig();
  config.token = undefined;
  await writeConfig(config);
  octokit = null;
}

// GitHub API helper functions for registry operations
export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = "main",
) {
  const kit = await getOctokit();
  const { data: pr } = await kit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });
  return pr;
}

export async function createBranch(
  owner: string,
  repo: string,
  branch: string,
  sha: string,
) {
  const kit = await getOctokit();
  const { data: ref } = await kit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha,
  });
  return ref;
}

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  message: string,
  content: string,
  branch: string = "main",
  sha?: string,
) {
  const kit = await getOctokit();
  const { data: file } = await kit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    sha,
  });
  return file;
}

export async function getRepository(owner: string, repo: string) {
  const kit = await getOctokit();
  const { data: repository } = await kit.rest.repos.get({
    owner,
    repo,
  });
  return repository;
}

export async function getMainBranchSha() {
  const kit = await getOctokit();
  const { data: mainBranch } = await kit.rest.git.getRef({
    owner: REGISTRY_OWNER,
    repo: REGISTRY_REPO,
    ref: `heads/${REGISTRY_BASE_BRANCH}`,
  });
  return mainBranch.object.sha;
}
