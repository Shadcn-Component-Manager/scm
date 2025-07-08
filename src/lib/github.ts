import chalk from "chalk";
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

/**
 * Gets or creates an Octokit instance for GitHub API access
 * @returns Promise resolving to Octokit instance
 * @throws Error if user is not authenticated
 */
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

/**
 * Gets the authenticated GitHub user information
 * @returns Promise resolving to user data
 */
export async function getGitHubUser() {
  try {
    const kit = await getOctokit();
    const { data: user } = await kit.rest.users.getAuthenticated();
    return user;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("You are not logged in") ||
        error.message.includes("401") ||
        error.message.includes("Unauthorized"))
    ) {
      console.log(chalk.blue("🔐 Authentication required for this operation"));
      console.log(chalk.gray("Starting GitHub OAuth flow..."));

      const token = await authenticateWithGitHub();

      const config = await readConfig();
      config.token = token;
      await writeConfig(config);

      octokit = null;

      const kit = await getOctokit();
      const { data: user } = await kit.rest.users.getAuthenticated();
      return user;
    }

    throw error;
  }
}

/**
 * Authenticates with GitHub using OAuth device flow
 * @returns Promise resolving to access token
 */
export async function authenticateWithGitHub(): Promise<string> {
  const spinner = ora("🔐 Starting GitHub OAuth device flow...").start();

  try {
    const config = await readConfig();
    config.token = undefined;
    await writeConfig(config);
    octokit = null;

    spinner.text = "🔄 Requesting device authorization...";

    const deviceResponse = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPES.join(" "),
      }),
    });

    if (!deviceResponse.ok) {
      const errorText = await deviceResponse.text();
      throw new Error(
        `GitHub device flow error: ${deviceResponse.status} ${deviceResponse.statusText} - ${errorText}`,
      );
    }

    const deviceData = await deviceResponse.json();

    if (deviceData.error) {
      throw new Error(
        `GitHub device flow error: ${deviceData.error_description || deviceData.error}`,
      );
    }

    spinner.succeed("✅ Device authorization requested");

    console.log(chalk.blue("\n🔗 Please visit this URL to authorize SCM:"));
    console.log(chalk.cyan(deviceData.verification_uri));
    console.log(
      chalk.yellow(`\n📝 Enter this code: ${chalk.bold(deviceData.user_code)}`),
    );
    console.log(
      chalk.gray(
        `\n⏱️  You have ${Math.floor(deviceData.expires_in / 60)} minutes to complete the authorization.`,
      ),
    );

    try {
      const { default: open } = await import("open");
      await open(deviceData.verification_uri);
      console.log(chalk.green("✅ Opened browser automatically"));
    } catch (error) {
      console.log(
        chalk.yellow(
          "⚠️  Could not open browser automatically. Please copy and paste the URL above.",
        ),
      );
    }

    spinner.start("⏳ Waiting for authorization...");

    const token = await pollForAuthorization(
      deviceData.device_code,
      deviceData.interval,
      deviceData.expires_in,
    );

    spinner.succeed(chalk.green("✅ Authentication successful"));
    return token;
  } catch (error) {
    spinner.fail(chalk.red("❌ Authentication failed"));
    console.error(chalk.red("Error during authentication:"), error);
    throw error;
  }
}

/**
 * Polls GitHub for authorization completion
 * @param deviceCode - Device verification code
 * @param interval - Minimum polling interval in seconds
 * @param expiresIn - Expiration time in seconds
 * @returns Promise resolving to access token
 */
