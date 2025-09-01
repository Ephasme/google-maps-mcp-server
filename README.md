**Google Maps MCP Server (TypeScript, ESM)**

- Purpose: Minimal scaffolding for a Model Context Protocol (MCP) server exposing Google Maps tools (geocode, places search, directions).
- Stack: Node.js (ESM), TypeScript, ESLint, Prettier.

**Prerequisites**

- Node.js >= 18.17
- A Google Maps API key with access to Geocoding, Places, and Directions APIs

**Setup (pnpm)**

- Enable Corepack (recommended, Node >= 18 ships with it): `corepack enable`
- Optionally pin pnpm via Corepack: `corepack prepare pnpm@latest --activate`
- Copy `.env.example` to `.env` and set `GOOGLE_MAPS_API_KEY`.
- Install dependencies: `pnpm install`
- Build: `pnpm build`
- Start (stdio MCP server): `pnpm start`

The server exposes three MCP tools:

- geocode: `{ address: string }`
- places_search: `{ query: string }`
- directions: `{ origin: string, destination: string, mode?: 'driving'|'walking'|'bicycling'|'transit' }`

These tools call Google Maps REST endpoints and return JSON responses.

**Scripts (pnpm)**

- `pnpm dev`: Watch and run with `tsx` (development)
- `pnpm build`: Compile TypeScript to `dist/`
- `pnpm start`: Run compiled server from `dist/index.js`
- `pnpm lint` / `pnpm lint:fix`: ESLint
- `pnpm format` / `pnpm format:check`: Prettier

**Project Structure**

- `src/index.ts`: MCP server setup and tool registration
- `src/googleMaps.ts`: Thin client wrappers for Google Maps APIs
- `dist/`: Compiled output (gitignored)

**Notes**

- This is a skeleton: adjust tool shape and responses as needed for your MCP client.
- Ensure relevant Google Maps APIs are enabled in your Google Cloud project.
