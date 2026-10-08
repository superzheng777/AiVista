import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { creationStartSchema, idSchema, type CreationStart } from "./session-contract.js";

export const CREATION_STARTED = "aivista.creation_started";
export const FORM_ANSWER = "aivista.form_answer";

/** Product IDs determine the path. Callers must authorize ownership before opening a session. */
export class SessionStore {
  constructor(private readonly root: string, private readonly cwd: string) {}

  path(userId: string, sessionId: string): string {
    return resolve(this.root, idSchema.parse(userId), `${idSchema.parse(sessionId)}.jsonl`);
  }

  create(userId: string, sessionId: string): SessionManager {
    const path = this.path(userId, sessionId);
    mkdirSync(dirname(path), { recursive: true });
    // Pi opens an existing empty file by writing its native header immediately. Subsequent
    // entries then persist even before the first assistant message (including NORMAL mode).
    closeSync(openSync(path, "wx", 0o600));
    return SessionManager.open(path, dirname(path), this.cwd);
  }

  open(userId: string, sessionId: string): SessionManager {
    const path = this.path(userId, sessionId);
    // Fail on missing history instead of allowing Pi to silently start an empty session.
    closeSync(openSync(path, "r"));
    return SessionManager.open(path, dirname(path), this.cwd);
  }

  start(manager: SessionManager, input: CreationStart): void {
    manager.appendCustomEntry(CREATION_STARTED, creationStartSchema.parse(input));
  }
}
