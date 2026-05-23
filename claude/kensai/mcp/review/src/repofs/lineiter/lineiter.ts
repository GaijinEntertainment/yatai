/** Prefix length inspected by {@link nullByteProbe}. Matches Go's DefaultNullByteProbeSize. */
export const DEFAULT_PROBE_SIZE = 512;

/** Inspects the leading bytes of a source and reports whether it should be treated as binary. */
export type BinaryProbe = (head: Buffer) => boolean;

/** Default {@link BinaryProbe} — returns true when head contains a null byte (0x00). */
export function nullByteProbe(head: Buffer): boolean {
	return head.includes(0);
}

/** Thrown by {@link LineIter.new} when the binary probe detects binary content. */
export class ErrBinaryContent extends Error {
	constructor() {
		super("lineiter: binary content");
		this.name = "ErrBinaryContent";
	}
}

export interface LineIterOptions {
	/** Max bytes retained per line in {@link LineIter.content}. 0 = body-less mode (default). */
	lineCap?: number;
	/** Probe function. Default: {@link nullByteProbe}. `false` to disable. */
	probe?: BinaryProbe | false;
	/** Bytes from first chunk passed to probe. Default: {@link DEFAULT_PROBE_SIZE}. */
	probeSize?: number;
	/** Checked at the start of each {@link LineIter.next} call. */
	signal?: AbortSignal;
}

/**
 * Pull-style streaming line iterator over an {@link AsyncIterable} of Buffers.
 * Splits on `\n`; `\r` is content. Drive with {@link next}, read via {@link content}/{@link len}/{@link num}.
 */
export class LineIter {
	#iter: AsyncIterator<Buffer>;
	#chunk: Buffer | null = null;
	#chunkPos = 0;
	#streamDone = false;
	#done = false;
	#lineCap: number;
	#signal?: AbortSignal;
	#bodyBuf: Buffer | null;
	#bodyLen = 0;
	#lineLen = 0;
	#num = 0;
	#content = "";

	private constructor(iter: AsyncIterator<Buffer>, lineCap: number, signal?: AbortSignal) {
		this.#iter = iter;
		this.#lineCap = lineCap;
		this.#signal = signal;
		this.#bodyBuf = lineCap > 0 ? Buffer.allocUnsafe(lineCap) : null;
	}

	/** Create an iterator. Runs the binary probe on the first chunk. Throws {@link ErrBinaryContent} on binary. */
	static async new(source: AsyncIterable<Buffer>, opts?: LineIterOptions): Promise<LineIter> {
		const lineCap = Math.max(opts?.lineCap ?? 0, 0);
		const probe = opts?.probe === undefined ? nullByteProbe : opts.probe;
		const probeSize = opts?.probeSize ?? DEFAULT_PROBE_SIZE;
		const iter = new LineIter(source[Symbol.asyncIterator](), lineCap, opts?.signal);

		if (probe && probeSize > 0) {
			await iter.#pull();
			if (iter.#chunk && probe(iter.#chunk.subarray(0, Math.min(iter.#chunk.length, probeSize)))) {
				await iter.#iter.return?.();
				throw new ErrBinaryContent();
			}
		}

		return iter;
	}

	/** Advance to the next line. Returns false at EOF. Throws on abort. */
	async next(): Promise<boolean> {
		if (this.#done) return false;
		this.#signal?.throwIfAborted();

		this.#lineLen = 0;
		this.#bodyLen = 0;
		let sawAny = false;

		for (;;) {
			if (!this.#chunk || this.#chunkPos >= this.#chunk.length) {
				if (this.#streamDone) return this.#finish(sawAny);
				if (!(await this.#pull())) return this.#finish(sawAny);
			}

			const nlIdx = this.#chunk!.indexOf(0x0a, this.#chunkPos);

			if (nlIdx >= 0) {
				this.#absorb(this.#chunk!, this.#chunkPos, nlIdx - this.#chunkPos);
				this.#chunkPos = nlIdx + 1;
				this.#num++;
				this.#content =
					this.#lineCap > 0 && this.#bodyLen > 0 ? this.#bodyBuf!.toString("utf-8", 0, this.#bodyLen) : "";
				return true;
			}

			const segLen = this.#chunk!.length - this.#chunkPos;
			if (segLen > 0) sawAny = true;
			this.#absorb(this.#chunk!, this.#chunkPos, segLen);
			this.#chunkPos = this.#chunk!.length;
		}
	}

	/** Leading bytes of the current line, capped to lineCap. Empty string in body-less mode. */
	content(): string {
		return this.#content;
	}

	/** Full byte count of the current line (excluding `\n`), regardless of lineCap. */
	len(): number {
		return this.#lineLen;
	}

	/** 1-based line number of the current line. 0 before the first {@link next} call. */
	num(): number {
		return this.#num;
	}

	async #pull(): Promise<boolean> {
		const { value, done } = await this.#iter.next();
		if (done || !value || value.length === 0) {
			this.#streamDone = true;
			this.#chunk = null;
			return false;
		}
		this.#chunk = value;
		this.#chunkPos = 0;
		return true;
	}

	#absorb(buf: Buffer, start: number, len: number): void {
		this.#lineLen += len;
		if (this.#lineCap === 0 || len === 0) return;

		const remaining = this.#lineCap - this.#bodyLen;
		if (remaining <= 0) return;

		const take = Math.min(len, remaining);
		buf.copy(this.#bodyBuf!, this.#bodyLen, start, start + take);
		this.#bodyLen += take;
	}

	#finish(sawAny: boolean): boolean {
		this.#done = true;
		void this.#iter.return?.();
		if (sawAny) {
			this.#num++;
			this.#content = this.#lineCap > 0 && this.#bodyLen > 0 ? this.#bodyBuf!.toString("utf-8", 0, this.#bodyLen) : "";
			return true;
		}
		return false;
	}
}
