const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REPO_SLUG,
  WORKFLOW_ERROR_REGEX,
  BRANCH_COLLISION_REGEX,
} = require('./constants');
const {
  run,
  output,
  runWithOutput,
  hasStagedChanges,
} = require('./shell');
const {
  extractActionStepScript,
  extractBashFunction,
  renderActionScript,
  parseGithubOutput,
  runActionStep,
  defaultActionInputs,
  toActionInputs,
  ensureActionStepSuccess,
} = require('./action-step');
const {
  remoteBranchExists,
  nextAvailablePrBranch,
} = require('./repo-fixture');

const runPoosh = (repo, inputs) => {
  const actionInputs = toActionInputs(inputs);
  ensureActionStepSuccess("Validate 'commit-message'", { inputs: actionInputs });
  ensureActionStepSuccess("Validate 'trigger-branch'", { inputs: actionInputs });
  ensureActionStepSuccess("Validate 'pr-branch'", { inputs: actionInputs });
  ensureActionStepSuccess("Validate 'pr-base'", { inputs: actionInputs });

  const commitMessage = actionInputs['commit-message'];
  const triggerBranch = actionInputs['trigger-branch'];
  const outputs = {
    triggerBranch,
    commitSha: '',
    prUrl: '',
    prNumber: '',
  };

  const currentBranch = output('git rev-parse --abbrev-ref HEAD', repo);
  if (currentBranch !== triggerBranch && remoteBranchExists(repo, triggerBranch)) {
    run(`git fetch origin ${triggerBranch}:${triggerBranch}`, repo);
    run(`git checkout ${triggerBranch}`, repo);
    run(`git pull origin ${triggerBranch}`, repo);
  }

  run('git add .', repo);
  if (!hasStagedChanges(repo)) {
    return outputs;
  }

  run('git config --local user.name "github-actions[bot]"', repo);
  run('git config --local user.email "github-actions[bot]@users.noreply.github.com"', repo);
  const safeMessage = commitMessage.replace(/"/g, '\\"');
  run(`git commit -m "${safeMessage}"`, repo);
  outputs.commitSha = output('git rev-parse HEAD', repo);

  const workflowChanges = output('git show --name-only --pretty="" HEAD -- .github/workflows', repo) !== '';
  const pushResult = runWithOutput(`git push origin "HEAD:${triggerBranch}"`, repo);
  const workflowPushDenied = !pushResult.ok && WORKFLOW_ERROR_REGEX.test(pushResult.output);

  if (pushResult.ok) {
    return outputs;
  }

  let prBranch = actionInputs['pr-branch'];
  let autoPrBranch = false;
  let prBranchBase = '';

  if (!prBranch) {
    prBranchBase = `poosh/${triggerBranch}`;
    prBranch = nextAvailablePrBranch(repo, prBranchBase);
    autoPrBranch = true;
  } else if (!prBranch.includes('/')) {
    prBranch = `poosh/${prBranch}`;
  }

  const resolveBaseSha = () => {
    let baseSha = '';
    const firstTry = runWithOutput('git rev-parse HEAD~1', repo);
    if (firstTry.ok) {
      baseSha = firstTry.output;
    }
    const shallow = runWithOutput('git rev-parse --is-shallow-repository', repo);
    if (!baseSha && shallow.ok && shallow.output === 'true') {
      const deepenBranch = runWithOutput(`git fetch --deepen=1 origin ${triggerBranch}`, repo);
      if (!deepenBranch.ok) {
        runWithOutput('git fetch --deepen=1 origin', repo);
      }
      const retry = runWithOutput('git rev-parse HEAD~1', repo);
      if (retry.ok) {
        baseSha = retry.output;
      }
    }
    if (!baseSha) {
      throw new Error(
        'Unable to resolve the parent commit to strip workflow changes. Ensure checkout fetch-depth is at least 2.'
      );
    }
    return baseSha;
  };

  const stripWorkflowsAndCommit = () => {
    const origSha = output('git rev-parse HEAD', repo);
    const baseSha = resolveBaseSha();

    run(`git checkout -B ${prBranch} ${baseSha}`, repo);
    run(`git restore --source ${origSha} --staged --worktree .`, repo);
    run(`git restore --source ${baseSha} --staged --worktree .github/workflows`, repo);

    if (!hasStagedChanges(repo)) {
      return false;
    }

    run(`git commit -m "${safeMessage}"`, repo);
    outputs.commitSha = output('git rev-parse HEAD', repo);
    return true;
  };

  const pushPrBranch = () => {
    let collisionRetries = 0;

    while (true) {
      const prPush = runWithOutput(`git push origin ${prBranch}`, repo);
      if (prPush.ok) {
        return { ok: true, output: '' };
      }

      if (
        autoPrBranch &&
        BRANCH_COLLISION_REGEX.test(prPush.output) &&
        remoteBranchExists(repo, prBranch)
      ) {
        collisionRetries += 1;
        if (collisionRetries > 20) {
          return prPush;
        }

        prBranch = nextAvailablePrBranch(repo, prBranchBase, collisionRetries);
        run(`git checkout -B ${prBranch}`, repo);
        continue;
      }

      return prPush;
    }
  };

  if (workflowPushDenied && workflowChanges) {
    if (!stripWorkflowsAndCommit()) {
      return outputs;
    }
  } else {
    run(`git checkout -b ${prBranch}`, repo);
  }

  const prPush = pushPrBranch();
  if (!prPush.ok) {
    if (WORKFLOW_ERROR_REGEX.test(prPush.output) && workflowChanges) {
      if (!stripWorkflowsAndCommit()) {
        return outputs;
      }

      const retryPush = pushPrBranch();
      if (!retryPush.ok) {
        throw new Error(retryPush.output || 'push failed');
      }
    } else {
      throw new Error(prPush.output || 'push failed');
    }
  }

  const prBase = actionInputs['pr-base'] || triggerBranch;
  const composeOutputs = ensureActionStepSuccess(
    'Compose PR body',
    {
      inputs: actionInputs,
    },
    {
      env: {
        GITHUB_REPOSITORY: REPO_SLUG,
      },
    }
  );

  outputs.prUrl = `https://example.com/${prBranch}`;
  outputs.prNumber = '1';
  outputs.prBase = prBase;
  outputs.prBranch = prBranch;
  outputs.prBody = composeOutputs.body;

  return outputs;
};

const addFileChange = (repo) => {
  fs.appendFileSync(path.join(repo, 'file.txt'), 'change\n');
};

const addWorkflowChange = (repo) => {
  const workflowsDir = path.join(repo, '.github', 'workflows');
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: ci\n');
};

const assertWorkflowFilesStripped = (repo, prBranch) => {
  run(`git fetch origin ${prBranch}`, repo);

  const workflowDiff = output(
    `git diff --name-only origin/${prBranch}~1 origin/${prBranch} -- .github/workflows`,
    repo
  );
  assert.strictEqual(workflowDiff, '');

  const fileDiff = output(
    `git diff --name-only origin/${prBranch}~1 origin/${prBranch} -- file.txt`,
    repo
  );
  assert.strictEqual(fileDiff, 'file.txt');
};

const assertActionStepFails = ({ stepName, inputs, pattern }) => {
  const result = runActionStep({
    stepName,
    context: {
      inputs: defaultActionInputs(inputs),
    },
  });
  assert.strictEqual(result.ok, false);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
};

const runResolveBaseShaShallowRecovery = () => {
  const createPrScript = renderActionScript(
    extractActionStepScript('Create PR branch and push (if direct push failed)'),
    {
      inputs: defaultActionInputs({ 'trigger-branch': 'main' }),
      steps: {
        check_changes: {
          outputs: {
            changed: 'true',
            workflow_changes: 'true',
          },
        },
        try_push: {
          outputs: {
            push_success: 'false',
            workflow_push_denied: 'true',
          },
        },
      },
    }
  );
  const resolveBaseShaFn = extractBashFunction(createPrScript, 'resolve_base_sha');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poosh-base-sha-'));
  const shimDir = path.join(tempDir, 'shim');
  fs.mkdirSync(shimDir, { recursive: true });

  const shimPath = path.join(shimDir, 'git');
  const shimLog = path.join(tempDir, 'git.log');
  const shimCount = path.join(tempDir, 'head1.count');
  fs.writeFileSync(
    shimPath,
    `#!/bin/sh
set -eu
echo "$*" >> "$GIT_SHIM_LOG"
if [ "$1" = "rev-parse" ] && [ "\${2:-}" = "HEAD~1" ]; then
  count=0
  if [ -f "$GIT_SHIM_COUNT" ]; then
    count=$(cat "$GIT_SHIM_COUNT")
  fi
  count=$((count + 1))
  echo "$count" > "$GIT_SHIM_COUNT"
  if [ "$count" -eq 1 ]; then
    exit 1
  fi
  echo "base-sha-123"
  exit 0
fi
if [ "$1" = "rev-parse" ] && [ "\${2:-}" = "--is-shallow-repository" ]; then
  echo "true"
  exit 0
fi
if [ "$1" = "fetch" ] && [ "\${2:-}" = "--deepen=1" ] && [ "\${3:-}" = "origin" ]; then
  exit 0
fi
echo "unexpected git command: $*" >&2
exit 1
`
  );
  fs.chmodSync(shimPath, 0o755);

  const scriptPath = path.join(tempDir, 'run.sh');
  const outputPath = path.join(tempDir, 'github_output.txt');
  fs.writeFileSync(
    scriptPath,
    `set -e
${resolveBaseShaFn}
resolved="$(resolve_base_sha | tail -n 1)"
echo "resolved=$resolved" >> "$GITHUB_OUTPUT"
`
  );
  fs.chmodSync(scriptPath, 0o755);
  fs.writeFileSync(outputPath, '');

  try {
    execSync(`bash "${scriptPath}"`, {
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${shimDir}:${process.env.PATH || ''}`,
        GITHUB_OUTPUT: outputPath,
        GIT_SHIM_LOG: shimLog,
        GIT_SHIM_COUNT: shimCount,
      },
      stdio: 'pipe',
    });

    const outputs = parseGithubOutput(outputPath);
    assert.strictEqual(outputs.resolved, 'base-sha-123');

    const lines = fs
      .readFileSync(shimLog, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const headChecks = lines.filter((line) => line === 'rev-parse HEAD~1').length;
    assert.strictEqual(headChecks, 2);
    assert.ok(lines.includes('rev-parse --is-shallow-repository'));
    assert.ok(lines.includes('fetch --deepen=1 origin main'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

module.exports = {
  runPoosh,
  addFileChange,
  addWorkflowChange,
  assertWorkflowFilesStripped,
  assertActionStepFails,
  runResolveBaseShaShallowRecovery,
};
