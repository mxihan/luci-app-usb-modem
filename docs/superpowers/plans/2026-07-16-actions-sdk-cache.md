# Actions SDK Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse each GitHub Actions matrix target's prepared SDK so repeat IPK builds skip SDK download, extraction, and feed installation.

**Architecture:** Restore an exact per-SDK cache immediately after checkout. On a miss, run the existing verified SDK preparation path and save the `sdk` directory before building; on a hit, build directly from the restored directory.

**Tech Stack:** GitHub Actions YAML, `actions/cache` v4, POSIX shell contract tests.

---

### Task 1: Add a failing workflow cache contract

**Files:**
- Modify: `tests/test-package-contract.sh`
- Test: `tests/test-package-contract.sh`

- [ ] **Step 1: Write the failing test**

Add exact source checks for split cache restore/save actions, a cache key based
on `${{ runner.os }}` and `${{ matrix.sdk }}`, the `sdk` cache path, and
cache-miss conditions:

```sh
grep -Fq 'uses: actions/cache/restore@v4' "$WORKFLOW"
grep -Fq 'uses: actions/cache/save@v4' "$WORKFLOW"
grep -Fq 'key: sdk-${{ runner.os }}-${{ matrix.sdk }}-feeds-v1' "$WORKFLOW"
grep -Fq 'path: sdk' "$WORKFLOW"
grep -Fq "steps.sdk-cache.outputs.cache-hit != 'true'" "$WORKFLOW"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `sh tests/test-package-contract.sh`

Expected: exit 1 because the workflow does not yet contain cache restore/save
steps.

### Task 2: Cache the prepared SDK

**Files:**
- Modify: `.github/workflows/build-ipk.yml`
- Test: `tests/test-package-contract.sh`

- [ ] **Step 1: Add cache restore before SDK preparation**

Add:

```yaml
      - name: Restore prepared SDK
        id: sdk-cache
        uses: actions/cache/restore@v4
        with:
          path: sdk
          key: sdk-${{ runner.os }}-${{ matrix.sdk }}-feeds-v1
```

- [ ] **Step 2: Condition preparation on a cache miss**

Add this condition to archive-tool installation, SDK download/extraction, and
feed preparation:

```yaml
        if: steps.sdk-cache.outputs.cache-hit != 'true'
```

- [ ] **Step 3: Save the prepared SDK before building**

Add after feed preparation:

```yaml
      - name: Save prepared SDK
        if: steps.sdk-cache.outputs.cache-hit != 'true'
        uses: actions/cache/save@v4
        with:
          path: sdk
          key: sdk-${{ runner.os }}-${{ matrix.sdk }}-feeds-v1
```

- [ ] **Step 4: Run the focused test**

Run: `sh tests/test-package-contract.sh`

Expected: `package contract tests passed`.

### Task 3: Verify and publish all changes

**Files:**
- Verify: `.github/workflows/build-ipk.yml`
- Verify: `.gitattributes`
- Verify: `htdocs/luci-static/resources/view/usbmodem/status.js`
- Verify: `root/usr/bin/usbmodem-status`
- Verify: `root/usr/bin/usbmodem-restart`
- Verify: `tests/test-package-contract.sh`

- [ ] **Step 1: Run the complete local suite**

Run:

```sh
sh tests/test-status.sh
sh tests/test-restart.sh
node tests/test-status-view.js
sh tests/test-package-contract.sh
sh tests/test-build-ipk.sh
git diff --check
```

Expected: all five test groups pass and `git diff --check` reports no errors.

- [ ] **Step 2: Inspect and stage only intended changes**

Run:

```sh
git status -sb
git diff
git add .gitattributes .github/workflows/build-ipk.yml \
  htdocs/luci-static/resources/view/usbmodem/status.js \
  root/usr/bin/usbmodem-status root/usr/bin/usbmodem-restart \
  tests/test-package-contract.sh \
  docs/superpowers/plans/2026-07-16-actions-sdk-cache.md
git diff --cached --check
git diff --cached --stat
```

Expected: only the frontend dependency fix, LF enforcement/regression test,
workflow cache optimization, and this implementation plan are staged.

- [ ] **Step 3: Commit and push**

Run:

```sh
git commit -m "ci: cache prepared SDK builds"
git push origin main
```

Expected: the commit succeeds and `origin/main` advances to the new commit.

- [ ] **Step 4: Verify the remote workflow starts**

Run: `gh run list --workflow "Build IPK" --branch main --limit 1`

Expected: a run for the pushed commit is queued, in progress, or completed.
