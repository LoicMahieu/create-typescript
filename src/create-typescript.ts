
import * as execa from "execa";
import * as fs from "fs-extra";
import * as globby from "globby";
import * as path from "path";
import * as readPkg from "read-pkg";
import * as writePkg from "write-pkg";

const dependencies: string[] = [];
const devDependencies: string[] = [
  "typescript",
  "tslint",
];

const isWin = process.platform === "win32";

const npmBinRegExp = isWin
  ? /[\\/]np[mx](\.cmd)?$/
  : /\/np[mx]$/;

const npmJsRegExp = isWin
  ? /[\\/]node_modules[\\/]npm[\\/]bin[\\/]np[mx]-cli\.js$/
  : /\/node_modules\/npm\/bin\/np[mx]-cli\.js$/;

export async function install(cwd: string): Promise<void> {
  const bin = await findBin();
  await initPackage(bin, cwd);
  await installDependencies(dependencies, bin, cwd);
  await installDependencies(devDependencies, bin, cwd);
  await writePackageScripts(cwd);
  await initFiles(cwd);
}

async function checkBin(bin: string): Promise<boolean> {
  return !execa.sync(bin, ["-v"], {
    reject: false,
  }).failed;
}

async function findBin(): Promise<string> {
  const { env } = process;

  let bin = "yarn";

  if (npmJsRegExp.test(env.NPM_CLI_JS as string) ||
      npmJsRegExp.test(env.NPX_CLI_JS as string) ||
      npmBinRegExp.test(env._ as string)) {
    bin = "npm";
  }

  if (!await checkBin(bin)) {
    bin = bin === "yarn" ? "npm" : "yarn";

    if (!await checkBin(bin)) {
      throw new Error("No package manager found.");
    }
  }

  return bin;
}

async function initPackage(bin: string, cwd: string): Promise<void> {
  const initArgs = process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("-"));

  const binArgs = [
    "init",
    ...initArgs,
  ];

  await execa(bin, binArgs, { cwd, stdio: "inherit" });
}

async function installDependencies(deps: string[], bin: string, cwd: string, isDev: boolean = false): Promise<void> {
  if (deps.length <= 0) {
    return;
  }

  const args = bin === "yarn"
    ? ["add", isDev && "--dev", ...deps].filter(Boolean)
    : ["i", isDev ? "--save-dev" : "--save", ...deps];
  await execa(
    bin,
    args as ReadonlyArray<string>,
    { cwd },
  );
}

async function writePackageScripts(cwd: string): Promise<void> {
  const pkg = await readPkg(cwd);
  await writePkg(cwd, {
    ...pkg,
    files: [
      "./bin/*",
      "./lib/*",
    ],
    main: "./lib/index.js",
    typings: "./lib/index.d.ts",
    scripts: {
      ...pkg.scripts,
      build: "tsc",
      lint: "tslint -c tslint.json src/**/*.ts",
      prepublish: "npm run build",
    },
    _id: undefined,
    readme: undefined,
  });
}

async function initFiles(cwd: string) {
  const filesFromThisProject = [
    "tsconfig.json",
  ];
  const filesFromTemplate = [
    ".gitignore",
    "tslint.json",
    "README.md",
    "src/*",
  ];

  await Promise.all([
    copyFiles(
      filesFromThisProject,
      path.join(__dirname, ".."),
      cwd,
    ),
    copyFiles(
      filesFromTemplate,
      path.join(__dirname, "../template"),
      cwd,
    ),
  ]);
}

async function copyFiles(files: string[], from: string, to: string): Promise<void> {
  const expandedFiles = await globby(files, { cwd: from });

  await Promise.all(expandedFiles.map(async (file) => {
    await fs.mkdirp(path.dirname(path.join(to, file)));
    await fs.copy(path.join(from, file), path.join(to, file));
  }));
}
