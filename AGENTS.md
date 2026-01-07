# Repository Guidelines

## Project Structure & Module Organization
- `src/app` holds the Next.js App Router routes and layouts (page-level UI).
- `src/components` contains reusable UI components used across pages.
- `src/lib` houses client utilities, data helpers, and shared logic.
- `src/types` defines shared TypeScript types and interfaces.
- `public` stores static assets served by Next.js.
- `src/app/globals.css` is the global styling entry point.

## Build, Test, and Development Commands
- `npm run dev` starts the local development server at `http://localhost:3000`.
- `npm run build` creates the production build.
- `npm run start` runs the production server from the build output.

## Coding Style & Naming Conventions
- TypeScript + React (Next.js) codebase.
- Indentation: follow existing 4-space indentation in `.tsx` files.
- Components use PascalCase (`FocusedView.tsx`), hooks/utilities use camelCase (`useSomething`, `getProject`).
- Keep styles in `src/app/globals.css` and use descriptive, kebab-case class names.
- No lint/format scripts are configured; match surrounding style and keep changes tight.

## Testing Guidelines
- No test framework or scripts are currently configured.
- If tests are introduced, add a script in `package.json` and document how to run it here.

## Commit & Pull Request Guidelines
- Commit history uses short, capitalized, imperative-style messages (e.g., “Fix auth cookie loop”).
- Keep commits focused and scoped to a single change when possible.
- PRs should include a clear description, any relevant issue links, and UI screenshots for visual changes.
- Note how you validated the change (e.g., “tested locally with `npm run dev`”).

## Agent Scope
- You are working ONLY in this repo.

## Security & Configuration Tips
- Store secrets in local environment files such as `.env.local`; do not commit credentials.
- Validate any client-side API key flows carefully before shipping UI changes.
