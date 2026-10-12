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
- Wait for the workflow and registry integrity check before creating a GitHub release or updating an installed copy. Test the bare package-name installer in an isolated Paseo home; never restart the user's daemon.

- Server SDK API types must come through `PluginHandlerContext` from `@getpaseo/plugin/server`. Direct type imports from `@getpaseo/client` are rejected by the host compiler when installing an npm package without development dependencies.
- `scripts/check-package-install.mjs` packs the actual artifact, serves it through an isolated loopback npm fixture, and installs its bare package name in a fresh Paseo daemon. Keep this check in verification and install the pinned Paseo CLI in CI.
