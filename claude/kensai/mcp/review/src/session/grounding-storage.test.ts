import { describe, expect, it } from "vite-plus/test";

import { GroundingStorage } from "./grounding-storage.ts";

describe("GroundingStorage", () => {
	describe("observations", () => {
		it("starts empty", () => {
			const gs = new GroundingStorage();
			expect(gs.observations()).toEqual([]);
		});

		it("assigns sequential IDs", () => {
			const gs = new GroundingStorage();
			expect(gs.createObservation("first", "detail 1")).toBe("O1");
			expect(gs.createObservation("second", "detail 2")).toBe("O2");
			expect(gs.createObservation("third", "detail 3")).toBe("O3");
		});

		it("stores summary, detail, location, and category", () => {
			const gs = new GroundingStorage();
			gs.createObservation("auth caches tokens", "No TTL on token cache", "src/auth.ts:42", "risk");

			const obs = gs.observations();
			expect(obs).toHaveLength(1);
			expect(obs[0]).toEqual({
				id: "O1",
				summary: "auth caches tokens",
				detail: "No TTL on token cache",
				location: "src/auth.ts:42",
				category: "risk",
				cancelled: false,
				cancelReason: undefined,
			});
		});

		it("omits location and category when not provided", () => {
			const gs = new GroundingStorage();
			gs.createObservation("bare observation", "just the detail");

			const obs = gs.observations()[0]!;
			expect(obs.location).toBeUndefined();
			expect(obs.category).toBeUndefined();
		});

		it("cancels a pending observation", () => {
			const gs = new GroundingStorage();
			gs.createObservation("wrong assumption", "detail");
			gs.cancelObservation("O1", "disproved by reading source");

			const obs = gs.observations()[0]!;
			expect(obs.cancelled).toBe(true);
			expect(obs.cancelReason).toBe("disproved by reading source");
		});

		it("cancels without a reason", () => {
			const gs = new GroundingStorage();
			gs.createObservation("wrong", "detail");
			gs.cancelObservation("O1");

			expect(gs.observations()[0]!.cancelled).toBe(true);
			expect(gs.observations()[0]!.cancelReason).toBeUndefined();
		});

		it("throws on cancelling nonexistent observation", () => {
			const gs = new GroundingStorage();
			expect(() => gs.cancelObservation("O99")).toThrow("Observation O99 not found");
		});

		it("throws on cancelling already cancelled observation", () => {
			const gs = new GroundingStorage();
			gs.createObservation("will cancel", "detail");
			gs.cancelObservation("O1");
			expect(() => gs.cancelObservation("O1")).toThrow("Observation O1 already cancelled");
		});

		it("returns all observations including cancelled", () => {
			const gs = new GroundingStorage();
			gs.createObservation("kept", "detail 1");
			gs.createObservation("dropped", "detail 2");
			gs.cancelObservation("O2");
			gs.createObservation("also kept", "detail 3");

			const obs = gs.observations();
			expect(obs).toHaveLength(3);
			expect(obs.map((o) => o.cancelled)).toEqual([false, true, false]);
		});
	});

	describe("result", () => {
		it("starts without result", () => {
			const gs = new GroundingStorage();
			expect(gs.result()).toBeNull();
			expect(gs.hasContent()).toBe(false);
		});

		it("stores and retrieves result", () => {
			const gs = new GroundingStorage();
			gs.storeResult({
				summary: "Adds buffered metrics pusher",
				integrationSurface: "MetricsService.push() in 3 call sites",
				intent: "Reduce API request volume by batching",
			});

			expect(gs.hasContent()).toBe(true);
			expect(gs.result()).toEqual({
				summary: "Adds buffered metrics pusher",
				integrationSurface: "MetricsService.push() in 3 call sites",
				intent: "Reduce API request volume by batching",
			});
		});

		it("stores result with hotspots and blindspots", () => {
			const gs = new GroundingStorage();
			gs.storeResult({
				summary: "Refactors auth middleware",
				integrationSurface: "All API routes via router.use()",
				intent: "Replace cookie sessions with JWT",
				hotspots: [{ location: "src/auth.ts:42-80", description: "Token validation logic" }],
				blindspots: [{ location: "src/admin/", description: "Admin routes not explored — separate auth flow" }],
			});

			const r = gs.result()!;
			expect(r.hotspots).toHaveLength(1);
			expect(r.blindspots).toHaveLength(1);
			expect(r.hotspots![0]!.location).toBe("src/auth.ts:42-80");
			expect(r.blindspots![0]!.description).toContain("Admin routes");
		});

		it("throws on duplicate store", () => {
			const gs = new GroundingStorage();
			const result = { summary: "s", integrationSurface: "i", intent: "i" };
			gs.storeResult(result);
			expect(() => gs.storeResult(result)).toThrow("Grounding result already stored");
		});
	});

	describe("observations + result independence", () => {
		it("observations and result are independent", () => {
			const gs = new GroundingStorage();
			gs.createObservation("obs", "detail");
			expect(gs.hasContent()).toBe(false);

			gs.storeResult({ summary: "s", integrationSurface: "i", intent: "i" });
			expect(gs.hasContent()).toBe(true);
			expect(gs.observations()).toHaveLength(1);
		});
	});
});
