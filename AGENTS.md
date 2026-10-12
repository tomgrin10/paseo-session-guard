# Session Guard

- Keep the client/server/shared boundaries intact. The server bundle must compile without node_modules; borrow the host daemon client at runtime, as paseo-defer does.
- State lives at `$PASEO_HOME/plugin-data/session-guard`; schema versions and confirmed waiting work must survive upgrades.
- Read provider credentials only through Paseo's usage RPC. Do not log transcripts, continuation bodies, passwords, or raw daemon errors.
- Preserve explicit session overrides when the host default changes. Turning protection off cancels that session's pending continuation.
- Never restart the user's daemon. Host integration tests use an isolated home and port, and must not send into real conversations.
- Run `npm run verify` and `npm pack --dry-run` for runtime changes. Keep the zero-dependency compilation and subprocess-cleanup checks meaningful.
- UI extends Paseo's composer/settings system; use its named components and theme values.
