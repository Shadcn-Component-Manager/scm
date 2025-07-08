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
scm add user/button
```

## Commands

### Authentication

```bash
scm login          # Authenticate with GitHub OAuth
scm logout         # Clear stored credentials
```

### Component Management

```bash
scm create <name>  # Create a new component with basic structure
scm publish        # Publish component to registry with automatic versioning
scm add <name>     # Install a component with dependency resolution
scm update [name]  # Update installed components to latest versions
```

### Discovery

```bash
scm search <term>  # Search for components in registry
scm preview <name> # Preview component details and documentation
scm fork <name>    # Fork a component for customization
```

## Usage Examples

### Creating a Component

```bash
# Create a new button component
scm create my-button

# Generates:
# - components/my-button/registry.json
# - components/my-button/my-button.tsx
```

### Publishing Your Component

```bash
# From your component directory
scm publish

# Skip confirmation prompts
scm publish --yes

# With custom commit message
scm publish --message "feat: add awesome button component"
```

### Installing Components

```bash
# Install latest version
scm add user/button

# Install specific version
scm add user/button@1.0.0

# Force refresh cache
scm add user/button --force
```

**Note**: Reserved component names (like `button`, `card`, `dialog`) automatically redirect to `shadcn add` to ensure you get the official shadcn/ui component.

### Searching Components

```bash
# Basic search
scm search button

# Filter by category
scm search button --category ui

# Limit results
scm search button --limit 5
```

### Forking Components

```bash
# Fork a component
scm fork user/button

# Fork specific version
scm fork user/button --version 1.0.0

# Fork with custom name
scm fork user/button --name my-button
```

## Setup

### Authentication

```bash
scm login
```

This will:
1. Generate GitHub OAuth URL
2. Open browser for authorization
3. Store access token securely

## Reserved Component Names

SCM automatically detects reserved component names that conflict with official shadcn/ui components:

- Core UI: `button`, `card`, `dialog`, `input`, `form`, etc.
- Blocks: `dashboard-01`, `sidebar-01`, `login-01`, etc.
- Charts: `chart-area-default`, `chart-bar-default`, etc.
- Calendar: `calendar-01`, `calendar-02`, etc.
- Themes: `theme-daylight`, `theme-midnight`, etc.

## Component Structure

Your component should have this structure:

```
my-component/
├── registry.json    # Component metadata
├── MyComponent.tsx  # Main component file
├── useMyComponent.ts # Hook (optional)
├── styles.css       # Styles (optional)
└── README.md        # Documentation (optional)
```

### registry.json Example

```json
{
  "name": "my-button",
  "type": "registry:component",
  "title": "My Awesome Button",
  "description": "A beautiful button component with multiple variants",
  "files": [
    {
      "path": "MyButton.tsx",
      "type": "registry:component"
    },
    {
      "path": "useMyButton.ts",
      "type": "registry:hook"
    }
  ],
  "dependencies": ["react@^18.0.0", "lucide-react@^0.3.0"],
  "registryDependencies": ["button"],
  "version": "1.0.0",
  "author": "Your Name <your-email@example.com>",
  "categories": ["ui", "button"]
}
```

## CSS Variables Support

Components can include CSS variables that are automatically applied:

```json
{
  "cssVars": {
    "theme": {
      "font-heading": "Poppins, sans-serif"
    },
    "light": {
      "brand": "20 14.3% 4.1%"
    },
    "dark": {
      "brand": "20 14.3% 4.1%"
    }
  }
}
```

## Registry Structure

The community registry follows this structure:

```
components/
├── username/
│   └── component-name/
│       ├── 1.0.0/
│       │   ├── registry.json
│       │   ├── Component.tsx
│       │   └── README.md
│       └── 1.1.0/
│           └── ...
└── another-user/
    └── ...
```

## Contributing

1. Fork a component: `scm fork user/component`
2. Make your changes: Modify the component files
3. Publish your version: `scm publish`
4. Submit PR: Your component will be reviewed and merged

## License

MIT License - see LICENSE file for details.
