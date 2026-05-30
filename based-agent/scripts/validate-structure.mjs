#!/usr/bin/env node
import { validateStructure } from "./lib/structure.mjs";

const result = validateStructure(process.cwd());
for (const warning of result.warnings) console.warn(`WARN  ${warning}`);
for (const error of result.errors) console.error(`ERROR ${error}`);
if (result.errors.length) {
  console.error(`Structure validation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`Structure validation passed (${result.warnings.length} warning(s)).`);
