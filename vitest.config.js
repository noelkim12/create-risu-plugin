import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// Template overlays: framework variants import ../core, ../settings, ../index from the
// shared common tree that only exists after project composition. Tests mirror that.
const overlayFeatures = [
  {
    template: "credential-manager",
    directories: ["core", "settings", "storage"],
  },
  {
    template: "llm-client",
    directories: ["core", "network", "settings", "storage"],
  },
  {
    template: "embedding-client",
    directories: ["core", "settings", "index"],
  },
  {
    template: "contextual-embedding-client",
    directories: ["core", "settings", "index"],
  },
  {
    template: "reranker-client",
    directories: ["core", "settings", "index"],
  },
].map(({ template, directories }) => ({
  directories,
  common: path.join(root, "templates/features", template, "common/ts/src/features", template),
  variants: ["vanilla", "svelte"].map(variant =>
    path.join(root, "templates/features", template, variant, "ts/src/features", template),
  ),
}));

const aiServicesFeature = path.join(
  root,
  "templates/features/ai-services/common/ts/src/features/ai-services",
);
const credentialManagerFeature = path.join(
  root,
  "templates/features/credential-manager/common/ts/src/features/credential-manager",
);

export default defineConfig({
  plugins: [{
    name: "resolve-feature-common-overlay",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer) return null;
      const overlay = overlayFeatures.find(entry =>
        entry.variants.some(variant => importer.startsWith(variant)),
      );
      if (!overlay) return null;
      for (const directory of overlay.directories) {
        const prefix = `../${directory}`;
        if (source !== prefix && !source.startsWith(`${prefix}/`)) continue;
        return this.resolve(path.join(overlay.common, source.slice(3)), importer, { skipSelf: true });
      }
      return null;
    },
  }],
  resolve: {
    alias: [
      {
        find: /^(?:\.\.\/){1,2}ai-services(?=\/|$)/,
        replacement: aiServicesFeature,
      },
      {
        find: /^(?:\.\.\/){1,2}credential-manager(?=\/|$)/,
        replacement: credentialManagerFeature,
      },
      {
        find: /^\.\.\/\.\.\/\.\.\/constants\/plugin$/,
        replacement: path.join(root, "templates/frameworks/vanilla/ts/src/constants/plugin.ts"),
      },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{js,ts}"],
    restoreMocks: true
  }
});
