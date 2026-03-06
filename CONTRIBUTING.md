# Contributing to Sauria

Sauria is created and maintained by [Teo Bouancheau](https://github.com/teobouancheau). Contributions are welcome and appreciated.

## Getting Started

```bash
git clone https://github.com/teobouancheau/sauria.git
cd sauria
npm install
npm run typecheck
```

Node.js >= 22 is required. Check `.nvmrc` for the pinned version.

## Development Workflow

1. Fork the repository and create a branch from `develop`:
   - `feat/description` for new features
   - `fix/description` for bug fixes
   - `chore/description` for maintenance
2. Write your changes following the conventions below.
3. Run all checks before submitting:
   ```bash
   npm run typecheck
   npm run format:check
   npm run test
   ```
4. Open a pull request against `develop`. Never push directly to `main`.

## Code Conventions

### TypeScript

- Strict mode, no `any`, no `as` casting unless unavoidable.
- `import type` for type-only imports (`verbatimModuleSyntax` is enforced).
- All imports use `.js` extensions (ESM).
- Max 200 lines per file. Split if larger.
- Max 3 levels of nesting. Extract if deeper.

### Naming

- Files: `kebab-case.ts`
- Types/Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Booleans: `is`/`has`/`should`/`can` prefix

### Formatting

Prettier is configured. Run `npm run format` before committing. CI enforces `prettier --check`.

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code restructuring
- `chore:` maintenance
- `docs:` documentation

One logical change per commit. Imperative mood, max 72 characters.

## Security Rules

Sauria is security-first. These rules are non-negotiable:

- **No `child_process`, `eval`, `Function()`, `vm.run`** in `src/`.
- **No `createServer` or `.listen(`** in `src/`. Zero open ports.
- **No secrets in code.** API keys and tokens go through the encrypted vault only.
- **Parameterized queries only.** Never concatenate strings into SQL.
- **Validate all input** with Zod schemas at system boundaries.
- **No `console.log`** in production code. Use the structured logger.
- **PII scrubbing** before any AI call or log write.

CI runs a banned-pattern scanner on every PR. If it flags your code, the PR cannot merge.

## Architecture Overview

```
src/
  auth/       # OAuth, credential resolution, onboarding wizard
  ai/         # LLM providers, routing, extraction, anti-injection
  config/     # Schema, loader, paths, defaults
  db/         # SQLite connection, schema, world model, search
  engine/     # Proactive reasoning (deadlines, patterns, insights)
  channels/   # Telegram bot, CLI interactive mode
  ingestion/  # Data pipeline, dedup, normalization, entity resolution
  mcp/        # MCP server (expose) and client (consume)
  security/   # Vault, crypto, audit, rate limiter, PII scrubber, sandbox
  utils/      # Logger, budget tracking, version
```

## Testing

- Test behavior, not implementation.
- Mock external dependencies only (AI providers, network).
- No flaky tests. Fix or delete.

```bash
npm run test          # single run
npm run test:watch    # watch mode
```

## Reporting Vulnerabilities

**Do not open a public issue.** See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

Sauria is created by Teo Bouancheau. All contributors are credited in release notes.
