import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const commonFeature = path.join(
  root,
  "templates/features/llm-client/common/ts/src/features/llm-client",
);
const vanillaFeature = path.join(
  root,
  "templates/features/llm-client/vanilla/ts/src/features/llm-client",
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: path.join(root, "templates/features/llm-client/common/ts/src/constants/plugin"),
        replacement: path.join(root, "templates/frameworks/vanilla/ts/src/constants/plugin.ts"),
      },
      ...["core", "network", "settings", "storage"].map(directory => ({
        find: path.join(vanillaFeature, directory),
        replacement: path.join(commonFeature, directory),
      })),
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{js,ts}"],
    restoreMocks: true
  }
});
