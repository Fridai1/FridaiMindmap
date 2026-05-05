# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.12.8 create --template minimal --types ts --add prettier eslint mcp="ide:claude-code+setup:remote" --install npm ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Database

This app uses SQLite via [Drizzle ORM](https://orm.drizzle.team). By default, the database file (`brain.db`) lives in the project root. Set `BRAIN_DB_PATH` to use a different file in development or production.

### Commands

```sh
# Generate migrations after editing src/lib/server/db/schema.ts
npm run db:generate

# Apply schema changes to the database (run this after editing src/lib/server/db/schema.ts)
npm run db:push

# Open Drizzle Studio — a visual browser for your database
npm run db:studio
```
