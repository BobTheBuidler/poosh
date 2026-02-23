const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ACTION_YAML,
  DEFAULT_PR_BODY,
} = require('./constants');

const dedentBlock = (block) => {
  const lines = block.replace(/\n$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => (line.match(/^\s*/) || [''])[0].length);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(minIndent)).join('\n');
};

const extractActionStepScript = (stepName) => {
  const lines = ACTION_YAML.split('\n');
  const nameLine = `- name: ${stepName}`;
  const stepStart = lines.findIndex((line) => line.trim() === nameLine);
  if (stepStart === -1) {
    throw new Error(`Unable to locate step '${stepName}' in action.yml`);
  }

  let runLine = -1;
  for (let idx = stepStart + 1; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (trimmed.startsWith('- name: ')) {
      break;
    }
    if (trimmed === 'run: |') {
      runLine = idx;
      break;
    }
  }
  if (runLine === -1) {
    throw new Error(`Step '${stepName}' does not contain a run block`);
  }

  const blockLines = [];
  for (let idx = runLine + 1; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (trimmed.startsWith('shell:')) {
      break;
    }
    blockLines.push(lines[idx]);
  }
  if (blockLines.length === 0) {
    throw new Error(`Step '${stepName}' has an empty run block`);
  }

  return dedentBlock(blockLines.join('\n'));
};

const extractBashFunction = (script, fnName) => {
  const lines = script.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${fnName}() {`);
  if (start === -1) {
    throw new Error(`Function '${fnName}' not found in script`);
  }

  let end = -1;
  for (let idx = start + 1; idx < lines.length; idx += 1) {
    if (lines[idx].trim() === '}') {
      end = idx;
      break;
    }
  }
  if (end === -1) {
    throw new Error(`Function '${fnName}' has no closing brace`);
  }

  return lines.slice(start, end + 1).join('\n');
};

const resolveActionExpression = (expr, context) => {
  const trimmed = expr.trim();
  if (trimmed.startsWith('inputs.')) {
    const key = trimmed.slice('inputs.'.length);
    return context.inputs?.[key] ?? '';
  }

  const stepMatch = trimmed.match(/^steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9._-]+)$/);
  if (stepMatch) {
    const [, stepId, outputKey] = stepMatch;
    return context.steps?.[stepId]?.outputs?.[outputKey] ?? '';
  }

  return '';
};

const renderActionScript = (script, context) =>
  script.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) =>
    String(resolveActionExpression(expr, context))
  );

const parseGithubOutput = (outputPath) => {
  if (!fs.existsSync(outputPath)) {
    return {};
  }

  const lines = fs.readFileSync(outputPath, 'utf8').split('\n');
  const outputs = {};

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!line) {
      continue;
    }

    const heredocMatch = line.match(/^([^=]+)<<(\S+)$/);
    if (heredocMatch) {
      const [, key, delimiter] = heredocMatch;
      const body = [];
      idx += 1;
      while (idx < lines.length && lines[idx] !== delimiter) {
        body.push(lines[idx]);
        idx += 1;
      }
      outputs[key] = body.join('\n');
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex);
    const value = line.slice(eqIndex + 1);
    outputs[key] = value;
  }

  return outputs;
};

const runActionStep = ({ stepName, context = {}, cwd = process.cwd(), env = {} }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poosh-action-step-'));
  const scriptPath = path.join(tempDir, 'step.sh');
  const outputPath = path.join(tempDir, 'github_output.txt');
  fs.writeFileSync(outputPath, '');

  const renderedScript = renderActionScript(extractActionStepScript(stepName), context);
  fs.writeFileSync(scriptPath, `${renderedScript}\n`);
  fs.chmodSync(scriptPath, 0o755);

  let ok = true;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execSync(`bash "${scriptPath}"`, {
      cwd,
      env: { ...process.env, ...env, GITHUB_OUTPUT: outputPath },
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (error) {
    ok = false;
    stdout = error.stdout ? error.stdout.toString() : '';
    stderr = error.stderr ? error.stderr.toString() : '';
  }

  const outputs = parseGithubOutput(outputPath);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    ok,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    outputs,
  };
};

const defaultActionInputs = (overrides = {}) => ({
  'commit-message': 'test: local harness',
  'trigger-branch': 'main',
  'pr-branch': '',
  'pr-base': '',
  'trigger-pr-number': '',
  'pr-body': DEFAULT_PR_BODY,
  ...overrides,
});

const toActionInputs = (inputs = {}) =>
  defaultActionInputs({
    'commit-message': inputs.commitMessage || '',
    'trigger-branch': inputs.triggerBranch || '',
    'pr-branch': inputs.prBranch || '',
    'pr-base': inputs.prBase || '',
    'trigger-pr-number': inputs.triggerPrNumber || '',
    'pr-body': inputs.prBody || DEFAULT_PR_BODY,
  });

const ensureActionStepSuccess = (stepName, context, options = {}) => {
  const result = runActionStep({
    stepName,
    context,
    cwd: options.cwd || process.cwd(),
    env: options.env || {},
  });
  if (!result.ok) {
    const message = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(message || `${stepName} failed`);
  }
  return result.outputs;
};

module.exports = {
  dedentBlock,
  extractActionStepScript,
  extractBashFunction,
  resolveActionExpression,
  renderActionScript,
  parseGithubOutput,
  runActionStep,
  defaultActionInputs,
  toActionInputs,
  ensureActionStepSuccess,
};
