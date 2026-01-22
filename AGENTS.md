# Agent Requirements

All agents must follow these rules:

1) Fully test your changes before submitting a PR (run the full suite or all relevant tests).
2) PR titles must be descriptive and follow Conventional Commits-style prefixes:
   - Common: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`
   - Support titles: `fix(docs):`, `fix(benchmarks):`, `fix(cicd):`
3) Commit messages must follow the same Conventional Commits-style prefixes and include a short functional description plus a user-facing value proposition.
4) PR descriptions must include Summary, Rationale, and Details sections.
5) If the branch you're assigned to work on is from a remote (ie origin/master or upstream/awesome-feature), fetch first and sync your local branch with the remote before you start (eg `git fetch --prune` then `git pull --ff-only` or `git rebase <remote>/<branch>`).
6) If git fetch/pull via SSH fails (for example, host key verification), prefer switching the remote to HTTPS for public repos or ask the user to configure SSH; do not disable host key verification.
7) When conflicts arise, always provide your best-guess resolution based on the conflict content itself, even if additional confirmation is needed.

Reference: https://www.conventionalcommits.org/en/v1.0.0/
