// Graph edits the app performs on the user's behalf.
//
// There is exactly one of these, and it is the only place in the product where
// the app writes a proposition the user did not type. That makes it worth
// stating precisely what it may do: it takes the rule the user selected,
// applied to the goal they already approved, and puts the resulting
// obligations on the board as open goals. It searches for nothing, assumes
// nothing, and closes nothing — every card it creates still needs the user to
// put something behind it.
//
// Kept out of the board component so the placement and the "only fill empty
// ports" rule can be tested directly.

import { printProp } from './ir';
import {
    incomingOn,
    obligationPortId,
    ruleDecomposition,
    type LogicContext,
    type LogicEdgeLike,
} from './graph';

/** A rectangle on the board — enough of a node for placement to reason about. */
export interface Placeable {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ChildGoalPlan {
    /** Where each new goal card goes, with the proposition it states. */
    goals: { x: number; y: number; source: string; portId: string }[];
}

export const CHILD_GAP = 16;
/** How far upstream of the rule the obligation column sits. */
export const CHILD_OFFSET = 60;

/**
 * Works out which goal cards a rule still needs and where to put them.
 *
 * Only unfilled ports are planned, so running this twice is harmless and it
 * can never disturb wiring the user already made.
 */
export function planChildGoals(
    /** The rule card's geometry and id. Its logic payload is read from `ctx`. */
    ruleNode: Placeable,
    ctx: LogicContext,
    existing: readonly Placeable[],
    size: { width: number; height: number },
): ChildGoalPlan {
    // Geometry comes from the caller (the board's node, which carries x/y and
    // size); what rule is selected comes from the context, which is the
    // authority on it. Reading both off the caller's copy would let a stale
    // object plan the wrong obligations.
    const authoritative = ctx.nodeById.get(ruleNode.id);
    if (!authoritative) return { goals: [] };
    const dec = ruleDecomposition(authoritative, ctx);
    if (!dec.ok) return { goals: [] };

    const pending = dec.decomposition.obligations
        .map((ob, i) => ({ ob, portId: obligationPortId(i) }))
        .filter(({ portId }) => !incomingOn(ctx, ruleNode.id, portId));
    if (!pending.length) return { goals: [] };

    const stackHeight = pending.length * size.height + (pending.length - 1) * CHILD_GAP;
    const top = Math.round(ruleNode.y + ruleNode.height / 2 - stackHeight / 2);

    // Obligations feed the rule, so they belong upstream — to its left, in the
    // same reading direction as every other wire on the board. If that column
    // is occupied the whole stack steps further left, rather than interleaving
    // with whatever is already there.
    let left = Math.round(ruleNode.x - size.width - CHILD_OFFSET);
    for (let attempt = 0; attempt < 6; attempt++) {
        const clash = pending.some((_, i) => {
            const y = top + i * (size.height + CHILD_GAP);
            return existing.some(
                (n) =>
                    n.id !== ruleNode.id &&
                    n.x < left + size.width &&
                    n.x + n.width > left &&
                    n.y < y + size.height &&
                    n.y + n.height > y,
            );
        });
        if (!clash) break;
        left -= size.width + CHILD_OFFSET;
    }

    return {
        goals: pending.map(({ ob, portId }, i) => ({
            x: left,
            y: top + i * (size.height + CHILD_GAP),
            source: printProp(ob.prop),
            portId,
        })),
    };
}

/** The edge wiring a freshly created goal card into the port it was made for. */
export function childGoalEdge(goalId: string, ruleId: string, portId: string): LogicEdgeLike {
    return {
        id: crypto.randomUUID(),
        from: goalId,
        to: ruleId,
        fromPort: 'out',
        toPort: portId,
        role: 'premise',
    };
}
