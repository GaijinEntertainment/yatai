/** Attribute values are constrained to types with unambiguous string representation. */
export type Scalar = string | number | boolean;

/** Opaque attribute token — construct via {@link attr}. */
export type AttrToken = {
	key: string;
	value: string;
};

/** Construct an attribute from any scalar value. Formatted via `String()` on render. */
export function attr(key: string, value: Scalar): AttrToken {
	return { key, value: String(value) };
}

function quoteValue(value: string): string {
	return `"${value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/[\n\r\t]/g, (c) => {
			if (c === "\n") return "\\n";
			if (c === "\r") return "\\r";
			return "\\t";
		})}"`;
}

function writeAttr(a: AttrToken): string {
	return `${a.key}=${quoteValue(a.value)}`;
}

/**
 * Mutable element builder. Renders either a self-closing `<tag .../>` when empty
 * or an open/close `<tag ...>body</tag>` pair when content is set.
 *
 * Content is one-shot — calling {@link inlineText} or {@link wrapText} twice, or mixing them, throws.
 */
export class Element {
	#tag: string;
	#attrs: AttrToken[];
	#text: string | undefined;
	#sealed = false;

	private constructor(tag: string, attrs: AttrToken[]) {
		this.#tag = tag;
		this.#attrs = attrs;
	}

	/** Create a new element builder. */
	static create(tag: string, ...attrs: AttrToken[]): Element {
		return new Element(tag, attrs);
	}

	/** Append an attribute to the opening tag. */
	addAttr(a: AttrToken): this {
		this.#attrs.push(a);
		return this;
	}

	/** Set inline text content (no wrapping newlines). Throws if content was already set. */
	inlineText(s: string): this {
		if (this.#sealed) throw new Error("llmxml: content already set");
		this.#sealed = true;
		this.#text = s;
		return this;
	}

	/** Set wrapped text content (newlines before and after). Throws if content was already set. */
	wrapText(s: string): this {
		if (this.#sealed) throw new Error("llmxml: content already set");
		this.#sealed = true;
		this.#text = `\n${s}\n`;
		return this;
	}

	/** Render the element. No body -> `<tag attrs/>`. With body -> `<tag attrs>text</tag>`. */
	toString(): string {
		let out = `<${this.#tag}`;

		for (const a of this.#attrs) {
			out += ` ${writeAttr(a)}`;
		}

		if (!this.#sealed) {
			return `${out}/>`;
		}

		return `${out}>${this.#text}</${this.#tag}>`;
	}
}

/** Create a new element builder. Shorthand for `Element.create(tag, ...attrs)`. */
export function element(tag: string, ...attrs: AttrToken[]): Element {
	return Element.create(tag, ...attrs);
}
