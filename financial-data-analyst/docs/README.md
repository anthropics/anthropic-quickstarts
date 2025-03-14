# Documentation Generator

A tool for generating standardized documentation files from templates.

## Available Document Types

- **RFC (Request for Comments)** - Technical proposals and architecture decisions
- **PRD (Product Requirements Document)** - Product specifications and requirements
- **Guideline** - Development standards and best practices
- **Task List** - Project planning and progress tracking
- **ADR (Architecture Decision Record)** - Document significant architecture decisions

## Usage

To generate a new document, run:

```bash
# With interactive prompts
npm run generate-doc

# Specify document type directly
npm run generate-doc -- --type rfc --name feature-name

# Short form
npm run generate-doc -- -t prd -n product-feature

# Shortcut commands for specific document types
npm run doc:rfc -- --name feature-name
npm run doc:prd -- --name product-feature
npm run doc:guideline -- --name coding-standards
npm run doc:task -- --name project-setup
npm run doc:adr -- --name use-typescript
```

### Command Line Options

- `--type`, `-t`: Type of document to create (rfc, prd, guideline, tasklist, adr)
- `--name`, `-n`: Name of the document (used in file name)

## Templates

Templates are stored in the `docs/templates` directory. Each document type has a corresponding template:

- `rfc-template.md` - Template for RFCs
- `prd-template.md` - Template for PRDs
- `guideline-template.md` - Template for guidelines
- `task-list-template.md` - Template for task lists
- `adr-template.md` - Template for ADRs

## Adding a New Template

To add a new template type:

1. Create a template file in `docs/templates/`
2. Add a new entry to the `TEMPLATES` array in `tools/scripts/doc-generator.ts`

Example:

```typescript
{
  name: 'NewType',
  description: 'Description of the new document type',
  targetDir: 'docs/your-category',
  templateFile: 'docs/templates/new-type-template.md',
  fileNamePattern: '{name}_NEW_TYPE.md',
  placeholders: [
    {
      key: 'custom_field',
      prompt: 'Enter value for custom field:',
      default: 'Default value'
    }
  ]
}
```

## Directory Structure

```
docs/
├── architecture/
│   ├── decisions/     # ADRs
│   └── rfcs/          # RFCs
├── guidelines/        # Guidelines
├── planning/
│   └── task-lists/    # Task Lists
├── product/
│   └── requirements/  # PRDs
└── templates/         # Templates
```