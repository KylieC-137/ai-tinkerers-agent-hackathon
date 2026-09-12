import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BUILD_COACH_URL || "http://localhost:3000";
const fixture = process.argv[2] || "01-tools.jpg";
const fixturePath = path.join(process.cwd(), "public", "fixtures", fixture);

async function main() {
  const image = await readFile(fixturePath);
  const response = await fetch(`${baseUrl}/api/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal:
        "My goal is to put up a hook in the wall but I'm not sure where to drill and how to do it. I'm using these hooks and I have this stud finder.",
      activityId: "wall-hook",
      state: null,
      utterance: "start",
      imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
    }),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
  if (result.model) console.log(`\nmodel=${result.model} latencyMs=${result.latencyMs}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
