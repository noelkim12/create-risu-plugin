#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createProject, createProjectFromOptions } from "../lib/createProject.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    description: { type: "string" },
    framework: { type: "string" },
    out: { type: "string" },
    "skip-install": { type: "boolean", default: false },
  },
});

const projectName = positionals[0];

if (projectName) {
  createProjectFromOptions({
    projectName,
    description: values.description,
    framework: values.framework ?? "vanilla",
    targetDir: values.out,
    skipInstall: values["skip-install"] === true,
  }).catch((error) => {
    console.error(`에러 발생: ${error.message}`);
    process.exit(1);
  });
} else {
  createProject();
}
