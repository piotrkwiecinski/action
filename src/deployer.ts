import * as fs from "node:fs";
import * as path from "node:path";

import * as exec from "@actions/exec";
import { HttpClient } from "@actions/http-client";
import * as tc from "@actions/tool-cache";

interface Options {
    [key: string]: string;
}

interface DeployerArguments {
    command: string[];
    ansiOutput: boolean;
    options: Options;
    verbosity: string;
}

export async function run(
    binary: string,
    args: DeployerArguments,
    cwd: string
) {
    const commandArgs = prepareArguments(args);
    try {
        await exec.exec("php", [binary, ...commandArgs], {
            failOnStdErr: true,
            cwd: cwd
        });
    } catch (err) {
        throw new Error(`Failed: dep ${binary} ${commandArgs.join(" ")}`);
    }
}

function prepareArguments(args: DeployerArguments): string[] {
    const depOptions = Object.entries(args.options).flatMap(([key, value]) => [
        "-o",
        `${key}=>${value}`
    ]);
    return [
        ...args.command,
        "--no-interaction",
        args.ansiOutput ? "--ansi" : "--no-ansi",
        args.verbosity,
        ...depOptions
    ];
}

interface DeployerManifestEntry {
    name: string;
    sha1: string;
    url: string;
    version: string;
}

async function fetchVersionsFromManifest(): Promise<
    DeployerManifestEntry[] | null
> {
    const httpClient = new HttpClient("", [], {
        allowRedirects: true
    });

    const { result } = await httpClient.getJson<Array<DeployerManifestEntry>>(
        "https://deployer.org/manifest.json"
    );

    return result;
}

async function downloadBinary(version: string, dest?: string): Promise<string> {
    const response = await fetchVersionsFromManifest();
    const url = response?.find(e => e.version === version)?.url;
    if (typeof url === "undefined") {
        throw new Error(
            `The version "${version}"does not exist in the "" file."`
        );
    }

    console.log(`Downloading "${url}".`);

    return await tc.downloadTool(url, dest);
}

interface DeployerBinaryLocatorOptions {
    binaryPath: string;
    version: string;
    cwd: string;
}

export async function locateBinary({
    binaryPath,
    version,
    cwd
}: DeployerBinaryLocatorOptions): Promise<string> {
    if (binaryPath !== "") {
        if (fs.existsSync(binaryPath)) {
            return binaryPath;
        } else {
            throw new Error(`Deployer binary "${binaryPath}" does not exist.`);
        }
    }
    const localBinary = [
        "vendor/bin/deployer.phar",
        "vendor/bin/dep",
        "deployer.phar"
    ]
        .map(b => path.join(cwd, b))
        .find(b => fs.existsSync(b));
    if (localBinary) {
        console.log(`Using "${localBinary}".`);
        return localBinary;
    }

    const composerPath = path.join(cwd, "composer.lock");
    if (version === "" && fs.existsSync(composerPath)) {
        const lock = JSON.parse(fs.readFileSync(composerPath, "utf8"));
        version = findDeployerVersionInComposerLock(lock) ?? "";
    }

    if (version === "") {
        throw new Error(
            "Deployer binary not found. Please specify deployer-binary or deployer-version."
        );
    }

    const pharPath = path.join(cwd, "deployer.phar");
    const dep = await downloadBinary(version.replace(/^v/, ""), pharPath);

    await exec.exec("chmod", ["+x", pharPath], {
        failOnStdErr: true
    });

    return dep;
}

interface PartialComposerPackage {
    name: string;
    version: string;
}

interface PartialComposerLock {
    package: Array<PartialComposerPackage>;
    "package-dev": Array<PartialComposerPackage>;
}

function findDeployerVersionInComposerLock({
    package: pkg,
    [`package-dev`]: pkgDev
}: PartialComposerLock) {
    return [...pkg, ...pkgDev].find(p => p?.name === "deployer/deployer")
        ?.version;
}
