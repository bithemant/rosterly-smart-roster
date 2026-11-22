import { resolve } from "node:path";
import { createImportTemplate } from "../src/lib/import-template";

const outputPath = resolve(process.argv[2] ?? "docs/rosterly-workforce-template.xlsx");
async function main() {
  await createImportTemplate().xlsx.writeFile(outputPath);
  console.log(`Created blank roster template at ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("Could not create the roster import template.", error);
  process.exitCode = 1;
});
