/-
  CounterDeception.lean — the golden fixture for the Lean Logic Pipeline.

  This file is the hand-written reference for what the pipeline's code
  generator is expected to produce for the Counter-Deception example. The
  generator's output is checked against the *shape* of this file: a theory
  block of author-declared vocabulary and axioms, then a theorem whose
  parameters are the local premises, then `#print axioms` so Lean itself
  reports what the result actually rests on.

  Two things this file is careful about, because the product depends on them:

  * Lean 4 has no `constant`. Vocabulary is declared with `axiom`, which is
    also honest — an undefined predicate really is something being taken on
    faith rather than constructed.
  * `Permissible`, `Wrong` and the two moral rules are *assumptions*. Lean
    verifies that the conclusion follows from them. It says nothing about
    whether they are true, and `#print axioms` at the bottom is what makes
    that visible rather than buried.
-/

-- ── Theory: Counter-Deception ───────────────────────────────────────────────
-- Vocabulary. Declared by the author; nothing here is derived.

axiom Act : Type

axiom Deceptive : Act → Prop
axiom DefeatsWrongfulPlot : Act → Prop
axiom ProtectsInnocents : Act → Prop
axiom Proportionate : Act → Prop
axiom Permissible : Act → Prop
axiom Wrong : Act → Prop

-- The act under discussion.
axiom rescue : Act

-- Trusted declarations. These are the two moral rules the author accepts;
-- they are assumptions, not results.

axiom justifiedCounterDeception :
    ∀ a : Act,
      Deceptive a →
      DefeatsWrongfulPlot a →
      ProtectsInnocents a →
      Proportionate a →
      Permissible a

axiom permissibleNotWrong :
    ∀ a : Act, Permissible a → ¬ Wrong a

-- ── Proof ───────────────────────────────────────────────────────────────────
-- The four premises are theorem parameters, not global axioms: they are
-- assumed for this argument alone and do not change the environment.

theorem rescue_not_wrong
    (hD : Deceptive rescue)
    (hF : DefeatsWrongfulPlot rescue)
    (hI : ProtectsInnocents rescue)
    (hR : Proportionate rescue) :
    ¬ Wrong rescue := by
  -- The user chose `apply justifiedCounterDeception`, which mechanically
  -- exposed exactly these four obligations.
  have hPermissible : Permissible rescue :=
    justifiedCounterDeception rescue hD hF hI hR
  -- Then `apply permissibleNotWrong`, whose single obligation is the above.
  exact permissibleNotWrong rescue hPermissible

-- What the result actually rests on. Anything unfinished would show up here
-- as `sorryAx`, which the status reducer treats as disqualifying.
#print axioms rescue_not_wrong
