const assert = require('assert');

const {
  runActionStep,
  defaultActionInputs,
} = require('../shared/action-step');
const {
  runResolveBaseShaShallowRecovery,
} = require('../shared/poosh-sim');

const buildActionStepTests = () => [
  [
    'testComposePrBodyWithTriggerPrNumber',
    () => {
      const result = runActionStep({
        stepName: 'Compose PR body',
        context: {
          inputs: defaultActionInputs({
            'trigger-branch': 'main',
            'trigger-pr-number': '42',
          }),
        },
        env: {
          GITHUB_REPOSITORY: 'owner/repo',
        },
      });

      assert.strictEqual(result.ok, true);
      assert.ok(
        result.outputs.body.includes(
          '[Triggered by PR #42](https://github.com/owner/repo/pull/42)'
        )
      );
      assert.strictEqual(result.outputs.body.includes('Triggered by recent changes on branch'), false);
    },
  ],
  [
    'testComposePrBodyWithoutTriggerPrNumber',
    () => {
      const result = runActionStep({
        stepName: 'Compose PR body',
        context: {
          inputs: defaultActionInputs({
            'trigger-branch': 'feature/xyz',
            'trigger-pr-number': '',
          }),
        },
        env: {
          GITHUB_REPOSITORY: 'owner/repo',
        },
      });

      assert.strictEqual(result.ok, true);
      assert.ok(result.outputs.body.includes('Triggered by recent changes on branch `feature/xyz`'));
      assert.ok(result.outputs.body.includes('https://github.com/owner/repo/tree/feature/xyz'));
      assert.strictEqual(result.outputs.body.includes('Triggered by PR #'), false);
    },
  ],
  [
    'testSetOutputsWiring',
    () => {
      const fullResult = runActionStep({
        stepName: 'Set outputs',
        context: {
          inputs: defaultActionInputs({ 'trigger-branch': 'release/main' }),
          steps: {
            commit_changes: {
              outputs: {
                'commit-sha': 'abc123',
              },
            },
            create_pr: {
              outputs: {
                'pull-request-url': 'https://example.test/pr/1',
                'pull-request-number': '1',
              },
            },
          },
        },
      });
      assert.strictEqual(fullResult.ok, true);
      assert.strictEqual(fullResult.outputs['trigger-branch'], 'release/main');
      assert.strictEqual(fullResult.outputs['commit-sha'], 'abc123');
      assert.strictEqual(fullResult.outputs['pr-url'], 'https://example.test/pr/1');
      assert.strictEqual(fullResult.outputs['pr-number'], '1');

      const minimalResult = runActionStep({
        stepName: 'Set outputs',
        context: {
          inputs: defaultActionInputs({ 'trigger-branch': 'release/main' }),
          steps: {
            commit_changes: {
              outputs: {
                'commit-sha': '',
              },
            },
            create_pr: {
              outputs: {
                'pull-request-url': '',
                'pull-request-number': '',
              },
            },
          },
        },
      });
      assert.strictEqual(minimalResult.ok, true);
      assert.strictEqual(minimalResult.outputs['trigger-branch'], 'release/main');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(minimalResult.outputs, 'commit-sha'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(minimalResult.outputs, 'pr-url'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(minimalResult.outputs, 'pr-number'), false);
    },
  ],
  [
    'testResolveBaseShaShallowRecovery',
    () => {
      runResolveBaseShaShallowRecovery();
    },
  ],
];

module.exports = {
  buildActionStepTests,
};
