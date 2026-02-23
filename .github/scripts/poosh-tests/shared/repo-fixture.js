const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  run,
  output,
} = require('./shell');

const writeHook = (bareRepo, { rejectBranch, rejectWorkflowChanges } = {}) => {
  const hookPath = path.join(bareRepo, 'hooks', 'pre-receive');
  const hookLines = ['#!/bin/sh', 'set -e', 'while read old new ref; do'];

  if (rejectBranch) {
    hookLines.push(
      `  if [ "$ref" = "refs/heads/${rejectBranch}" ]; then`,
      '    echo "reject" >&2',
      '    exit 1',
      '  fi'
    );
  }

  if (rejectWorkflowChanges) {
    hookLines.push(
      '  if [ "$old" = "0000000000000000000000000000000000000000" ]; then',
      '    changed=$(git diff-tree --no-commit-id --name-only -r "$new" -- .github/workflows)',
      '  else',
      '    changed=$(git diff --name-only "$old" "$new" -- .github/workflows)',
      '  fi',
      '  if [ -n "$changed" ]; then',
      '    echo "refusing to allow a GitHub App to create or update workflow without workflows permission" >&2',
      '    exit 1',
      '  fi'
    );
  }

  hookLines.push('done', 'exit 0');
  fs.writeFileSync(hookPath, `${hookLines.join('\n')}\n`);
  fs.chmodSync(hookPath, 0o755);
};

const seedRemoteBranch = (repo, defaultBranch, branch) => {
  run(`git checkout ${defaultBranch}`, repo);
  run(`git checkout -b ${branch}`, repo);
  fs.writeFileSync(path.join(repo, 'seed.txt'), `${branch}\n`);
  run('git add seed.txt', repo);
  run(`git commit -q -m "seed ${branch}"`, repo);
  run(`git push origin ${branch}`, repo);
  run(`git checkout ${defaultBranch}`, repo);
  run(`git branch -D ${branch}`, repo);
};

const setupRepo = ({
  defaultBranch = 'main',
  rejectBranch,
  rejectWorkflowChanges,
  existingPrBranch,
} = {}) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'poosh-test-'));
  run('git init --bare -q remote.git', base);
  const bare = path.join(base, 'remote.git');

  if (rejectBranch || rejectWorkflowChanges) {
    writeHook(bare, { rejectBranch, rejectWorkflowChanges });
  }

  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  run('git init -q', repo);
  run('git config user.name "Test Bot"', repo);
  run('git config user.email "test@example.com"', repo);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'hello\n');
  run('git add .', repo);
  run('git commit -q -m "init"', repo);
  run(`git branch -M ${defaultBranch}`, repo);
  run(`git remote add origin ${bare}`, repo);
  run(`git push -u origin ${defaultBranch}`, repo);

  if (existingPrBranch) {
    seedRemoteBranch(repo, defaultBranch, existingPrBranch);
  }

  return { base, repo };
};

const withRepo = (opts, fn) => {
  const ctx = setupRepo(opts);
  try {
    fn(ctx);
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
};

const remoteBranchExists = (repo, branch) => {
  try {
    run(`git ls-remote --exit-code --heads origin "refs/heads/${branch}"`, repo);
    return true;
  } catch {
    return false;
  }
};

const nextAvailablePrBranch = (repo, baseBranch, suffix = 0) => {
  let idx = suffix;
  let candidate = idx === 0 ? baseBranch : `${baseBranch}-${idx}`;

  while (remoteBranchExists(repo, candidate)) {
    idx += 1;
    candidate = `${baseBranch}-${idx}`;
  }

  return candidate;
};

module.exports = {
  writeHook,
  seedRemoteBranch,
  setupRepo,
  withRepo,
  remoteBranchExists,
  nextAvailablePrBranch,
  output,
  run,
};
