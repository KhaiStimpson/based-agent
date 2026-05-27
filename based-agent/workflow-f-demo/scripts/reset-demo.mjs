import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(demoRoot, "output");
const expectedOutputDir = path.join(demoRoot, "output");

if (outputDir !== expectedOutputDir || path.dirname(outputDir) !== demoRoot) {
  throw new Error(`Refusing reset outside demo output directory: ${outputDir}`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, ".gitkeep"), "", "utf8");
console.log(`Reset generated demo state: ${outputDir}`);
