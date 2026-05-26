import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		useTabs: true,
		tabWidth: 2,
		printWidth: 120,
		sortImports: true,
	},
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: { "vite-plus/prefer-vite-plus-imports": "error" },
		options: { typeAware: true, typeCheck: true },
	},
	pack: {
		entry: ["src/index.ts"],
		format: ["esm"],
		platform: "node",
		sourcemap: true,
	},
});
