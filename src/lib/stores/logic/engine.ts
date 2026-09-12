// The one interface the logic UI talks to, plus its desktop implementation.
//
// The UI depends on `LeanEngine`, never on `invoke` or `fetch` directly, so
// the web verifier can be dropped in later without the cards knowing. The
// desktop implementation wraps the app's existing `lean_compile` command:
// that command already tries the resident language server first and falls
// back to a batch compile on any failure (see `lean.rs`), so this gets the
// fast path for free without a second Lean transport to maintain.
//
// Each proof component gets its own kernel id, which gives it an isolated
// working directory and makes the existing `cancel_lean_compile` supersede
// exactly this proof's in-flight run and nothing else — the workbook's Julia
// and Lean data cards keep their own kernels untouched.

import { invoke } from '@tauri-apps/api/core';
import type { GeneratedModule } from './codegen';
import { extractTrust, mapDiagnostics, type LeanCompileResult, type NodeDiagnostic, type TrustReport } from './status';

export type SessionId = string;
export type Unsubscribe = () => void;

export interface OpenSessionInput {
    /** The proof component's root node id — one session per proof. */
    rootId: string;
}

export interface VerificationCertificate {
    ok: boolean;
    /** Semantic hash of the graph that produced this — see `logicComponentKey`. */
    graphHash: string;
    /** Hash of the exact generated source, so a certificate names what ran. */
    sourceHash: string;
    leanVersion: string;
    source: string;
    diagnostics: NodeDiagnostic[];
    trust: TrustReport;
    elapsedMs: number;
    checkedAt: number;
}

export type VerifyEvent =
    | { type: 'checking' }
    | { type: 'result'; result: LeanCompileResult; diagnostics: NodeDiagnostic[]; trust: TrustReport }
    | { type: 'cancelled' }
    | { type: 'error'; message: string };

export interface VerifyRequest {
    module: GeneratedModule;
    graphHash: string;
}

export interface LeanEngine {
    openSession(input: OpenSessionInput): Promise<SessionId>;
    /** Queues a debounced check for the current graph. */
    updateGraph(session: SessionId, request: VerifyRequest): Promise<void>;
    subscribe(session: SessionId, onEvent: (event: VerifyEvent) => void): Unsubscribe;
    /** Runs a fresh check immediately and returns a certificate. */
    verifyFinal(session: SessionId, request: VerifyRequest): Promise<VerificationCertificate>;
    closeSession(session: SessionId): Promise<void>;
}

/** Ordinary edits settle before we spend a compile on them; Verify skips this. */
const DEBOUNCE_MS = 350;

interface Session {
    kernel: string;
    listeners: Set<(event: VerifyEvent) => void>;
    timer: ReturnType<typeof setTimeout> | null;
    /** Guards against an older run's result overwriting a newer one. */
    generation: number;
}

class DesktopLeanEngine implements LeanEngine {
    private sessions = new Map<SessionId, Session>();

    async openSession(input: OpenSessionInput): Promise<SessionId> {
        const id = `logic-${input.rootId}`;
        if (!this.sessions.has(id)) {
            this.sessions.set(id, { kernel: id, listeners: new Set(), timer: null, generation: 0 });
        }
        return id;
    }

    subscribe(session: SessionId, onEvent: (event: VerifyEvent) => void): Unsubscribe {
        const entry = this.sessions.get(session);
        if (!entry) return () => {};
        entry.listeners.add(onEvent);
        return () => entry.listeners.delete(onEvent);
    }

    async updateGraph(session: SessionId, request: VerifyRequest): Promise<void> {
        const entry = this.sessions.get(session);
        if (!entry) return;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            void this.run(session, request);
        }, DEBOUNCE_MS);
    }

    async verifyFinal(session: SessionId, request: VerifyRequest): Promise<VerificationCertificate> {
        const entry = this.sessions.get(session);
        if (entry?.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        const outcome = await this.run(session, request);
        const leanVersion = await currentLeanVersion();
        return {
            ok: !!outcome && outcome.result.ok && !outcome.trust.usesSorry,
            graphHash: request.graphHash,
            sourceHash: hashSource(request.module.source),
            leanVersion,
            source: request.module.source,
            diagnostics: outcome?.diagnostics ?? [],
            trust:
                outcome?.trust ??
                { axioms: [], usesSorry: true, authorAxioms: [], premiseIds: [], openGoals: request.module.openGoals },
            elapsedMs: outcome?.result.elapsed_ms ?? 0,
            checkedAt: Date.now(),
        };
    }

    async closeSession(session: SessionId): Promise<void> {
        const entry = this.sessions.get(session);
        if (!entry) return;
        if (entry.timer) clearTimeout(entry.timer);
        try {
            await invoke('cancel_lean_compile', { kernel: entry.kernel });
        } catch {
            // A session closing is not a good reason to surface an error.
        }
        this.sessions.delete(session);
    }

    private async run(
        session: SessionId,
        request: VerifyRequest,
    ): Promise<{ result: LeanCompileResult; diagnostics: NodeDiagnostic[]; trust: TrustReport } | null> {
        const entry = this.sessions.get(session);
        if (!entry) return null;
        const generation = ++entry.generation;
        this.emit(entry, { type: 'checking' });

        try {
            const result = await invoke<LeanCompileResult>('lean_compile', {
                code: request.module.source,
                kernel: entry.kernel,
            });
            // A newer edit already started its own run; this one's answer is
            // about a graph that no longer exists.
            if (generation !== entry.generation) return null;
            if (result.cancelled) {
                this.emit(entry, { type: 'cancelled' });
                return null;
            }
            const diagnostics = mapDiagnostics(result, request.module);
            const trust = extractTrust(result, request.module);
            this.emit(entry, { type: 'result', result, diagnostics, trust });
            return { result, diagnostics, trust };
        } catch (e) {
            if (generation !== entry.generation) return null;
            this.emit(entry, { type: 'error', message: e instanceof Error ? e.message : String(e) });
            return null;
        }
    }

    private emit(entry: Session, event: VerifyEvent): void {
        for (const listener of entry.listeners) listener(event);
    }
}

let engine: LeanEngine | null = null;

/** The engine this build talks to. Swapped for an HTTP implementation on web. */
export function leanEngine(): LeanEngine {
    if (!engine) engine = new DesktopLeanEngine();
    return engine;
}

async function currentLeanVersion(): Promise<string> {
    try {
        return await invoke<string>('get_lean_version');
    } catch {
        return 'unknown';
    }
}

/** Same change-detector hash the Theory uses; not a security digest. */
function hashSource(source: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < source.length; i++) {
        const c = source.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= (c << 5) | (c >>> 3);
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
