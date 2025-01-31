// firmwareAndLibrary.ts
import fs from "fs";
import path from "path";

export const LIBRARY_PATH = path.join(process.cwd(), "library.json");

export interface ToolRecord {
  name: string;
  description: string;
  sourceCode: string;
  createdAt: string;
  version: number;
  usageCount: number;
}

export function createToolRecord(
  name: string,
  description: string,
  sourceCode: string,
): ToolRecord {
  return {
    name,
    description,
    sourceCode,
    createdAt: new Date().toISOString(),
    version: 1,
    usageCount: 0,
  };
}

export function loadToolRecords(): ToolRecord[] {
  if (!fs.existsSync(LIBRARY_PATH)) {
    return [];
  }
  const data = fs.readFileSync(LIBRARY_PATH, "utf-8");
  return JSON.parse(data) as ToolRecord[];
}

export function saveToolRecord(record: ToolRecord) {
  const records = loadToolRecords();
  records.push(record);
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(records, null, 2), "utf-8");
}

/**
 * Minimal "firmware" checks:
 *  - Must have triple-quoted docstring
 *  - Cannot import 'os' or 'subprocess'
 */
export function checkFirmwarePolicy(code: string): { approved: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!/""".*?"""/s.test(code)) {
    errors.push("Missing triple-quoted docstring.");
  }
  for (const mod of ["os", "subprocess"]) {
    if (new RegExp(`import\\s+${mod}`).test(code)) {
      errors.push(`Disallowed import: '${mod}'`);
    }
  }

  return { approved: errors.length === 0, errors };
}
