# Shadcn Component Manager CLI

[![npm version](https://img.shields.io/npm/v/@shadcn-component-manager/scm.svg)](https://www.npmjs.com/package/@shadcn-component-manager/scm)
[![npm downloads](https://img.shields.io/npm/dm/@shadcn-component-manager/scm.svg)](https://www.npmjs.com/package/@shadcn-component-manager/scm)
[![GitHub stars](https://img.shields.io/github/stars/Shadcn-Component-Manager/scm.svg?style=social&label=Star)](https://github.com/Shadcn-Component-Manager/scm)
[![GitHub issues](https://img.shields.io/github/issues/Shadcn-Component-Manager/scm.svg)](https://github.com/Shadcn-Component-Manager/scm/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official CLI package for the Shadcn Component Manager (SCM). Build your component & share it with the community.

## Quick Start

```bash
# Install globally
npm install -g @shadcn-component-manager/scm

# Login with GitHub
scm login

# Create your first component
scm create my-awesome-button

# Publish to the registry
scm publish

# Install components from others
scm add shadcn/button
```

## Commands

### Authentication

#### `scm login`

Authenticate with GitHub using OAuth device flow.

**Options:**

- `-f, --force` - Force re-authentication
- `-t, --token <token>` - Use existing token instead of OAuth flow
- `-c, --check` - Check current authentication status
- `-v, --verbose` - Show detailed auth info

**Examples:**

```bash
scm login
scm login --force
scm login --check
scm login --token your-github-token
```

#### `scm logout`

Clear stored authentication credentials.

**Options:**

- `-a, --all` - Clear all cached data (not just token)
- `-c, --cache` - Clear cache only
- `-f, --force` - Force logout without confirmation

**Examples:**

```bash
scm logout
scm logout --all
scm logout --cache
```

### Component Management

#### `scm create <name>`

Create a new component with basic structure.

**Options:**

- `-t, --type <type>` - Component type (ui, hook, theme, block, page) [default: ui]
- `-d, --description <description>` - Component description
- `-a, --author <author>` - Component author
- `-c, --categories <categories>` - Comma-separated categories
- `-p, --path <path>` - Custom output path
- `-y, --yes` - Skip confirmation prompts
- `-f, --force` - Overwrite existing directory
- `-s, --skip-template` - Don't generate template files

**Examples:**

```bash
scm create my-button
scm create my-hook --type hook
scm create my-theme --type theme --description "Custom theme"
scm create my-block --type block --categories "ui,layout"
```

#### `scm add <component-name>`

Add a component to your project.

**Options:**

- `-f, --force` - Force refresh cache
- `-d, --dry-run` - Show what would be installed without installing
- `-p, --path <path>` - Custom installation path
- `-s, --skip-deps` - Skip installing dependencies
- `-v, --verbose` - Show detailed installation info
- `-y, --yes` - Skip confirmation prompts

**Examples:**

```bash
scm add shadcn/button
scm add shadcn/button@1.0.0
scm add shadcn/button --force
scm add shadcn/button --dry-run
scm add shadcn/button --skip-deps
```

#### `scm publish`

Publish a component to the registry.

**Options:**

- `-y, --yes` - Skip confirmation prompts
- `-m, --message <message>` - Custom commit message
- `-i, --item <item>` - Specific item to publish from registry collection
- `-v, --version <version>` - Specify version manually (override auto-detection)

**Examples:**

```bash
scm publish
scm publish --yes
scm publish --message "feat: add awesome button component"
scm publish --version 2.0.0
```

#### `scm update [component-name]`

Update an installed component to the latest version.

**Options:**

- `-f, --force` - Force update even if no newer version is available
- `-d, --dry-run` - Show what would be updated without making changes
- `-v, --version <version>` - Update to specific version (instead of latest)
- `-a, --all` - Update all components (explicit flag)
- `-s, --skip-deps` - Skip updating dependencies
- `-c, --check-only` - Only check for updates, don't install
- `-i, --interactive` - Interactive mode for each component

**Examples:**

```bash
scm update
scm update shadcn/button
scm update --all
scm update --check-only
scm update --interactive
scm update shadcn/button --version 2.0.0
```

### Discovery

#### `scm search <keyword>`

Search for components in the registry.

**Options:**

- `-f, --force` - Force refresh cache
- `-c, --category <category>` - Filter by category
- `-l, --limit <number>` - Limit results [default: 10]
- `-a, --author <author>` - Filter by author
- `-s, --sort <field>` - Sort by (name, author, date, popularity) [default: name]
- `-o, --output <format>` - Output format (table, json, csv) [default: table]
- `-t, --type <type>` - Filter by component type (ui, hook, theme, etc.)
- `-v, --verbose` - Show detailed information
- `-q, --quiet` - Minimal output

**Examples:**

```bash
scm search button
scm search button --category ui
scm search button --limit 5
scm search button --author username
scm search button --output json
scm search button --type ui
```

#### `scm preview <component-name>`

Preview a component from the registry.

**Options:**

- `-f, --force` - Force refresh cache
- `-o, --output <format>` - Output format (text, json, markdown) [default: text]
- `-r, --raw` - Show raw file content
- `-d, --dependencies` - Show dependency tree
- `-c, --code` - Show only code without metadata

**Examples:**

```bash
scm preview shadcn/button
scm preview shadcn/button@1.0.0
scm preview shadcn/button --output json
scm preview shadcn/button --code
scm preview shadcn/button --dependencies
```

#### `scm fork <component-name>`

Fork a component from the registry.

**Options:**

- `-n, --name <name>` - New name for forked component
- `-d, --description <description>` - Custom description for fork
- `-p, --path <path>` - Custom output path
- `-f, --force` - Overwrite existing directory
- `-y, --yes` - Skip confirmation prompts

**Examples:**

```bash
scm fork shadcn/button
scm fork shadcn/button@1.0.0
scm fork shadcn/button --name my-button
scm fork shadcn/button --description "My custom button variant"
```

## Component Structure

SCM uses the **standard shadcn/ui registry.json format**. Build your component using the regular shadcn/ui structure, then publish via SCM.

### registry.json Example (shadcn/ui format)

```json
{
  "name": "my-button",
  "type": "registry:ui",
  "title": "My Awesome Button",
  "description": "A beautiful button component with multiple variants",
  "files": [
    {
      "path": "MyButton.tsx",
      "type": "registry:ui"
    },
    {
      "path": "useMyButton.ts",
      "type": "registry:hook"
    }
  ],
  "dependencies": ["react@^18.0.0", "lucide-react@^0.3.0"],
  "registryDependencies": ["shadcn/button"],
  "author": "Your Name <your-email@example.com>",
  "categories": ["ui", "button"]
}
```

### Workflow

1. **Create**: Use `scm create` to generate a component with proper shadcn/ui structure
2. **Develop**: Build your component using standard shadcn/ui patterns
3. **Publish**: Use `scm publish` to upload to the community registry
4. **Share**: Others can install with `scm add username/component-name`

## Registry Structure

The community registry follows this structure:

```
components/
├── {github-username}/          # User namespace (GitHub username)
│   ├── {component-name}/       # Component directory
│   │   ├── 1.0.0/             # Version directory (semver)
│   │   │   ├── registry.json  # Component metadata
│   │   │   ├── README.md      # Documentation
│   │   │   └── registry/      # Component files directory
│   │   │       ├── ui/        # UI components
│   │   │       ├── hooks/     # React hooks
│   │   │       ├── lib/       # Utilities and types
│   │   │       └── ...        # Other file types
│   │   └── 1.1.0/             # Newer version
│   └── another-component/
└── another-user/
    └── ...
```

## How It Works

1. **Authentication**: Use `scm login` to authenticate with GitHub OAuth
2. **Discovery**: Search and browse components with `scm search` and `scm preview`
3. **Installation**: Install components with `scm add` - handles dependencies automatically
4. **Creation**: Create new components with `scm create` - generates proper structure
5. **Publishing**: Publish with `scm publish` - creates GitHub PR to registry
6. **Updates**: Keep components updated with `scm update`

## Contributing

1. Fork a component: `scm fork shadcn/component`
2. Make your changes: Modify the component files
3. Publish your version: `scm publish`
4. Submit PR: Your component will be reviewed and merged

## License

MIT License - see LICENSE file for details.
