This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Build Mode vs Conversation Mode

YapMap has two primary modes:

- **Build Mode** (`/app/project/:id/build`): edit the tree, fill objection bundles, run quality checks, and generate objection archetypes.
- **Conversation Mode** (`/app/project/:id/call`): ultra-minimal UI for live use with no network calls. Everything must be precomputed.

### Call Mode Readiness

Build Mode shows a **Call Mode Ready** indicator that checks:
- objection bundle completeness + validator score
- cached locally and offline-ready status

## Objection Bundles

Objection nodes carry a structured bundle with:
- primary line, diagnose question, soft/direct/challenger responses
- proof, risk reset, next step, tags

Validation runs automatically and shows blocking errors + warnings.

## Offline + Performance

Conversation Mode is local-first:
- tree data is cached locally (IndexedDB)
- call mode navigation uses in-memory indexes for instant switching

## Tests

Run the validator tests:

```bash
npm run test
```

## Supabase Google OAuth Setup

To enable Google login:

1) In the Supabase dashboard, enable the Google provider.
2) Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<your-prod-domain>/auth/callback`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
