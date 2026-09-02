# Downstream maintenance policy

This repository is the Workbench-owned downstream of
[`nicobailon/pi-web-access`](https://github.com/nicobailon/pi-web-access).
It provides a reviewed, reversible release lane while keeping web-access close
to its active upstream.

## Provenance

| Item | Value |
| --- | --- |
| Upstream | `https://github.com/nicobailon/pi-web-access.git` |
| Upstream license | MIT (`LICENSE`) |
| Upstream default branch | `main` |
| Downstream owner | `h1057399903-web` |
| Downstream integration branch | `main` |
| Downstream release/default branch | `stable` |
| Bootstrap base | `8f11a0a94988093b0ea5d725d18e8dcabacd2373` (`v0.27.0`) |
| Last synced upstream commit | `711cc41313202e277a248b1cc45942b6dc8927f7` (post-`v0.27.0`) |

## Intentional downstream changes

Downstream-only files stay separate from upstream implementation code:

- `UPSTREAM.md` records provenance, synchronization, release, and rollback
  policy.
- `.github/workflows/downstream-compat.yml` runs the upstream checks on Linux
  and the manually dispatched disposable distribution test.
- `downstream/compatibility.json` declares the package entry point and expected
  Pi tool and command surfaces for Workbench's shared exact-SHA gate.
- `downstream/verify-distribution.mjs` exercises fresh install, update,
  commit-pinned rollback, and return to the stable lane in an isolated Pi home.
- `test/chrome-cookie-extraction.test.mjs` makes the password-retry assertion
  platform-aware. On Linux, a failed `secret-tool` lookup intentionally falls
  back to Chromium's `peanuts` password and can decrypt on the first attempt;
  macOS returns `null`. This is test-only and should be removed when upstream
  adopts an equivalent platform-aware assertion.

Do not carry implementation patches without recording their purpose, upstream
issue or PR, and removal condition in this section.

## Branch and consumer contract

- `main` receives reviewed upstream synchronization PRs.
- `stable` is the default branch and moves only to an exact reviewed `main`
  commit after all required checks and a compatibility review pass.
- Routine users install the unqualified owned source:

  ```sh
  pi install git:github.com/h1057399903-web/pi-web-access
  ```

  With no ref, `pi update --extensions` follows the repository's default
  `stable` branch.
- A full commit ref is a hard pin used for rollback:

  ```sh
  pi install git:github.com/h1057399903-web/pi-web-access@<reviewed-commit>
  ```

  Pi reconciles pinned refs but does not advance them during
  `pi update --extensions`. Reinstall the unqualified source to rejoin the
  moving stable lane.

## Synchronizing upstream

For each selected upstream release or commit:

1. Fetch upstream and identify the exact old and new upstream SHAs.
2. Create `sync/upstream-<version-or-date>` from downstream `main`.
3. Merge the selected upstream commit without squashing, preserving ancestry.
4. Update **Last synced upstream commit** above.
5. Record the upstream range, release notes, conflicts, audit findings,
   compatibility result, and rollback SHA in the PR.
6. Run `npm ci`, `npm run typecheck`, `npm test`,
   `npm run audit:runtime`, and `npm pack --dry-run` on Linux.
7. Run the private Workbench shared gate against the exact sync head.
8. Obtain review, merge into `main`, then promote that exact accepted commit to
   `stable` and rerun the stable/disposable workflow.

Example:

```sh
git fetch upstream main --tags
git fetch downstream main stable
git switch -c sync/upstream-vX.Y.Z downstream/main
git merge --no-ff <upstream-sha>
# update this file, run checks, push, and open a PR targeting main
```

## Compatibility baseline

The bootstrap baseline is:

- web-access `v0.27.0` / `8f11a0a94988093b0ea5d725d18e8dcabacd2373`;
- Workbench `6db875a7ed443da4cb16655c18b891c3786e7392`;
- Pi `0.84.4`;
- CI runtimes Node.js `22.19.0` and `24`.

Workbench's shared compatibility runner checks the exact downstream SHA, loads
both extension entry points in an isolated Pi process, requires web-access's
four tools and four commands, and then verifies that Workbench still starts
without this optional package. `PI_OFFLINE=1` suppresses Pi-managed network
activity for this check, but it is not a network sandbox and does not prevent
extension code or child processes from opening network connections.

Linux CI is authoritative for the upstream suite. The current Windows host
cannot create the symlinks used by some tests and CRLF checkouts invalidate
source-text assertions; those environment-specific failures are not patched in
upstream code.

## Rollback

Preferred rollback is non-destructive:

1. Identify the last known-good promoted commit.
2. Pin affected users immediately with the full-commit command above.
3. Revert the bad synchronization or downstream patch on `main` through a PR.
4. Promote the reviewed revert commit to `stable` after checks pass.
5. Reinstall the unqualified source and run `pi update --extensions` to return
   users to the moving lane.

If `stable` must move back before a revert PR lands, an owner may reset it to
the last known-good reviewed commit with `--force-with-lease`. Record the
incident and exact old/new SHAs in the tracking issue.
