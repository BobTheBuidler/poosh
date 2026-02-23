const assert = require('assert');

const { withRepo } = require('../shared/repo-fixture');
const { runPoosh, assertActionStepFails } = require('../shared/poosh-sim');

const buildValidationTests = () => [
  [
    'testInvalidTriggerBranch',
    () => {
      assert.throws(
        () =>
          withRepo({}, ({ repo }) =>
            runPoosh(repo, {
              commitMessage: 'test: invalid branch',
              triggerBranch: 'bad^branch',
            })
          ),
        /trigger-branch/
      );
    },
  ],
  [
    'testInvalidCommitMessage',
    () => {
      assertActionStepFails({
        stepName: "Validate 'commit-message'",
        inputs: { 'commit-message': '   ' },
        pattern: /'commit-message' is required and must be a non-empty string/,
      });
    },
  ],
  [
    'testInvalidTriggerBranchWhitespace',
    () => {
      assertActionStepFails({
        stepName: "Validate 'trigger-branch'",
        inputs: { 'trigger-branch': ' \t ' },
        pattern: /'trigger-branch' is required and must be a non-empty string/,
      });
    },
  ],
  [
    'testInvalidPrBranch',
    () => {
      assertActionStepFails({
        stepName: "Validate 'pr-branch'",
        inputs: { 'pr-branch': 'bad^branch' },
        pattern: /'pr-branch' contains invalid characters/,
      });
    },
  ],
  [
    'testInvalidPrBase',
    () => {
      assertActionStepFails({
        stepName: "Validate 'pr-base'",
        inputs: { 'pr-base': 'bad^base' },
        pattern: /'pr-base' contains invalid characters/,
      });
    },
  ],
];

module.exports = {
  buildValidationTests,
};
