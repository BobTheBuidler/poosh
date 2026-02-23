const assert = require('assert');

const { withRepo, remoteBranchExists } = require('../shared/repo-fixture');
const { runPoosh, addFileChange } = require('../shared/poosh-sim');

const buildCoreFlowTests = () => [
  [
    'testNoChanges',
    () =>
      withRepo({}, ({ repo }) => {
        const outputs = runPoosh(repo, {
          commitMessage: 'test: no changes',
          triggerBranch: 'main',
        });

        assert.strictEqual(outputs.triggerBranch, 'main');
        assert.strictEqual(outputs.commitSha, '');
        assert.strictEqual(outputs.prUrl, '');
      }),
  ],
  [
    'testPushSuccess',
    () =>
      withRepo({}, ({ repo }) => {
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: push success',
          triggerBranch: 'main',
        });

        assert.ok(outputs.commitSha);
        assert.strictEqual(outputs.prUrl, '');
      }),
  ],
  [
    'testPushFailureCreatesPr',
    () =>
      withRepo({ rejectBranch: 'blocked' }, ({ repo }) => {
        addFileChange(repo);
        const outputs = runPoosh(repo, {
          commitMessage: 'test: pr fallback',
          triggerBranch: 'blocked',
          prBranch: 'custom',
          prBase: 'main',
          triggerPrNumber: '123',
        });

        assert.ok(outputs.commitSha);
        assert.ok(outputs.prUrl);
        assert.strictEqual(outputs.prBase, 'main');
        assert.strictEqual(outputs.prBranch, 'poosh/custom');
        assert.ok(outputs.prBody.includes('[Triggered by PR #123]'));
        assert.ok(outputs.prBody.includes('/pull/123'));
        assert.ok(remoteBranchExists(repo, outputs.prBranch));
      }),
  ],
];

module.exports = {
  buildCoreFlowTests,
};
