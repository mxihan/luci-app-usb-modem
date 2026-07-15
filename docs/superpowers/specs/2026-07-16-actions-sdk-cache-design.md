# Actions SDK Cache Design

## Goal

Reduce repeat GitHub Actions build time by reusing each matrix target's fully
prepared OpenWrt or ImmortalWrt SDK, including installed package feeds.

## Approach

Use separate `actions/cache/restore@v4` and `actions/cache/save@v4` steps. The
restore step runs immediately after checkout. On a cache miss, the existing SDK
download, checksum verification, extraction, and feed preparation steps run.
The save step then stores the prepared `sdk` directory before the package build
starts. On a cache hit, all preparation steps are skipped and the existing
build helper runs directly against the restored SDK.

Keeping restore and save separate prevents package staging, compiled IPKs, and
other build outputs from being captured at job shutdown.

## Cache Identity

Each matrix entry uses an exact cache key containing:

- the runner operating system;
- the complete SDK archive filename, which includes distribution, release,
  target, compiler, and libc versions;
- an explicit cache format generation such as `feeds-v1`.

The key deliberately excludes repository source hashes so ordinary application
changes reuse the prepared SDK. There are no broad restore keys: an SDK version
change must produce a cache miss instead of restoring a potentially
incompatible SDK.

## Workflow Behavior

On a cache miss:

1. Install the archive tool required by the selected SDK.
2. Download and verify the SDK archive and checksum file.
3. Extract the SDK into `${{ github.workspace }}/sdk`.
4. Run `./scripts/feeds update -a` and `./scripts/feeds install -a`.
5. Save the prepared SDK under the exact matrix cache key.
6. Build and upload the IPK as today.

On a cache hit, steps 1 through 5 are skipped. `scripts/build-ipk.sh` still
replaces the package staging directory and removes prior matching artifacts, so
cached SDK state cannot cause a stale project IPK to be uploaded.

## Failure Handling

A cache miss falls back to the existing verified preparation path. Cache save
failure does not change package correctness because the current job already has
a prepared SDK. An incompatible SDK is prevented by the exact archive-based
key; intentional cache layout changes require incrementing the format
generation.

## Verification

Extend the package contract test to assert that the workflow:

- restores and saves the `sdk` directory with Actions cache v4;
- uses the matrix SDK filename in an isolated cache key;
- conditions SDK preparation and cache saving on a cache miss;
- retains checksum verification and full feed installation.

Run all helper, view, package contract, and build-script tests before pushing.
The first remote workflow run is expected to populate the caches; later runs
with unchanged SDK matrix entries should report cache hits and skip preparation.
