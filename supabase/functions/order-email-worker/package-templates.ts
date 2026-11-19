// Build-time only. HTML/CSS remain authoritative separate source files.
const files = {
  frame: "frame.html",
  section: "section.html",
  item: "item.html",
  detail: "detail.html",
  action: "action.html",
  css: "email.css",
} as const;
export async function expectedBundle(): Promise<string> {
  const templates: Record<string, string> = {};
  for (const [key, name] of Object.entries(files)) {
    templates[key] =
      (await Deno.readTextFile(new URL(`./templates/${name}`, import.meta.url)))
        .replace(/\r\n/g, "\n");
  }
  return JSON.stringify({ version: 1, templates }, null, 2) + "\n";
}
if (import.meta.main) {
  if (Deno.args.some((arg) => arg !== "--check")) {
    throw new Error("Unknown packaging argument");
  }
  const output = new URL("./templates/bundle.generated.json", import.meta.url);
  const expected = await expectedBundle();
  if (Deno.args.includes("--check")) {
    const actual = (await Deno.readTextFile(output)).replace(/\r\n/g, "\n");
    if (actual !== expected) {
      throw new Error("Template bundle is stale: run deno task package");
    }
    console.log("Template module matches all HTML/CSS sources.");
  } else {
    await Deno.writeTextFile(output, expected);
    console.log(
      "Generated template JSON module (no customer data or secrets).",
    );
  }
}
