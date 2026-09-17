# Archer Nakodil — GitHub workflow

GitHub follows the project lifecycle instead of replacing it.

## Canonical rule

`main` is the last version that the user has explicitly confirmed as installed and working (BASE).
A READY build is **not** BASE until that confirmation exists.

During the current migration, `REPOSITORY-STATUS.json` has `source_sync: pending`; therefore GitHub must not be treated as the production source yet.

## Task lifecycle

1. ОКО creates/records a task and Task ID.
2. The profile developer creates a branch from current `main`:
   - `portal/<TASK-ID>`
   - `game/<TASK-ID>`
   - `crec/<TASK-ID>`
   - `3d/<TASK-ID>`
   - `infra/<TASK-ID>`
3. The developer changes only the component allowed by the task.
4. A pull request to `main` is opened and kept unmerged while the result is READY only.
5. GitHub Actions performs self-checks. After the repository BASE sync is complete, CI also builds an `UPDATE.zip` from the PR diff.
6. The user installs/tests the UPDATE.
7. Only after the user confirms that the update is installed and works, the PR is squash-merged into `main`.
8. The merged commit becomes the new GitHub representation of BASE.

## Parallel work

Every task branch starts from the BASE recorded when the task was issued. If `main` moves before another task is confirmed, that PR must be updated/rebased and retested before it can become BASE.

## Pull requests

Each PR must include:
- Task ID;
- component;
- BASE version;
- target version;
- exact scope;
- tests performed;
- generated UPDATE artifact when enabled;
- confirmation status from the user.

Direct feature commits to `main` are not part of the workflow.

## Deployment

Production auto-deploy on push is disabled. `.github/workflows/deploy.yml` is manual and also blocked by `REPOSITORY-STATUS.json` until `production_deploy_enabled` is explicitly set to `true` after repository synchronization and server-secret verification.

Heavy deployment assets (downloadable ZIP/EXE files and the large CREC catalog image set) may remain outside normal Git history and be supplied as release/deployment assets.
