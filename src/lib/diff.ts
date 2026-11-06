export function unifiedDiff(
  filePath: string,
  before: string | null,
  after: string,
  mode: "100644" | "100755" = "100644",
): string {
  const next = normalize(after);
  if (before === null) return newFileDiff(filePath, next, mode);
  const previous = normalize(before);
  if (previous === next) return "";
  return updateDiff(filePath, previous, next);
}

function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

function linesOf(content: string): string[] {
  if (!content) return [];
  return content.split("\n");
}

function newFileDiff(filePath: string, content: string, mode: string): string {
  const lines = linesOf(content);
  const body = lines.map((line) => `+${line}`).join("\n");
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `new file mode ${mode}`,
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    "",
  ].join("\n");
}

function updateDiff(filePath: string, before: string, after: string): string {
  const oldLines = linesOf(before);
  const newLines = linesOf(after);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const context = 3;
  const oldFrom = Math.max(0, prefix - context);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const oldTo = Math.min(oldLines.length, oldEnd + context);
  const newTo = Math.min(newLines.length, newEnd + context);
  const hunk: string[] = [];
  for (let index = oldFrom; index < prefix; index += 1) hunk.push(` ${oldLines[index]}`);
  for (let index = prefix; index < oldEnd; index += 1) hunk.push(`-${oldLines[index]}`);
  for (let index = prefix; index < newEnd; index += 1) hunk.push(`+${newLines[index]}`);
  for (let index = oldEnd; index < oldTo; index += 1) hunk.push(` ${oldLines[index]}`);

  const oldCount = oldTo - oldFrom;
  const newFrom = oldFrom;
  const actualNewCount = newTo - newFrom;
  const oldStart = oldCount === 0 ? 0 : oldFrom + 1;
  const newStart = actualNewCount === 0 ? 0 : newFrom + 1;

  return [
    `diff --git a/${filePath} b/${filePath}`,
    "index 0000000..0000000 100644",
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${oldStart},${oldCount} +${newStart},${actualNewCount} @@`,
    hunk.join("\n"),
    "",
  ].join("\n");
}
