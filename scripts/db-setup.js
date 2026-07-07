#!/usr/bin/env node
/**
 * Local database bootstrap:
 * 1. Start PostgreSQL (Docker)
 * 2. Wait until ready
 * 3. Apply migrations (deploy — safe for existing DB)
 * 4. Seed dev data
 */
const { execSync, spawnSync } = require('node:child_process');
const { existsSync, copyFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiEnv = path.join(root, 'apps/api/.env');
const apiEnvExample = path.join(root, 'apps/api/.env.example');

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', cwd: root });
}

function sleep(seconds) {
  if (process.platform === 'win32') {
    execSync(`ping -n ${seconds + 1} 127.0.0.1 > nul`, { stdio: 'ignore' });
  } else {
    execSync(`sleep ${seconds}`, { stdio: 'ignore' });
  }
}

function hasDocker() {
  return spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0;
}

function waitForPostgres(maxAttempts = 30) {
  console.log('\nWaiting for PostgreSQL...');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const check = spawnSync(
      'docker',
      ['exec', 'tracker-postgres', 'pg_isready', '-U', 'tracker', '-d', 'tracker'],
      { encoding: 'utf8' },
    );
    if (check.status === 0) {
      console.log('PostgreSQL is ready.');
      return;
    }
    if (attempt === maxAttempts) {
      throw new Error('PostgreSQL did not become ready in time.');
    }
    sleep(2);
  }
}

function ensureEnv() {
  if (!existsSync(apiEnv)) {
    console.log('Creating apps/api/.env from .env.example');
    copyFileSync(apiEnvExample, apiEnv);
  }
}

function main() {
  ensureEnv();

  if (!hasDocker()) {
    console.error(`
Docker is not installed or not in PATH.

Options:
  1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/
  2. Or install PostgreSQL locally — see docs/12-database-and-environments.md
`);
    process.exit(1);
  }

  run('docker compose up -d postgres');
  waitForPostgres();
  run('npm run db:generate');
  run('npm run db:migrate:deploy');
  run('npm run db:seed');

  console.log(`
Database setup complete.

  API ready:   http://localhost:3001/api/v1/health/ready
  Dev user:    admin@tracker.local
  Manager:     manager@tracker.local

Start the app: npm run dev
`);
}

main();
