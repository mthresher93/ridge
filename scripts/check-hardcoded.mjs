import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["components/crm", "components/pipeline-view.tsx", "lib/selectors"];
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const hits = [];

function scanFile(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (HEX.test(line) && !line.includes("allow-hardcoded")) hits.push(`${path}:${i + 1}:${line.trim()}`);
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) scanFile(path);
  }
}

for (const root of ROOTS) {
  const stat = statSync(root);
  if (stat.isDirectory()) walk(root);
  else scanFile(root);
}
if (hits.length) {
  console.error(`check:hardcoded failed (${hits.length})\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("check:hardcoded ok");
