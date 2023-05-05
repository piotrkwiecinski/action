import { existsSync, readFileSync } from "node:fs";

import * as exec from "@actions/exec";
import { HttpClient } from "@actions/http-client";
import * as tc from "@actions/tool-cache";
import { join as joinPath } from "path";

const packageName = "deployer/deployer";

interface Options {
    [key: string]: string;
}

interface BaseOptions {
    command: string[];
    ansiOutput: boolean;
    options: Options;
    verbosity: string;
}

interface CommandOptions extends BaseOptions {
    binary: string;
}

interface DeployerOptions extends BaseOptions {
    cwd: string;
    binaryPath: string;
    version: string;
}

function getCommand(options: CommandOptions): string[] {
    const depOptions = Object.entries(options.options).flatMap(
        ([key, value]) => ["-o", `${key}=>${value}`]
    );
    return [
        options.binary,
        ...options.command,
        "--no-interaction",
        options.ansiOutput ? "--ansi" : "--no-ansi",
        options.verbosity,
        ...depOptions
    ];
}

interface DeployerManifestEntry {
    name: string;
    sha1: string;
    url: string;
    version: string;
}

async function fetchDeployerVersionsFromManifest(): Promise<
    DeployerManifestEntry[] | null
> {
    const httpClient = new HttpClient();
    const response = await httpClient.getJson<Array<DeployerManifestEntry>>(
        "https://deployer.org/manifest.json"
    );

    return response.result;
}

async function downloadBinary(version: string, dest?: string): Promise<string> {
    const response = await fetchDeployerVersionsFromManifest();
    const asset = response?.find(e => e.version === version);
    const url = asset?.url;
    if (typeof url === "undefined") {
        throw new Error(
            `The version "${version}"" does not exist in the "" file."`
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

async function locateDeployerBinary({
    binaryPath,
    version,
    cwd
}: DeployerBinaryLocatorOptions): Promise<string> {
    if (binaryPath !== "") {
        if (existsSync(binaryPath)) {
            return binaryPath;
        } else {
            throw new Error(`Deployer binary "${binaryPath}" does not exist.`);
        }
    }

    for (const c of [
        joinPath(cwd, "vendor/bin/deployer.phar"),
        joinPath(cwd, "vendor/bin/dep"),
        joinPath(cwd, "deployer.phar")
    ]) {
        if (existsSync(c)) {
            console.log(`Using "${c}".`);
            return c;
        }
    }

    if (version === "" && existsSync(joinPath(cwd, "composer.lock"))) {
        const lock = JSON.parse(
            readFileSync(joinPath(cwd, "composer.lock"), "utf8")
        );
        const findPackage = (lockFile: object, section: string) =>
            lockFile[section]
                ? lockFile[section]?.find(p => p.name === packageName)
                : undefined;
        version = findPackage(lock, "packages")?.version;

        if (version === "" || typeof version === "undefined") {
            version = findPackage(lock, "packages-dev")?.version;
        }
    }
    if (version === "" || typeof version === "undefined") {
        throw new Error(
            "Deployer binary not found. Please specify deployer-binary or deployer-version."
        );
    }

    const dep = await downloadBinary(
        version.replace(/^v/, ""),
        joinPath(cwd, "deployer.phar")
    );

    await exec.exec("chmod", ["+x", "deployer.phar"], {
        failOnStdErr: true,
        cwd: cwd
    });

    return dep;
}

export async function run({ cwd, ...options }: DeployerOptions) {
    const binary = await locateDeployerBinary({
        binaryPath: options.binaryPath,
        version: options.version,
        cwd
    });
    const command = getCommand({ binary, ...options });
    try {
        await exec.exec("php", command, {
            failOnStdErr: true,
            cwd: cwd
        });
    } catch (err) {
        throw new Error(`Failed: dep ${command.join(" ")}`);
    }
}
