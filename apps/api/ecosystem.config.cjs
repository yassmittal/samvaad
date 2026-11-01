// PM2 process file for the hosted API (D-010, docs/deployment.md). Secrets stay in apps/api/.env,
// which Bun loads from this working directory, so nothing in here is sensitive.

// The instance's pinned Bun 1.4.2 (installed for StrideMon), the version bun.lock was made with.
// The shared ~/.bun on the instance is older.
const PINNED_BUN_PATH = `${process.env.HOME}/.bun-1.4.2/bin/bun`;

module.exports = {
  apps: [
    {
      name: 'samvaad-api',
      cwd: __dirname,
      script: PINNED_BUN_PATH,
      // The entry file directly, not `bun run start`, whose inner `bun` would come from PATH.
      args: 'src/index.ts',
      interpreter: 'none',
      // One instance: rooms live in memory (D-004), so a second process would split them.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '512M',
      kill_timeout: 5000,
    },
  ],
};
