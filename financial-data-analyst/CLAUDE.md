# Financial Data Analyst Project Guide

## Development Commands
- **Install dependencies**: `npm install`
- **Start development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Start production server**: `npm run start`
- **Lint code**: `npm run lint`

## Code Style Guidelines
- **TypeScript**: Use strict mode with proper type definitions and interfaces
- **React Components**: Use functional components with explicit type annotations
- **State Management**: Prefer React hooks for component state
- **Formatting**: Follow Next.js ESLint configuration
- **Imports**: Group imports by type (React, external libs, internal components, styles)
- **Error Handling**: Use try/catch blocks with specific error types
- **Naming**: Use PascalCase for components, camelCase for functions and variables
- **Types**: Define interfaces for all component props and data structures
- **Libraries**: Use shadcn/ui for components, Recharts for data visualization

## Project Structure
- `app/`: Next.js app router pages and API routes
- `components/`: Reusable React components
- `utils/`: Helper functions and utilities
- `types/`: TypeScript type definitions
- `lib/`: Shared libraries and configuration
- `public/`: Static assets

## Best Practices
- Ensure proper error handling for API calls and file operations
- Use type-safe data structures for chart data
- Follow existing patterns for new components and features
- Keep components small and focused on a single responsibility
- Maintain consistent styling with TailwindCSS classes