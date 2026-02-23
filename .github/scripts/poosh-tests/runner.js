const { buildCoreFlowTests } = require('./suites/core-flow');
const {
  buildWorkflowFallbackTests,
  buildWorkflowFallbackEdgeTests,
} = require('./suites/workflow-fallback');
const { buildValidationTests } = require('./suites/validation');
const { buildActionStepTests } = require('./suites/action-step');

const runTest = (name, fn) => {
  try {
    fn();
  } catch (error) {
    error.message = `${name} failed: ${error.message}`;
    throw error;
  }
};

const tests = [
  ...buildCoreFlowTests(),
  ...buildWorkflowFallbackTests(),
  ...buildValidationTests(),
  ...buildWorkflowFallbackEdgeTests(),
  ...buildActionStepTests(),
];

const main = () => {
  for (const [name, fn] of tests) {
    runTest(name, fn);
  }

  console.log('All tests passed.');
};

module.exports = {
  runTest,
  tests,
  main,
};
