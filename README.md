# Shadcn Component Manager (SCM)

A powerful CLI tool for creating, sharing, and installing shadcn/ui components with ease. Build your component library and share it with the community!

## 🚀 Quick Start

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

## ✨ Features

- **🔧 Component Creation**: Generate components with interactive prompts
- **📦 Easy Publishing**: Publish components to the community registry
- **🔍 Component Discovery**: Search and preview components before installing
- **⚡ Fast Installation**: Install components with automatic dependency resolution
- **🔄 Version Management**: Automatic versioning and updates
- **🔒 Secure**: GitHub OAuth authentication, no secrets needed

## 📚 Commands

### Authentication

```bash
scm login          # Authenticate with GitHub
scm logout         # Clear stored credentials
```

### Component Management

```bash
scm create <name>  # Create a new component
scm publish        # Publish component to registry
scm add <name>     # Install a component
scm update [name]  # Update installed components
```

### Discovery

```bash
scm search <term>  # Search for components
scm preview <name> # Preview component details
scm fork <name>    # Fork a component for customization
```

## 🎯 Usage Examples

### Creating a Component

```bash
# Create a new button component
scm create my-button

# Follow the prompts to configure:
# - Component title and description
# - Files to include
# - Dependencies
# - Categories
```

### Publishing Your Component

```bash
# From your component directory
scm publish

# Or skip confirmation prompts
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

### Searching Components

```bash
# Basic search
scm search button

# Filter by category
scm search button --category ui

# Limit results
scm search button --limit 5
```

## 🔧 Setup

### 1. Authentication

```bash
scm login
```

This will:

1. Generate a GitHub OAuth URL
2. Open your browser to authorize
3. Ask you to paste the authorization code
4. Store your access token securely

## 📁 Component Structure

Your component should have this structure:

```
my-component/
├── registry.json    # Component metadata
├── MyComponent.tsx  # Main component file
├── useMyComponent.ts # Hook (optional)
├── styles.css       # Styles (optional)
└── README.md        # Documentation (optional)
```

### SCM Internal Files

SCM automatically manages internal files in the package manager directory (`~/.scm/`):

- **`~/.scm/version-hashes.json`**: Tracks file changes for automatic versioning
- **`~/.scm/config.json`**: Stores authentication and configuration data
- **`~/.scm/cache/`**: Caches registry metadata for faster operations

These files are automatically created and managed by SCM. They should not be manually edited and are completely separate from your project files.

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
  "author": "Your Name <your-email@example.com>",
  "categories": ["ui", "button"]
}
```

## 🎨 CSS Variables Support

Components can include CSS variables that will be automatically applied:

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

## 🔍 Registry Structure

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

## 🤝 Contributing

1. **Fork a component**: `scm fork user/component`
2. **Make your changes**: Modify the component files
3. **Publish your version**: `scm publish`
4. **Submit PR**: Your component will be reviewed and merged

## 📄 License

MIT License - see LICENSE file for details.

## 🔮 Roadmap

- [ ] Private registries
- [ ] npm style marketplace
- [ ] Interactive previews
- [ ] Analytics and usage tracking
- [ ] Multi-framework support
