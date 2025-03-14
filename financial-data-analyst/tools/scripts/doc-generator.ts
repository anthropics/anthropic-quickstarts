import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';

interface DocTemplate {
  name: string;
  description: string;
  targetDir: string;
  templateFile: string;
  fileNamePattern: string;
  placeholders?: Array<{
    key: string;
    prompt: string;
    type?: 'input' | 'list' | 'date';
    options?: Array<{ name: string; value: string }>;
    default?: string | (() => string);
  }>;
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Find the next ADR number by scanning existing ADRs
function findNextAdrNumber(targetDir: string): string {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return '001';
  }

  const files = fs.readdirSync(targetDir);
  const adrNumbers = files
    .filter(file => file.startsWith('ADR-'))
    .map(file => {
      const match = file.match(/ADR-(\d+)-/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(num => !isNaN(num));

  const maxNum = Math.max(0, ...adrNumbers);
  return (maxNum + 1).toString().padStart(3, '0');
}

const TEMPLATES: DocTemplate[] = [
  {
    name: 'RFC',
    description: 'Request for Comments - Technical proposals and architecture decisions',
    targetDir: 'docs/architecture/rfcs',
    templateFile: 'docs/templates/rfc-template.md',
    fileNamePattern: '{name}_RFC.md'
  },
  {
    name: 'PRD',
    description: 'Product Requirements Document - Product specifications and requirements',
    targetDir: 'docs/product/requirements',
    templateFile: 'docs/templates/prd-template.md',
    fileNamePattern: '{name}_PRD.md'
  },
  {
    name: 'Guideline',
    description: 'Development standards and best practices',
    targetDir: 'docs/guidelines',
    templateFile: 'docs/templates/guideline-template.md',
    fileNamePattern: '{name}_GUIDELINES.md'
  },
  {
    name: 'TaskList',
    description: 'Project planning and progress tracking',
    targetDir: 'docs/planning/task-lists',
    templateFile: 'docs/templates/task-list-template.md',
    fileNamePattern: '{name}_TASK_LIST.md'
  },
  {
    name: 'ADR',
    description: 'Architecture Decision Record - Document significant architecture decisions',
    targetDir: 'docs/architecture/decisions',
    templateFile: 'docs/templates/adr-template.md',
    fileNamePattern: 'ADR-{number}-{name}.md',
    placeholders: [
      {
        key: 'number',
        prompt: 'ADR Number:',
        default: () => findNextAdrNumber('docs/architecture/decisions')
      },
      {
        key: 'title',
        prompt: 'Decision title:'
      },
      {
        key: 'date',
        prompt: 'Date:',
        type: 'date',
        default: formatDate(new Date())
      },
      {
        key: 'status',
        prompt: 'Status:',
        type: 'list',
        options: [
          { name: 'Proposed', value: 'Proposed' },
          { name: 'Accepted', value: 'Accepted' },
          { name: 'Rejected', value: 'Rejected' },
          { name: 'Deprecated', value: 'Deprecated' },
          { name: 'Superseded', value: 'Superseded' }
        ],
        default: 'Proposed'
      }
    ]
  }
];

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('type', {
      alias: 't',
      describe: 'Type of document to create',
      choices: TEMPLATES.map(t => t.name.toLowerCase()),
    })
    .option('name', {
      alias: 'n',
      describe: 'Name of the document (will be used in file name)',
      type: 'string',
    })
    .help()
    .argv;

  // If type not provided, ask for it
  const docType = argv.type || (await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: 'What type of document would you like to create?',
    choices: TEMPLATES.map(t => ({
      name: `${t.name} - ${t.description}`,
      value: t.name.toLowerCase()
    }))
  }])).type;

  const template = TEMPLATES.find(t => t.name.toLowerCase() === docType.toLowerCase());
  if (!template) {
    console.error('Invalid document type');
    process.exit(1);
  }

  // If name not provided, ask for it
  const name = argv.name || (await inquirer.prompt([{
    type: 'input',
    name: 'name',
    message: 'Enter a name for your document (used in file name):',
    validate: (input: string) => {
      if (input.trim() === '') return 'Name cannot be empty';
      if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Name can only contain letters, numbers, underscores, and hyphens';
      return true;
    }
  }])).name;

  // Create target directory if it doesn't exist
  if (!fs.existsSync(template.targetDir)) {
    fs.mkdirSync(template.targetDir, { recursive: true });
  }

  // Check if template file exists
  if (!fs.existsSync(template.templateFile)) {
    console.error(`Template file not found: ${template.templateFile}`);
    process.exit(1);
  }

  // Generate output file path
  let outputFile = path.join(
    template.targetDir,
    template.fileNamePattern.replace('{name}', name.toUpperCase())
  );

  // Check if file already exists
  if (fs.existsSync(outputFile)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'File already exists. Overwrite?',
      default: false
    }]);

    if (!overwrite) {
      console.log('Operation cancelled');
      process.exit(0);
    }
  }

  // Copy template to new file
  try {
    let templateContent = fs.readFileSync(template.templateFile, 'utf8');
    
    // Replace additional placeholders if any
    if (template.placeholders && template.placeholders.length > 0) {
      const placeholderValues: Record<string, string> = {};
      
      // Collect values for each placeholder
      for (const placeholder of template.placeholders) {
        // Handle special placeholder types
        if (placeholder.type === 'date' && placeholder.default) {
          const defaultValue = typeof placeholder.default === 'function' 
            ? (placeholder.default as () => string)() 
            : placeholder.default;
          placeholderValues[placeholder.key] = defaultValue;
          continue;
        }
        
        // Set default value
        let defaultValue: string | undefined;
        if (typeof placeholder.default === 'function') {
          defaultValue = (placeholder.default as () => string)();
        } else {
          defaultValue = placeholder.default;
        }
        
        const promptOptions: any = {
          name: 'value',
          message: placeholder.prompt,
        };
        
        if (placeholder.type === 'list' && placeholder.options) {
          promptOptions.type = 'list';
          promptOptions.choices = placeholder.options;
          if (defaultValue) {
            promptOptions.default = defaultValue;
          }
        } else {
          promptOptions.type = 'input';
          if (defaultValue) {
            promptOptions.default = defaultValue;
          }
        }
        
        const { value } = await inquirer.prompt([promptOptions]);
        placeholderValues[placeholder.key] = value;
        
        // Also replace in file name pattern if needed
        if (outputFile.includes(`{${placeholder.key}}`)) {
          outputFile = outputFile.replace(`{${placeholder.key}}`, value);
        }
      }
      
      // Replace all placeholders in content
      for (const [key, value] of Object.entries(placeholderValues)) {
        templateContent = templateContent.replace(new RegExp(`\{${key}\}`, 'g'), value);
      }
    }
    
    // Replace {name} with the document name if it appears in the content
    templateContent = templateContent.replace(/\{name\}/g, name);
    
    // Add creation date if not already present
    if (!templateContent.includes('{date}') && !templateContent.includes('Date:')) {
      const today = formatDate(new Date());
      if (templateContent.startsWith('#')) {
        // Insert after the first heading
        const lines = templateContent.split('\n');
        lines.splice(1, 0, `\n*Created: ${today}*\n`);
        templateContent = lines.join('\n');
      } else {
        // Prepend to the document
        templateContent = `*Created: ${today}*\n\n${templateContent}`;
      }
    }
    
    fs.writeFileSync(outputFile, templateContent);
    console.log(`Successfully created ${outputFile}`);
  } catch (error) {
    console.error('Error creating document:', error);
    process.exit(1);
  }
}

main().catch(console.error);