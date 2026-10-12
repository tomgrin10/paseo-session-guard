# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Paseo users running coding agents who want ongoing work to wait through their provider's session usage reset.

## Product Purpose

Stop active work at the session quota and continue the same conversation automatically after reset, with minimal intervention.

## Operating Context

A Paseo daemon plugin, with controls extending Paseo's existing React Native settings screens and composer pills. The user requested reuse of paseo-defer code.

## Capabilities and Constraints

The user chose protection for all running sessions by default, requested session opt-outs through a pill, and requested that the default be configurable. Native subagents must also be covered. On Linux, Claude and Codex provider processes and their nested workers pause and resume together; native workers inherit their parent session's override. Other providers use interruption and message continuation. The background governor and waiting state must work without the app open. Paseo's quota polling determines detection timing. Explicit manual release opts out to avoid immediate re-pausing, and disabling/unloading releases suspended OS workers.

The user also requested a dedicated view of all paused sessions and a timeline item whenever a session is paused. The overview is host-wide, accessible from the sidebar, Command Center, pill, settings, and timeline; it distinguishes uncertain stops from confirmed pauses and exposes session navigation and manual controls. Timeline events describe actual confirmed transitions and survive transient delivery failures.

The enabled pill should resemble Smart Compact, with a green status icon; off, paused, and attention states stay distinct. Confirmed pause timeline entries expose Resume now, which opts out that session to avoid immediately pausing again. A clearly labelled disposable demo lets the user try the actual native pause/release action without a task or exhausted quota.

Active pause and restart-recovery timeline cards also expose Dismiss pause: release existing workers and cancel the exact saved continuation without sending a message, persist the session opt-out, and collapse the original card to a short acknowledgement. Existing native work may continue after release; dismissal does not create a turn. Saved dismissal intent must survive a crash or partial release.

## Product Principles

- Preserve the conversation and workspace through a pause.
- Make host defaults and session overrides clear and persistent.
- Keep manual control accessible from the session.
- Use the host's existing interface components and theme.
