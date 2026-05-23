import { Readable } from "node:stream";

import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_PROBE_SIZE, ErrBinaryContent, LineIter, type BinaryProbe } from "./lineiter.ts";

function stream(buf: Buffer): AsyncIterable<Buffer> {
	return Readable.from(buf);
}

async function* chunked(buf: Buffer, size: number): AsyncIterable<Buffer> {
	for (let i = 0; i < buf.length; i += size) {
		yield buf.subarray(i, Math.min(i + size, buf.length));
	}
}

async function collect(iter: LineIter): Promise<{ content: string; len: number; num: number }[]> {
	const lines: { content: string; len: number; num: number }[] = [];
	while (await iter.next()) {
		lines.push({ content: iter.content(), len: iter.len(), num: iter.num() });
	}
	return lines;
}

describe("LineIter", () => {
	describe("binary detection", () => {
		it("throws on null byte within probe window", async () => {
			await expect(LineIter.new(stream(Buffer.from("hello\x00world")), { lineCap: 1024 })).rejects.toThrow(
				ErrBinaryContent,
			);
		});

		it("accepts null byte after probe window", async () => {
			const prefix = "a".repeat(DEFAULT_PROBE_SIZE);
			await expect(
				LineIter.new(stream(Buffer.from(`${prefix}\x00trailing`)), { lineCap: 1024 }),
			).resolves.toBeDefined();
		});

		it("accepts file shorter than probe size", async () => {
			await expect(LineIter.new(stream(Buffer.from("short")), { lineCap: 1024 })).resolves.toBeDefined();
		});

		it("detects null byte in short file", async () => {
			await expect(LineIter.new(stream(Buffer.from("ab\x00cd")), { lineCap: 1024 })).rejects.toThrow(ErrBinaryContent);
		});

		it("respects custom probeSize", async () => {
			await expect(
				LineIter.new(stream(Buffer.from("abc\x00def")), { lineCap: 1024, probeSize: 3 }),
			).resolves.toBeDefined();
			await expect(LineIter.new(stream(Buffer.from("abc\x00def")), { lineCap: 1024, probeSize: 4 })).rejects.toThrow(
				ErrBinaryContent,
			);
		});

		it("skips probe when probeSize is 0", async () => {
			await expect(
				LineIter.new(stream(Buffer.from("\x00binary")), { lineCap: 1024, probeSize: 0 }),
			).resolves.toBeDefined();
		});

		it("skips probe when probe is false", async () => {
			await expect(
				LineIter.new(stream(Buffer.from("\x00binary")), { lineCap: 1024, probe: false }),
			).resolves.toBeDefined();
		});

		it("uses custom probe", async () => {
			const rejectAll: BinaryProbe = () => true;
			await expect(LineIter.new(stream(Buffer.from("text")), { probe: rejectAll })).rejects.toThrow(ErrBinaryContent);
		});

		it("custom probe receives capped head", async () => {
			let receivedLen = 0;
			const spy: BinaryProbe = (head) => {
				receivedLen = head.length;
				return false;
			};
			await LineIter.new(stream(Buffer.from("a".repeat(1000))), { probe: spy, probeSize: 64 });
			expect(receivedLen).toBe(64);
		});

		it("empty stream", async () => {
			const iter = await LineIter.new(stream(Buffer.alloc(0)), { lineCap: 1024 });
			expect(await iter.next()).toBe(false);
		});
	});

	describe("line iteration", () => {
		it("single line without trailing newline", async () => {
			const iter = await LineIter.new(stream(Buffer.from("hello")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([{ content: "hello", len: 5, num: 1 }]);
		});

		it("single line with trailing newline", async () => {
			const iter = await LineIter.new(stream(Buffer.from("hello\n")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([{ content: "hello", len: 5, num: 1 }]);
		});

		it("multiple lines", async () => {
			const iter = await LineIter.new(stream(Buffer.from("aaa\nbbb\nccc")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([
				{ content: "aaa", len: 3, num: 1 },
				{ content: "bbb", len: 3, num: 2 },
				{ content: "ccc", len: 3, num: 3 },
			]);
		});

		it("CRLF keeps \\r in content", async () => {
			const iter = await LineIter.new(stream(Buffer.from("aaa\r\nbbb\r\n")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([
				{ content: "aaa\r", len: 4, num: 1 },
				{ content: "bbb\r", len: 4, num: 2 },
			]);
		});

		it("lone CR is content", async () => {
			const iter = await LineIter.new(stream(Buffer.from("a\rb")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([{ content: "a\rb", len: 3, num: 1 }]);
		});

		it("blank lines", async () => {
			const iter = await LineIter.new(stream(Buffer.from("a\n\nb")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([
				{ content: "a", len: 1, num: 1 },
				{ content: "", len: 0, num: 2 },
				{ content: "b", len: 1, num: 3 },
			]);
		});

		it("only newlines", async () => {
			const iter = await LineIter.new(stream(Buffer.from("\n\n\n")), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([
				{ content: "", len: 0, num: 1 },
				{ content: "", len: 0, num: 2 },
				{ content: "", len: 0, num: 3 },
			]);
		});

		it("empty stream produces no lines", async () => {
			const iter = await LineIter.new(stream(Buffer.alloc(0)), { lineCap: 1024 });
			expect(await collect(iter)).toEqual([]);
		});
	});

	describe("line cap", () => {
		it("caps content", async () => {
			const iter = await LineIter.new(stream(Buffer.from("abcdefghij")), { lineCap: 5 });
			expect(await iter.next()).toBe(true);
			expect(iter.content()).toBe("abcde");
			expect(iter.len()).toBe(10);
		});

		it("body-less mode", async () => {
			const iter = await LineIter.new(stream(Buffer.from("hello\nworld")));
			expect(await collect(iter)).toEqual([
				{ content: "", len: 5, num: 1 },
				{ content: "", len: 5, num: 2 },
			]);
		});

		it("caps each line independently", async () => {
			const iter = await LineIter.new(stream(Buffer.from("abcdef\nxy\nabcdefghij")), { lineCap: 4 });
			expect(await collect(iter)).toEqual([
				{ content: "abcd", len: 6, num: 1 },
				{ content: "xy", len: 2, num: 2 },
				{ content: "abcd", len: 10, num: 3 },
			]);
		});

		it("negative lineCap treated as body-less", async () => {
			const iter = await LineIter.new(stream(Buffer.from("hello")), { lineCap: -1 });
			expect(await iter.next()).toBe(true);
			expect(iter.content()).toBe("");
		});
	});

	describe("line numbers", () => {
		it("1-based", async () => {
			const iter = await LineIter.new(stream(Buffer.from("a\nb\nc")), { lineCap: 1024 });
			expect(await iter.next()).toBe(true);
			expect(iter.num()).toBe(1);
			expect(await iter.next()).toBe(true);
			expect(iter.num()).toBe(2);
			expect(await iter.next()).toBe(true);
			expect(iter.num()).toBe(3);
			expect(await iter.next()).toBe(false);
		});

		it("0 before first next", async () => {
			const iter = await LineIter.new(stream(Buffer.from("hello")), { lineCap: 1024 });
			expect(iter.num()).toBe(0);
		});
	});

	describe("chunked stream", () => {
		it("line spanning multiple chunks", async () => {
			const line = "a".repeat(100);
			const iter = await LineIter.new(chunked(Buffer.from(`${line}\nb`), 16), { lineCap: 1024, probeSize: 0 });
			expect(await collect(iter)).toEqual([
				{ content: line, len: 100, num: 1 },
				{ content: "b", len: 1, num: 2 },
			]);
		});

		it("body-less with small chunks", async () => {
			const line = "b".repeat(50);
			const iter = await LineIter.new(chunked(Buffer.from(`${line}\n${line}`), 16), { lineCap: 0, probeSize: 0 });
			expect(await collect(iter)).toEqual([
				{ content: "", len: 50, num: 1 },
				{ content: "", len: 50, num: 2 },
			]);
		});

		it("lineCap with line longer than chunk", async () => {
			const line = "abcdefghijklmnopqrstuvwxyz".repeat(4);
			const iter = await LineIter.new(chunked(Buffer.from(line), 16), { lineCap: 10, probeSize: 0 });
			expect(await iter.next()).toBe(true);
			expect(iter.content()).toBe("abcdefghij");
			expect(iter.len()).toBe(104);
		});

		it("async generator source", async () => {
			async function* gen(): AsyncIterable<Buffer> {
				yield Buffer.from("hello\n");
				yield Buffer.from("world\n");
			}
			const iter = await LineIter.new(gen(), { lineCap: 1024, probeSize: 0 });
			expect(await collect(iter)).toEqual([
				{ content: "hello", len: 5, num: 1 },
				{ content: "world", len: 5, num: 2 },
			]);
		});
	});

	describe("abort signal", () => {
		it("stops iteration mid-stream", async () => {
			const controller = new AbortController();
			const iter = await LineIter.new(stream(Buffer.from("a\nb\nc\n")), {
				lineCap: 1024,
				signal: controller.signal,
			});
			expect(await iter.next()).toBe(true);
			controller.abort();
			await expect(iter.next()).rejects.toThrow();
		});

		it("pre-aborted signal throws on first next", async () => {
			const controller = new AbortController();
			controller.abort();
			const iter = await LineIter.new(stream(Buffer.from("a\nb\n")), {
				lineCap: 1024,
				signal: controller.signal,
			});
			await expect(iter.next()).rejects.toThrow();
		});
	});
});
