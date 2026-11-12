# Session Guard

- Keep the client/server/shared boundaries intact. The server bundle must compile without node_modules; borrow the host daemon client at runtime, as paseo-defer does.
- State lives at `$PASEO_HOME/plugin-data/session-guard`; schema versions and confirmed waiting work must survive upgrades.
- Read provider credentials only through Paseo's usage RPC. Do not log transcripts, continuation bodies, passwords, or raw daemon errors.
- Preserve explicit session overrides when the host default changes. Turning protection off cancels that session's pending continuation.
- Never restart the user's daemon. Host integration tests use an isolated home and port, and must not send into real conversations.
- Run `npm run verify` and `npm pack --dry-run` for runtime changes. Keep the zero-dependency compilation and subprocess-cleanup checks meaningful.
- UI extends Paseo's composer/settings system; use its named components and theme values.

## Automated npm releases

- The public install command is `paseo plugin install paseo-session-guard`. Keep it in the README and keep Other plugins as its final section.
- Update package.json and package-lock.json together for a release. Tag the exact clean main commit as vX.Y.Z and push the tag.
- .github/workflows/publish-npm.yml validates the tag, runs verification and package inspection, and publishes with npm Trusted Publishing through GitHub OIDC. Do not publish manually.
- Keep npm publisher permissions scoped to tomgrin10/paseo-session-guard and publish-npm.yml. No long-lived npm token is needed in GitHub.
- Wait for the workflow and registry integrity check before updating an installed copy; the workflow creates the GitHub release. Test the bare package-name installer in an isolated Paseo home; never restart the user's daemon.

## Release notes and channels

Publishing runs paseo-plugin-kit's reusable workflow (`.github/workflows/publish-npm.yml` calls `tomgrin10/paseo-plugin-kit/.github/workflows/publish-npm.yml@vX`). It uses the `paseo-kit` bin from the `paseo-plugin-kit` devDependency. Bump the workflow tag and the devDependency together.

- **Channels.** A version with a prerelease part (`X.Y.Z-beta.N`, `-rc.N`) publishes to npm's `beta` dist-tag and is a GitHub prerelease. A stable version publishes to `latest`. After publishing, on the retry path too, `paseo-kit check-dist-tag` fails the run if the dist-tag is wrong or a prerelease is `latest`.
- **Betas** get generated notes: the titles of the PRs merged since the previous tag, grouped `feat` → New, `fix` → Fixed, anything else user-visible → Improved. `docs`, `chore`, `ci`, `test`, `refactor` and `build` PRs, bots and merge lines are dropped. So write PR titles as a sentence a user can read.
- **Stable and rc** need curated notes: add `release-notes/<version>.md` (an rc uses its final version's file) before tagging. Start with one summary sentence, then `### New`, `### Improved` and `### Fixed` with plain-words bullets, omitting empty groups. `paseo-kit release-notes --check <tag>` fails such a tag before anything is published.
- The workflow creates the GitHub release, or updates an existing one, with that body. Preview it with `npx paseo-kit release-notes <tag>`.

- Server SDK API types must come through `PluginHandlerContext` from `@getpaseo/plugin/server`. Direct type imports from `@getpaseo/client` are rejected by the host compiler when installing an npm package without development dependencies.
- `scripts/check-package-install.mjs` packs the actual artifact, serves it through an isolated loopback npm fixture, and installs its bare package name in a fresh Paseo daemon. Keep this check in verification and install the pinned Paseo CLI in CI.
