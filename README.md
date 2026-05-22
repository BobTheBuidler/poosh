# Poosh

A composite GitHub Action to commit, push, or open a pull request for any changes in the repository. Use this action after your workflow has made changes to files.

## Features

- Commits and pushes changes to a user-configurable branch (the branch where changes were made)
- On push events, pushes directly to the branch
- If direct push is not possible, opens or updates a pull request from a configurable or default branch (see `pr-branch` and `pr-branch-strategy`)
- PR title is always set to the commit message
- PR branch is always deleted after merge/close (`delete-branch: true`)
- Robust input validation and clear warnings
- If workflow files are modified without `workflows` permission, Poosh skips those files and continues with the same PR branch strategy for the remaining changes (or no-ops if only workflow changes)
- Outputs target branch name, commit SHA, PR URL, and PR number

## Release Safety

Releases are immutable. Published tags and artifacts are never modified or replaced, providing assurance of user safety.

## Inputs

| Name               | Description                                                                                                    | Required | Default                |
|--------------------|----------------------------------------------------------------------------------------------------------------|----------|------------------------|
| `commit-message`   | Commit message to use when committing changes.                                                                 | Yes      |                        |
| `trigger-branch`   | The branch where changes were made and where the action will attempt to push directly.                         | Yes      |                        |
| `direct-push`      | Whether to attempt a direct push to `trigger-branch` before using the PR branch fallback.                     | No       | `true`                 |
| `pr-branch`        | The branch to create or update if a PR is needed. If not provided, defaults to `poosh/{trigger-branch}`. If provided and does not contain `/`, it will be prefixed with `poosh/`. | No       | `poosh/{trigger-branch}` |
| `pr-branch-strategy` | Existing PR branch strategy: `update` uses `--force-with-lease`, `unique` creates a suffixed branch, and `fail` errors if the target branch already exists. | No | `update` |
| `pr-base`          | The base branch to target if a PR is needed. Defaults to `trigger-branch`.                                  | No       | `trigger-branch`        |
| `trigger-pr-number`| PR number of the triggering PR (for PR body).                                                                 | No       |                        |

## Outputs

| Name            | Description                                                        |
|-----------------|--------------------------------------------------------------------|
| `trigger-branch`| The branch that was pushed to or targeted by the PR.               |
| `commit-sha`    | The commit SHA of the pushed commit (if a commit was made).        |
| `pr-url`        | The URL of the created pull request (if a PR was opened).          |
| `pr-number`     | The number of the created pull request (if a PR was opened).       |

## Usage

### Push changes (on push event)

```yaml
- uses: ./actions/poosh
  with:
    commit-message: "chore: update generated files"
    trigger-branch: "autogen"
```

### Open or update a pull request (protected branch, with default PR branch)

```yaml
- uses: ./actions/poosh
  with:
    commit-message: "chore: update"
    trigger-branch: "main"
    direct-push: false
    # pr-branch is omitted, so Poosh will update poosh/main with --force-with-lease.
```

### Open a pull request (with custom PR branch)

```yaml
- uses: ./actions/poosh
  with:
    commit-message: "chore: update"
    trigger-branch: "feature-update"
    pr-branch: "poosh/artifacts-1234"
    pr-branch-strategy: update
    trigger-pr-number: ${{ github.event.pull_request.number }}
```

### Preserve every generated branch instead of updating one branch

```yaml
- uses: ./actions/poosh
  with:
    commit-message: "chore: update"
    trigger-branch: "feature-update"
    pr-branch: "artifacts"
    pr-branch-strategy: unique
```

### Open a pull request targeting a different base branch (fork PR fallback)

```yaml
- uses: ./actions/poosh
  with:
    commit-message: "chore: update"
    trigger-branch: "feature-update"
    pr-base: "main"
    trigger-pr-number: ${{ github.event.pull_request.number }}
```

## Validation & Warnings

- Fails if `commit-message` or `trigger-branch` is missing or invalid.
- Fails if `direct-push` is not `true` or `false`.
- Fails if `pr-branch` is provided but invalid.
- Fails if `pr-branch-strategy` is not one of `update`, `unique`, or `fail`.
- Warns if `trigger-pr-number` is not set (PR body will not include a trigger reference).
- Only allows alphanumeric, `.`, `_`, `-`, and `/` in branch names.

## Outputs

- `trigger-branch`: The branch that was pushed to or targeted by the PR.
- `commit-sha`: The commit SHA (if a commit was made)
- `pr-url`: The pull request URL (if a PR was opened)
- `pr-number`: The pull request number (if a PR was opened)

## How It Works

1. Validates all inputs and combinations, failing early with clear errors.
2. If changes are detected:
   - Commits the changes.
   - If `direct-push: true`, attempts to push to `trigger-branch`.
   - If direct push is disabled or fails, publishes a PR branch using `pr-branch-strategy`.
   - `update` fetches an existing PR branch and pushes with `--force-with-lease`, retrying boundedly on lease races.
   - `unique` creates a suffixed branch when the PR branch already exists.
   - `fail` fails clearly when the PR branch already exists.
   - PR title is always the commit message.
   - PR branch is always deleted after merge/close.
   - PR body includes the triggering branch and PR number if provided.
3. Sets outputs for target branch, commit SHA, PR URL, and PR number.

## License

MIT
