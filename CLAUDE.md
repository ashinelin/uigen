# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # Initial setup: install deps, generate Prisma client, run migrations
npm run dev          # Start dev server with Turbopack on port 3000
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run all Vitest tests
npm run db:reset     # Reset the SQLite database
```

To run a single test file:
```bash
npx vitest run src/lib/transform/__tests__/jsx-transformer.test.ts
```

## Environment Variables

- `ANTHROPIC_API_KEY` — If unset, a `MockLanguageModel` is used instead (returns static Counter/Form/Card components). No API key needed for local dev.
- `JWT_SECRET` — Defaults to `"development-secret-key"` if unset.

## Architecture Overview

**UIGen** is an AI-powered React component generator. Users describe components in a chat; Claude generates code; a live preview renders in an iframe.

### Virtual File System

`src/lib/file-system.ts` — `VirtualFileSystem` is a Map-based in-memory file tree. Files are never written to disk during editing; the entire tree is serialized as JSON and stored in the `Project.data` column in SQLite. Key methods: `createFile`, `updateFile`, `deleteFile`, `rename`, `replaceInFile`, `serialize`/`deserialize`.

### React Context Layer

- `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) — holds the `VirtualFileSystem` instance, exposes mutation methods, and processes tool calls from Claude (`str_replace_editor`, `file_manager`). Increments `refreshTrigger` on each change.
- `ChatContext` (`src/lib/contexts/chat-context.tsx`) — wraps Vercel AI SDK's `useChat()`, connects to `FileSystemContext.handleToolCall`, and tracks anonymous user work.

### Claude Integration & Tool Use

`src/app/api/chat/route.ts` — streaming POST endpoint. Sends messages to Claude with:
- A system prompt (`src/lib/prompts/generation.tsx`) instructing it to produce React components
- Current file system state
- Two tool definitions:
  - `str_replace_editor` (`src/lib/tools/str-replace.ts`) — view, create, str_replace, insert operations on files
  - `file_manager` (`src/lib/tools/file-manager.ts`) — rename/delete files

Tool calls stream back to the frontend, where `FileSystemContext` applies them to the virtual file system. The `onFinish` hook persists messages + file system state to the database.

### Live Preview Pipeline

`src/components/preview/PreviewFrame.tsx` detects `refreshTrigger` changes, finds the entry point (App.jsx/tsx, index.jsx/tsx), then:
1. Transforms all JS/TS/JSX/TSX files via Babel standalone (`src/lib/transform/jsx-transformer.ts`)
2. Builds an ESM import map (React/ReactDOM from esm.sh, third-party packages from esm.sh, local files as blob URLs)
3. Injects the result into a sandboxed `<iframe srcdoc>` with `allow-scripts allow-same-origin allow-forms`

### Database & Auth

- **Prisma + SQLite** (`prisma/schema.prisma`): `User` (email + bcrypt password) and `Project` (stores `messages` and `data` as JSON strings). Anonymous projects have `userId: null`.
- **Auth** (`src/lib/auth.ts`): JWT in HTTP-only cookies, 7-day expiration, validated via `jose`. Middleware protects `/api/projects/*` and `/api/filesystem/*` routes.

### Three-Panel UI Layout

`src/app/main-content.tsx` renders a `react-resizable-panels` layout:
- **Left 35%**: Chat (`ChatInterface` → `MessageList` + `MessageInput`)
- **Right 65%**: Tabs
  - **Preview**: `PreviewFrame` (iframe)
  - **Code**: `FileTree` (30%) + `CodeEditor` Monaco (70%)

### Key Paths

| Path | Role |
|------|------|
| `src/app/api/chat/route.ts` | Claude streaming endpoint |
| `src/lib/file-system.ts` | Virtual FS core |
| `src/lib/contexts/file-system-context.tsx` | FS state + tool call handler |
| `src/lib/contexts/chat-context.tsx` | Chat state |
| `src/components/preview/PreviewFrame.tsx` | Live preview rendering |
| `src/lib/transform/jsx-transformer.ts` | Babel JSX → JS pipeline |
| `src/lib/provider.ts` | Anthropic / Mock model abstraction |
| `prisma/schema.prisma` | DB schema |
| `src/actions/` | Server actions (auth, project CRUD) |

## Testing

Tests live in `src/**/__tests__/` and use Vitest with a jsdom environment. Coverage areas: chat components, file tree, context hooks, JSX transformer, virtual file system utilities.
