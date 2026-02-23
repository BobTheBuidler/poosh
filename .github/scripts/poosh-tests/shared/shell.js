const { execSync } = require('child_process');

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe' });
const output = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

const runWithOutput = (cmd, cwd) => {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: (stdout || '').trim() };
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    return { ok: false, output: `${stdout}\n${stderr}`.trim() };
  }
};

const hasStagedChanges = (repo) => {
  try {
    execSync('git diff --cached --quiet', { cwd: repo, stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
};

module.exports = {
  run,
  output,
  runWithOutput,
  hasStagedChanges,
};
