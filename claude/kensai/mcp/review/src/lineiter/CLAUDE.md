# lineiter

Streaming pull-style line iterator with pluggable binary detection and per-line byte cap. Ported
from Go `fstoolset/lineiter`. Consumes an `AsyncIterable<Buffer>` — no internal buffering.
Foundation for `fs-file-read`.

## API

| Export                        | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `LineIter.new(source, opts?)` | Async factory. Throws `ErrBinaryContent` when probe detects binary |
| `iter.next()`                 | Async — advance to next line. Returns false at end                 |
| `iter.content()`              | Leading bytes of current line, capped to `lineCap`. UTF-8 string   |
| `iter.len()`                  | Full byte count of current line (excluding `\n`)                   |
| `iter.num()`                  | 1-based line number                                                |
| `BinaryProbe`                 | `(head: Buffer) => boolean` — pluggable probe type                 |
| `nullByteProbe`               | Default probe — returns true if head contains a null byte          |
| `ErrBinaryContent`            | Error thrown when probe returns true                               |
| `DEFAULT_PROBE_SIZE`          | Default probe window (512 bytes)                                   |

## Options

| Option      | Default         | Purpose                                           |
| ----------- | --------------- | ------------------------------------------------- |
| `lineCap`   | 0               | Max bytes retained per line. 0 = body-less mode   |
| `probe`     | `nullByteProbe` | Probe function. `false` to disable                |
| `probeSize` | 512             | Bytes from first chunk passed to probe            |
| `signal`    | —               | `AbortSignal` — checked at start of each `next()` |

## Source

Accepts any `AsyncIterable<Buffer>`:

```typescript
// fs.createReadStream
const iter = await LineIter.new(createReadStream(path), { lineCap: 1024 });

// Readable.from (testing)
const iter = await LineIter.new(Readable.from(buf), { lineCap: 1024 });

// async generator
async function* chunks() {
	yield buf1;
	yield buf2;
}
const iter = await LineIter.new(chunks(), { lineCap: 1024 });
```

No internal buffering — scans the source's chunks in place. Long lines spanning multiple
chunks accumulate `len()` across chunks; `content()` captures only the leading `lineCap` bytes.

## Line Ending Handling

Splits on `\n` only. `\r` is treated as content (matches Go behavior). Trailing `\n` does not
produce an empty final line.

## Resource Cleanup

Calls `iterator.return?.()` when iteration ends (EOF or early stop) and on binary probe
rejection. Signals the source to release resources (e.g. close file handle).

## Body-less Mode

When `lineCap` is 0 (default), `content()` returns `""` but `len()` and `num()` still report.
Zero allocation beyond the iterator state itself.
