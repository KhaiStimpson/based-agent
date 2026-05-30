#!/usr/bin/env node
import { packageCounts } from "./lib/structure.mjs";

const counts = packageCounts(process.cwd());
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ cwd: process.cwd(), counts }, null, 2));
} else {
  console.log("based-agent status");
  for (const [key, value] of Object.entries(counts)) console.log(`- ${key.replaceAll("_", " ")}: ${value}`);
}
