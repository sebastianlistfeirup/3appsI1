import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const [app, destination] = process.argv.slice(2);
const sites = JSON.parse(await readFile(resolve(here, "sites.json"), "utf8"));
if (!Object.hasOwn(sites, app ?? "") || !destination) {
  throw new Error(
    "Usage: node tools/mobile/prepare.mjs studio|flowlab|director /absolute/new-directory",
  );
}
const target = resolve(destination);
const pathFromRoot = relative(root, target);
if (
  !isAbsolute(destination) ||
  !pathFromRoot.startsWith("../") ||
  existsSync(target)
) {
  throw new Error(
    "Choose a new absolute directory outside this checkout. Existing Sites checkouts are never overwritten.",
  );
}
const git = (...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 96 * 1024 * 1024 });
const sourceCommit = git("rev-parse", "HEAD").toString().trim();
const dirty = git(
  "status",
  "--porcelain",
  "--",
  "apps",
  "packages",
  "services",
  "tools/mobile",
).toString();
if (dirty)
  throw new Error(
    "Commit application and web-profile changes before creating the release snapshot.",
  );
const files = [
  ".gitignore",
  ".nvmrc",
  "AGENTS.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.tools.json",
  "vitest.config.ts",
  "apps",
  "packages",
  "services",
];
await mkdir(target, { recursive: true });
const archive = resolve(target, ".source-snapshot.tar");
try {
  await writeFile(
    archive,
    git("archive", "--format=tar", sourceCommit, ...files),
  );
  execFileSync("tar", ["-xf", archive, "-C", target]);
} finally {
  await rm(archive, { force: true });
}
for (const name of Object.keys(sites)) {
  await rm(resolve(target, `apps/${name}/src/app/api`), {
    recursive: true,
    force: true,
  });
  const configPath = resolve(target, `apps/${name}/next.config.ts`);
  const config = await readFile(configPath, "utf8");
  if (!config.includes("const config: NextConfig = {"))
    throw new Error(`Review the changed Next config for ${name}.`);
  await writeFile(
    configPath,
    config.replace(
      "const config: NextConfig = {",
      'const config: NextConfig = {\n  output: "export",\n  trailingSlash: true,\n  images: { unoptimized: true },',
    ),
  );
}
await rm(resolve(target, "apps/studio/src/app/[[...path]]"), {
  recursive: true,
  force: true,
});
// The patch contains only reviewed browser-profile changes. A source drift
// failure stops preparation and requires a fresh review; it is not ignored.
execFileSync("git", ["apply", "--check", resolve(here, "web-profile.patch")], {
  cwd: target,
});
execFileSync("git", ["apply", resolve(here, "web-profile.patch")], {
  cwd: target,
});
const packagePath = resolve(target, "package.json");
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
pkg.scripts.build = `pnpm --filter @tre/${app} build && node scripts/package-static.mjs`;
await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n");
await mkdir(resolve(target, "scripts"));
await writeFile(
  resolve(target, "scripts/package-static.mjs"),
  `import { cp, rm } from "node:fs/promises";\nawait rm("dist", { recursive: true, force: true });\nawait cp("apps/${app}/out", "dist", { recursive: true });\n`,
);
await mkdir(resolve(target, ".openai"));
await writeFile(
  resolve(target, ".openai/hosting.json"),
  JSON.stringify(
    { project_id: sites[app].project_id, static: { directory: "dist" } },
    null,
    2,
  ) + "\n",
);
await writeFile(
  resolve(target, "WEB_DEMO_SOURCE.json"),
  JSON.stringify(
    {
      repository: "https://github.com/sebastianlistfeirup/3appsI1",
      sourceCommit,
      profile: "browser-local-static-web-demo",
      serverApisIncluded: false,
      localFilmRenderIncluded: false,
    },
    null,
    2,
  ) + "\n",
);
const ignorePath = resolve(target, ".gitignore");
await writeFile(
  ignorePath,
  (await readFile(ignorePath, "utf8")) + "\n.vercel/\napps/*/out/\n",
);
console.log(
  JSON.stringify(
    {
      app,
      target,
      sourceCommit,
      project_id: sites[app].project_id,
      next: "pnpm install --frozen-lockfile && pnpm build",
    },
    null,
    2,
  ),
);
