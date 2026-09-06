/**
 * Weekly token-budget warnings.
 *
 * The AI quota is a rolling 7-day window, which is long enough that a user can
 * spend most of it in one sitting without losing the feature for the rest of
 * the day. The trade-off is that nothing stops them from doing that unawares,
 * so this store watches the weekly window and raises a toast as consumption
 * crosses each threshold.
 *
 * The contract the toast relies on: a threshold fires *once*. Dismissing it
 * records the crossed threshold, and nothing shows again until a higher one is
 * crossed — across app restarts too, since the acknowledgement lives in
 * localStorage rather than in memory. When the rolling window slides and usage
 * falls back below an acknowledged threshold, the acknowledgement drops with it
 * so the next climb warns again.
 */

import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { authUser, isPro } from "$lib/stores/auth.store";
import { getTokenUsageStats, getTierLimits } from "$lib/stores/chat-storage";

/** Ascending. 100 is the point at which the weekly cap blocks further use. */
export const WEEKLY_THRESHOLDS = [50, 75, 90, 100] as const;

export type TokenPool = "standard" | "advanced";

export interface TokenWarning {
    pool: TokenPool;
    /** The threshold that was crossed — what the acknowledgement is keyed to. */
    threshold: number;
    /** Actual consumption, which sits at or above `threshold`. */
    pct: number;
    used: number;
    cap: number;
    /** Seconds until the oldest counted tokens leave the window; null if none. */
    resetInSeconds: number | null;
}

/** The warning currently owed to the user, or null when they are up to date. */
export const tokenWarning = writable<TokenWarning | null>(null);

type Acknowledged = Record<TokenPool, number>;

const STORAGE_PREFIX = "ayahlab:weeklyTokenWarning:";
const EMPTY_ACK: Acknowledged = { standard: 0, advanced: 0 };

function storageKey(userId: string): string {
    return `${STORAGE_PREFIX}${userId}`;
}

function readAck(userId: string): Acknowledged {
    if (!browser) return { ...EMPTY_ACK };
    try {
        const raw = localStorage.getItem(storageKey(userId));
        if (!raw) return { ...EMPTY_ACK };
        const parsed = JSON.parse(raw) as Partial<Acknowledged>;
        return {
            standard: Number(parsed.standard) || 0,
            advanced: Number(parsed.advanced) || 0,
        };
    } catch {
        return { ...EMPTY_ACK };
    }
}

function writeAck(userId: string, ack: Acknowledged): void {
    if (!browser) return;
    try {
        localStorage.setItem(storageKey(userId), JSON.stringify(ack));
    } catch {
        // A full or unavailable store only costs a repeated warning.
    }
}

/** The highest threshold `pct` has reached, or 0 if it has reached none. */
function crossedThreshold(pct: number): number {
    let crossed = 0;
    for (const t of WEEKLY_THRESHOLDS) if (pct >= t) crossed = t;
    return crossed;
}

function pctOf(used: number, cap: number): number {
    if (cap <= 0) return 0;
    return Math.min(100, Math.floor((used / cap) * 100));
}

let inFlight: Promise<void> | null = null;

/**
 * Re-read weekly usage and raise a warning if a new threshold has been crossed.
 * Safe to call often — concurrent calls share one round-trip, and a call that
 * finds nothing new leaves the warning on screen alone unless the window has
 * slid back past it.
 */
export async function refreshTokenWarning(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
        try {
            const user = get(authUser);
            if (!get(isPro) || !user?.id) {
                tokenWarning.set(null);
                return;
            }
            const tier = (user.app_metadata?.tier as string | undefined) ?? "pro";
            const [usage, limits] = await Promise.all([
                getTokenUsageStats(),
                getTierLimits(tier),
            ]);
            if (!limits) return;

            const ack = readAck(user.id);
            let ackChanged = false;
            let next: TokenWarning | null = null;
            const crossedNow: Record<TokenPool, number> = { standard: 0, advanced: 0 };

            const pools: { pool: TokenPool; used: number; cap: number; reset: number | null }[] = [
                {
                    pool: "standard",
                    used: usage.standard.weekly.used,
                    cap: limits.weekly_tokens,
                    reset: usage.standard.weekly.resetInSeconds,
                },
                {
                    pool: "advanced",
                    used: usage.advanced.weekly.used,
                    cap: limits.advanced_weekly_tokens,
                    reset: usage.advanced.weekly.resetInSeconds,
                },
            ];

            for (const { pool, used, cap, reset } of pools) {
                const pct = pctOf(used, cap);
                const crossed = crossedThreshold(pct);
                crossedNow[pool] = crossed;

                // The window slid and usage fell back: forget the higher
                // acknowledgement so the next climb warns again.
                if (crossed < ack[pool]) {
                    ack[pool] = crossed;
                    ackChanged = true;
                }
                if (crossed === 0 || crossed <= ack[pool]) continue;

                // Two pools can cross at once; the more urgent one is shown and
                // the other waits for the next refresh. Equal thresholds are
                // separated by actual consumption, so the pool nearer its cap
                // goes first instead of whichever happens to be listed first.
                if (
                    !next ||
                    crossed > next.threshold ||
                    (crossed === next.threshold && pct > next.pct)
                ) {
                    next = { pool, threshold: crossed, pct, used, cap, resetInSeconds: reset };
                }
            }

            if (ackChanged) writeAck(user.id, ack);
            if (next) {
                tokenWarning.set(next);
                return;
            }
            // Nothing new to raise. Take down a warning the window has since
            // slid past, so a stale figure never sits on screen.
            const showing = get(tokenWarning);
            if (showing && crossedNow[showing.pool] < showing.threshold) {
                tokenWarning.set(null);
            }
        } catch {
            // Usage is advisory; a failed poll just means no warning this round.
        } finally {
            inFlight = null;
        }
    })();
    return inFlight;
}

/**
 * Acknowledge the warning on screen. Records its threshold so it stays gone
 * until a higher one is crossed, in this session and every later one.
 */
export function dismissTokenWarning(): void {
    const warning = get(tokenWarning);
    tokenWarning.set(null);
    const userId = get(authUser)?.id;
    if (!warning || !userId) return;
    const ack = readAck(userId);
    if (warning.threshold > ack[warning.pool]) {
        ack[warning.pool] = warning.threshold;
        writeAck(userId, ack);
    }
}

/**
 * Keep a window's toast in step with the others on the origin. Each app window
 * runs its own copy of this store, so a dismissal in one has to reach the rest
 * — localStorage `storage` events fire in every *other* document, which is
 * exactly the direction needed. Returns a teardown.
 */
export function watchTokenWarningAcks(): () => void {
    if (!browser) return () => {};
    const onStorage = (e: StorageEvent) => {
        if (!e.key?.startsWith(STORAGE_PREFIX)) return;
        const warning = get(tokenWarning);
        if (!warning) return;
        const userId = get(authUser)?.id;
        if (!userId || e.key !== storageKey(userId)) return;
        if (readAck(userId)[warning.pool] >= warning.threshold) tokenWarning.set(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
