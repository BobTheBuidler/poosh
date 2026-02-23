const assert = require('assert');

const { withRepo, remoteBranchExists, run, output } = require('../shared/repo-fixture');
const {
  runPoosh,
  addFileChange,
  addWorkflowChange,
  assertWorkflowFilesStripped,
} = require('../shared/poosh-sim');

const buildWorkflowFallbackTests = () => [
  [
    'testWorkflowPermissionFallback',
    () =>
      withRepo({ rejectWorkflowChanges: true }, ({ repo }) => {
        addWorkflowChange(repo);
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: workflow fallback',
          triggerBranch: 'main',
        });

        assert.ok(outputs.prUrl);
        assert.ok(outputs.prBody.includes('Triggered by recent changes on branch'));
        assert.ok(remoteBranchExists(repo, outputs.prBranch));
        assertWorkflowFilesStripped(repo, outputs.prBranch);
      }),
  ],
  [
    'testFallbackBranchCollision',
    () =>
      withRepo({ rejectBranch: 'blocked', existingPrBranch: 'poosh/blocked' }, ({ repo }) => {
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: fallback collision',
          triggerBranch: 'blocked',
        });

        assert.strictEqual(outputs.prBranch, 'poosh/blocked-1');
        assert.ok(remoteBranchExists(repo, outputs.prBranch));
        assert.ok(remoteBranchExists(repo, 'poosh/blocked'));
      }),
  ],
  [
    'testWorkflowFallbackBranchCollision',
    () =>
      withRepo({ rejectWorkflowChanges: true, existingPrBranch: 'poosh/main' }, ({ repo }) => {
        addWorkflowChange(repo);
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: workflow collision fallback',
          triggerBranch: 'main',
        });

        assert.strictEqual(outputs.prBranch, 'poosh/main-1');
        assert.ok(remoteBranchExists(repo, outputs.prBranch));
        assert.ok(remoteBranchExists(repo, 'poosh/main'));
        assertWorkflowFilesStripped(repo, outputs.prBranch);
      }),
  ],
];

const buildWorkflowFallbackEdgeTests = () => [
  [
    'testWorkflowOnlyChangesNoFallbackPush',
    () =>
      withRepo({ rejectWorkflowChanges: true }, ({ repo }) => {
        addWorkflowChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: workflow only fallback',
          triggerBranch: 'main',
        });

        assert.strictEqual(outputs.prUrl, '');
        assert.strictEqual(outputs.prNumber, '');
        assert.strictEqual(outputs.prBranch, undefined);
        assert.strictEqual(remoteBranchExists(repo, 'poosh/main'), false);
        run('git fetch origin main', repo);
        const remoteWorkflowFiles = output(
          'git ls-tree -r --name-only origin/main -- .github/workflows',
          repo
        );
        assert.strictEqual(remoteWorkflowFiles, '');
      }),
  ],
  [
    'testPrBranchWithSlashNotPrefixed',
    () =>
      withRepo({ rejectBranch: 'blocked' }, ({ repo }) => {
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: slash branch',
          triggerBranch: 'blocked',
          prBranch: 'feature/custom',
          prBase: 'main',
        });

        assert.strictEqual(outputs.prBranch, 'feature/custom');
        assert.ok(remoteBranchExists(repo, 'feature/custom'));
        assert.strictEqual(remoteBranchExists(repo, 'poosh/feature/custom'), false);
      }),
  ],
];

module.exports = {
  buildWorkflowFallbackTests,
  buildWorkflowFallbackEdgeTests,
};
