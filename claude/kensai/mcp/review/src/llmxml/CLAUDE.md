# llmxml

Pseudo-XML markup builder for LLM-facing tool responses. Produces human-readable, parseable-enough XML
without a full DOM or serializer.

## API

| Export                          | Purpose                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `element(tag, ...attrs)`        | Create an element builder (shorthand for `Element.create`)        |
| `Element.create(tag, ...attrs)` | Create an element builder                                         |
| `attr(key, value)`              | Create an attribute token from a scalar (string, number, boolean) |

## Element Builder

Fluent API — methods return `this` for chaining:

- `.addAttr(a)` — append attribute (allowed before and after content)
- `.inlineText(s)` — set body inline: `<tag>text</tag>`
- `.wrapText(s)` — set body wrapped: `<tag>\ntext\n</tag>`
- `.toString()` — render to string

Content is one-shot — calling `inlineText`/`wrapText` twice throws.
No body produces self-closing: `<tag/>`.

## Composition

Elements compose via `toString()` — render inner elements to strings, pass to `wrapText`:

```typescript
const inner = element("child", attr("id", "1")).toString();
element("parent").wrapText(inner).toString();
// <parent>\n<child id="1"/>\n</parent>
```

## Escaping

Attribute values are quoted and escaped: `\` -> `\\`, `"` -> `\"`, `\n` -> `\n`, `\r` -> `\r`, `\t` -> `\t`.
Body text is not escaped — callers control content directly.
