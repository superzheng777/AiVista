# Generation worker v1

Java publishes one generation command containing `generationTaskId` and `expectedRevision`. TypeScript uses an in-process active set to prevent concurrent execution of the same command, continuously performs Provider, download, and OSS work, then submits one idempotent `PUT` completion. Java remains the sole writer of task state, quota, image assets, and user-visible events; there is no separate Java claim call or ordinary Worker ledger.

Only a revision-matching `QUEUED` task may start Provider work. A terminal task returns its committed result; a stale command is ignored. If a single-instance Worker restarts after Java has recorded `GENERATING` or `SAVING`, the external Provider outcome is unknowable, so the Worker submits `PROVIDER_CALL_OUTCOME_UNKNOWN` instead of repeating the Provider call.

Identifiers and file sizes are decimal strings because JavaScript numbers cannot safely represent unsigned 64-bit database values. Completion is identified by the resource URL and guarded by `generationTaskId + expectedRevision + terminal state`; it has no synthetic `completionId`. Repeating the same completion is safe, while a stale or conflicting revision is rejected. The executable TypeScript contract is `generation-completion.ts`; Java request records mirror it.
