# Mermaid gotchas

Each of these breaks a render or silently does nothing. Syntax per type: https://mermaid.js.org/intro/syntax-reference.html

## All diagrams

- The first line (after frontmatter) names the diagram type. An unknown word breaks the diagram; an unknown config key is ignored.
- Config goes in frontmatter at the top. A `%%{init: ...}%%` directive also works but only on the first line; placed anywhere else it is ignored.
- Comments start with `%%` on their own line. Avoid `{}` inside them.
- Quote any label that contains brackets, braces, parentheses, quotes or `#`: `A["mid = low + (high - low) / 2"]`. Escape a literal quote as `#quot;`.
- `click` callbacks, links and tooltips do nothing in a PNG. Leave them out.

## Flowchart

- `A([Start])` is the stadium (pill) shape, `A(Start)` the rounded rectangle, `A[Start]` the rectangle, `A{Yes?}` the diamond.
- A node called `end` in lowercase breaks the flowchart. Write `End` or quote it.
- A node id that starts with `o` or `x` right after a link (`A---oB`) turns into a circle or cross edge. Put a space before it or rename it.
- `subgraph` blocks close with `end`.

## Sequence diagram

- `->>` is a solid arrow, `-->>` a dashed reply, `-x` a solid line with a cross at the end.
- `alt`/`else`, `opt`, `loop`, `par`/`and`, `critical` and `break` blocks each close with `end`.
- The word `end` inside a message breaks the block parser. Wrap it in quotes or brackets.

## Class diagram

- Generics use tildes: `List~int~`, not `List<int>`.
- Relationships: `<|--` inheritance, `*--` composition, `o--` aggregation, `-->` association, `..>` dependency, `..|>` realization.

## ER diagram

- Keys are only `PK`, `FK` and `UK`, comma separated when there are several: `uuid student_id PK, FK`. Anything else, `NN` included, fails to parse.
- Cardinality markers, left side then right side: `|o` / `o|` zero or one, `||` / `||` exactly one, `}o` / `o{` zero or more, `}|` / `|{` one or more. `}{` is not valid.
- `--` (solid line) is an identifying relationship, `..` (dashed) a non-identifying one.
- An attribute type starts with a letter and has no spaces: `string`, `varchar(255)`, `decimal`.

## C4

- C4 support is experimental and lays elements out in declaration order. Use `UpdateLayoutConfig($c4ShapeInRow="3")` to control wrapping instead of reordering forever.

## Architecture

- The built-in icons are only `cloud`, `database`, `disk`, `internet` and `server`. Any other name (`redis`, `browser`, `load_balancer`) renders as a broken box, so pick the nearest built-in one. Other icon packs need `--iconPacks` on the mermaid-cli command, for example `--iconPacks @iconify-json/logos`.
