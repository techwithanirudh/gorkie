# Uncomplect source map

Each source has one job. Do not name-drop all of them when one lens answers the problem.

## Rich Hickey: complection

- [Simple Made Easy](https://www.youtube.com/watch?v=SxdOUGdseq4)
- [Transcript](https://github.com/matthiasn/talk-transcripts/blob/master/Hickey_Rich/SimpleMadeEasy-mostly-text.md)
- [The Value of Values](https://github.com/matthiasn/talk-transcripts/blob/master/Hickey_Rich/ValueOfValuesLong.md)
- [Are We There Yet?](https://github.com/matthiasn/talk-transcripts/blob/master/Hickey_Rich/AreWeThereYet-mostly-text.md)

Use Hickey to find independent concerns that the design braided together. The key moves are separating value from time, facts from mutable places, and identity from its succession of values.

## John Ousterhout: deep modules

- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php)

Use Ousterhout to test whether a new abstraction hides substantial complexity behind a small interface. Design consequential interfaces twice. Count caller burden, change amplification, and special cases removed.

## Greg Young: deletability

- [The Art of Destroying Software](https://www.youtube.com/watch?v=1FPsJ-if2RU)

Use Young to test whether the boundary makes a wrong model cheap to replace. His one-week rewrite rule is a pressure test for module size and coupling, not a command to deploy more network services.

## Domain-Driven Design: authority

- [Eric Evans, DDD Reference](https://www.domainlanguage.com/ddd/reference/)
- [Scott Wlaschin, Domain Modeling Made Functional](https://pragprog.com/titles/swdddf/domain-modeling-made-functional/)

Use DDD to name bounded contexts, aggregate invariants, commands, events, policies, and projections. A projection can report a decision. It cannot become the authority that makes the decision.

## Typed effects: boundaries

- [Effect documentation](https://effect.website/docs/)

Use an effect system to model effectful services, expected failures, retries, transactions, tracing, and boundary decoding. Keep pure domain rules pure. Adapt this lens to the effect system and version already present in the project.

## Explicit lifecycle: essential time

- [XState documentation](https://stately.ai/docs/)
- [Guards](https://stately.ai/docs/guards)
- [Persistence](https://stately.ai/docs/persistence)

Use a state machine when modes change which events are legal, or when the workflow needs cancellation, retries, resumability, or child actors. Normalize persisted state before granting it current authority.