async function pollForAuthorization(
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<string> {
  const startTime = Date.now();
  const expirationTime = startTime + expiresIn * 1000;
  let currentInterval = interval * 1000;

  while (Date.now() < expirationTime) {
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
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      if (data.error) {
        switch (data.error) {
          case "authorization_pending":
            break;
          case "slow_down":
            currentInterval = (data.interval || interval + 5) * 1000;
            break;
          case "expired_token":
            throw new Error(
              "Authorization code has expired. Please try again.",
            );
          case "access_denied":
            throw new Error("Authorization was denied by the user.");
          case "unsupported_grant_type":
            throw new Error("Device flow is not supported by this GitHub app.");
          case "incorrect_client_credentials":
            throw new Error("Invalid client credentials.");
          case "incorrect_device_code":
            throw new Error("Invalid device code.");
          case "device_flow_disabled":
            throw new Error("Device flow is not enabled for this GitHub app.");
          default:
            throw new Error(
              `GitHub API error: ${data.error_description || data.error}`,
            );
        }
      } else if (data.access_token) {
        return data.access_token;
      }

      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes("authorization_pending")
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    }
  }

  throw new Error("Authorization timed out. Please try again.");
}

/**
 * Validates a GitHub access token
 * @param token - Access token to validate
 * @returns Promise resolving to validation result
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const testOctokit = new Octokit({ auth: token });
    await testOctokit.rest.users.getAuthenticated();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Logs out the current user by clearing stored token
 */
export async function logout(): Promise<void> {
  const config = await readConfig();
  config.token = undefined;
  await writeConfig(config);
  octokit = null;
}

/**
 * Creates a pull request on GitHub
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param title - PR title
 * @param body - PR body
 * @param head - Source branch
 * @param base - Target branch
 * @returns Promise resolving to PR data
 */
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

/**
 * Creates a new branch on GitHub
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name
 * @param sha - Commit SHA to base branch on
 * @returns Promise resolving to ref data
 */
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

/**
 * Creates or updates a file in a GitHub repository
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - File path in repository
 * @param message - Commit message
 * @param content - File content
 * @param branch - Target branch
 * @param sha - Current file SHA (for updates)
 * @returns Promise resolving to file data
 */
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

  const fileContent = Buffer.from(content).toString("base64");

  const { data: file } = await kit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: fileContent,
    branch,
    sha,
  });

  return file;
}

/**
 * Gets repository information
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Promise resolving to repository data
 */
export async function getRepository(owner: string, repo: string) {
  const kit = await getOctokit();
  const { data: repository } = await kit.rest.repos.get({
    owner,
    repo,
  });
  return repository;
}

/**
 * Gets the SHA of the main branch
 * @returns Promise resolving to commit SHA
 */
export async function getMainBranchSha() {
  try {
    const kit = await getOctokit();
    const { data: branch } = await kit.rest.repos.getBranch({
      owner: REGISTRY_OWNER,
      repo: REGISTRY_REPO,
      branch: REGISTRY_BASE_BRANCH,
    });
    return branch.commit.sha;
  } catch (error) {
    // Authentication errors will be handled by getGitHubUser() which is called first
    // Other errors should be re-thrown
    throw error;
  }
}

/**
 * Gets the latest version of a component from the remote registry
 * @param username - GitHub username of the component author
 * @param componentName - Name of the component
 * @returns Promise resolving to latest version string or null if not found
 */
export async function getLatestComponentVersion(
  username: string,
  componentName: string,
): Promise<string | null> {
  try {
    const kit = await getOctokit();
    const componentPath = `components/${username}/${componentName}`;

    const { data: contents } = await kit.rest.repos.getContent({
      owner: REGISTRY_OWNER,
      repo: REGISTRY_REPO,
      path: componentPath,
      ref: REGISTRY_BASE_BRANCH,
    });

    if (!Array.isArray(contents)) {
      return null;
    }

    const versionDirs = contents
      .filter((item) => item.type === "dir")
      .map((item) => item.name)
      .filter((name) => /^\d+\.\d+\.\d+$/.test(name));

    if (versionDirs.length === 0) {
      return null;
    }

    const sortedVersions = versionDirs.sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
      const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

      if (aMajor !== bMajor) return bMajor - aMajor;
      if (aMinor !== bMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    });

    return sortedVersions[0];
  } catch (error) {
    // If the component doesn't exist or there's an error, return null
    // This includes authentication errors - we'll handle those in the calling function
    return null;
  }
}
