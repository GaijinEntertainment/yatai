import { describe, expect, it } from "vite-plus/test";

import { FindingsStorage } from "./findings-storage.ts";

describe("FindingsStorage", () => {
	describe("surface", () => {
		it("starts empty", () => {
			const fs = new FindingsStorage();
			expect(fs.list()).toEqual([]);
			expect(fs.count()).toBe(0);
		});

		it("assigns sequential IDs", () => {
			const fs = new FindingsStorage();
			expect(fs.surface("correctness", "bug", "f.ts:1", "wrong", "proof")).toBe("F1");
			expect(fs.surface("security", "concern", "f.ts:2", "risky", "proof")).toBe("F2");
		});

		it("stores all fields", () => {
			const fs = new FindingsStorage();
			fs.surface("performance", "suggestion", "src/hot.ts:10-20", "N+1 query", "grep shows loop at line 15");

			const f = fs.get("F1")!;
			expect(f).toEqual({
				id: "F1",
				dimension: "performance",
				severity: "suggestion",
				location: "src/hot.ts:10-20",
				concern: "N+1 query",
				evidence: "grep shows loop at line 15",
				status: "pending",
			});
		});
	});

	describe("cancel", () => {
		it("cancels a pending finding", () => {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "f.ts:1", "wrong", "proof");
			fs.cancel("F1", "false positive");

			const f = fs.get("F1")!;
			expect(f.status).toBe("cancelled");
			expect(f.cancelReason).toBe("false positive");
		});

		it("cancels without a reason", () => {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "f.ts:1", "wrong", "proof");
			fs.cancel("F1");

			expect(fs.get("F1")!.status).toBe("cancelled");
			expect(fs.get("F1")!.cancelReason).toBeUndefined();
		});

		it("throws on nonexistent finding", () => {
			const fs = new FindingsStorage();
			expect(() => fs.cancel("F99")).toThrow("Finding F99 not found");
		});

		it("throws on non-pending finding", () => {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "f.ts:1", "wrong", "proof");
			fs.verdict("F1", "confirmed", "real bug", "bug", true);
			expect(() => fs.cancel("F1")).toThrow("Cannot cancel F1: status is confirmed, expected pending");
		});
	});

	describe("verdict", () => {
		it("confirms a finding with severity and blocking", () => {
			const fs = new FindingsStorage();
			fs.surface("security", "concern", "auth.ts:42", "no validation", "tested with curl");
			fs.verdict("F1", "confirmed", "validated — real issue", "bug", true);

			const f = fs.get("F1")!;
			expect(f.status).toBe("confirmed");
			expect(f.verdict).toEqual({
				result: "confirmed",
				reason: "validated — real issue",
				severity: "bug",
				blocking: true,
			});
		});

		it("rejects a finding", () => {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "f.ts:1", "looks wrong", "visual inspection");
			fs.verdict("F1", "rejected", "false positive — guarded by caller");

			const f = fs.get("F1")!;
			expect(f.status).toBe("rejected");
			expect(f.verdict).toEqual({
				result: "rejected",
				reason: "false positive — guarded by caller",
				severity: undefined,
				blocking: undefined,
			});
		});

		it("throws on nonexistent finding", () => {
			const fs = new FindingsStorage();
			expect(() => fs.verdict("F99", "confirmed", "reason")).toThrow("Finding F99 not found");
		});

		it("throws on non-pending finding", () => {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "f.ts:1", "wrong", "proof");
			fs.cancel("F1");
			expect(() => fs.verdict("F1", "confirmed", "reason")).toThrow(
				"Cannot verdict F1: status is cancelled, expected pending",
			);
		});
	});

	describe("get", () => {
		it("returns undefined for nonexistent ID", () => {
			const fs = new FindingsStorage();
			expect(fs.get("F1")).toBeUndefined();
		});
	});

	describe("list", () => {
		function populated(): FindingsStorage {
			const fs = new FindingsStorage();
			fs.surface("correctness", "bug", "a.ts:1", "c1", "e1");
			fs.surface("security", "concern", "b.ts:2", "c2", "e2");
			fs.surface("correctness", "suggestion", "c.ts:3", "c3", "e3");
			fs.cancel("F2", "false positive");
			fs.verdict("F3", "confirmed", "real", "suggestion");
			return fs;
		}

		it("returns all findings without filter", () => {
			expect(populated().list()).toHaveLength(3);
		});

		it("filters by dimension", () => {
			const results = populated().list({ dimension: "correctness" });
			expect(results).toHaveLength(2);
			expect(results.every((f) => f.dimension === "correctness")).toBe(true);
		});

		it("filters by status", () => {
			const results = populated().list({ status: "pending" });
			expect(results).toHaveLength(1);
			expect(results[0]!.id).toBe("F1");
		});

		it("filters by dimension and status", () => {
			const results = populated().list({ dimension: "correctness", status: "confirmed" });
			expect(results).toHaveLength(1);
			expect(results[0]!.id).toBe("F3");
		});

		it("returns empty for no match", () => {
			expect(populated().list({ dimension: "nonexistent" })).toEqual([]);
		});
	});

	describe("count", () => {
		it("counts all findings regardless of status", () => {
			const fs = new FindingsStorage();
			fs.surface("a", "bug", "f.ts:1", "c", "e");
			fs.surface("b", "bug", "f.ts:2", "c", "e");
			fs.cancel("F1");
			expect(fs.count()).toBe(2);
		});
	});
});
