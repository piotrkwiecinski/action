import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from "node:fs";
import { join as joinPath, resolve as resolvePath } from "node:path";

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { HttpClient } from "@actions/http-client";
import * as tc from "@actions/tool-cache";

import { Inputs } from "./constants.js";
import { Deployer } from "./deployer.js";

interface DeployerManifestEntry {
    name: string;
    sha1: string;
    url: string;
    version: string;
}

async function main(): Promise<void> {
    try {
        await ssh();
        await dep();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        core.setFailed(message);
    }
}

async function ssh(): Promise<void> {
    if (core.getBooleanInput(Inputs.SshSkipSetup)) {
        return;
    }

    const sshHomeDir = `${process.env["HOME"]}/.ssh`;

    if (!existsSync(sshHomeDir)) {
        mkdirSync(sshHomeDir);
    }

    const authSock = "/tmp/ssh-auth.sock";
    await exec.exec("ssh-agent", ["-a", `${authSock}`]);
    core.exportVariable("SSH_AUTH_SOCK", authSock);

    let privateKey = core.getInput(Inputs.SshPrivateKey);
    if (privateKey !== "") {
        privateKey = privateKey.replace("/\r/g", "").trim() + "\n";
        await exec.exec("ssh-add", ["-", privateKey]);
    }

    const knownHosts = core.getInput(Inputs.SshKnownHosts);
    if (knownHosts !== "") {
        appendFileSync(`${sshHomeDir}/known_hosts`, knownHosts, {
            mode: 0o600
        });
        // chmodSync(`${sshHomeDir}/known_hosts`, "600");
    } else {
        appendFileSync(`${sshHomeDir}/config`, `StrictHostKeyChecking no`, {
            mode: 0o600
        });
        // chmodSync(`${sshHomeDir}/config`, "600");
    }

    const sshConfig = core.getInput(Inputs.SshConfig);
    if (sshConfig !== "") {
        writeFileSync(`${sshHomeDir}/config`, sshConfig, { mode: 0o600 });
        // chmodSync(`${sshHomeDir}/config`, "600");
    }
}

async function dep(): Promise<void> {
    let dep = core.getInput(Inputs.DeployerBinary);
    const subDirectory = core.getInput(Inputs.SubDirectory, {
        trimWhitespace: true
    });

    const basePath =
        subDirectory !== "" ? resolvePath(subDirectory) : resolvePath(".");

    if (dep === "")
        for (const c of [
            joinPath(basePath, "vendor/bin/deployer.phar"),
            joinPath(basePath, "vendor/bin/dep"),
            joinPath(basePath, "deployer.phar")
        ]) {
            if (existsSync(c)) {
                dep = c;
                console.log(`Using "${c}".`);
                break;
            }
        }

    if (dep === "") {
        let version = core.getInput(Inputs.DeployerVersion);
        if (version === "" && existsSync(joinPath(basePath, "composer.lock"))) {
            const lock = JSON.parse(
                readFileSync(joinPath(basePath, "composer.lock"), "utf8")
            );
            const findPackage = (
                lockFile: object,
                section: string,
                packageName: string
            ) =>
                lockFile[section]
                    ? lockFile[section]?.find(p => p.name === packageName)
                    : undefined;
            version = findPackage(
                lock,
                "packages",
                Deployer.packageName
            )?.version;

            if (version === "" || typeof version === "undefined") {
                version = findPackage(
                    lock,
                    "packages-dev",
                    Deployer.packageName
                )?.version;
            }
        }
        if (version === "" || typeof version === "undefined") {
            throw new Error(
                "Deployer binary not found. Please specify deployer-binary or deployer-version."
            );
        }
        version = version.replace(/^v/, "");
        const httpClient = new HttpClient();
        const response = await httpClient.getJson<Array<DeployerManifestEntry>>(
            "https://deployer.org/manifest.json"
        );
        const asset = response?.result?.find(
            asset => asset.version === version
        );
        const url = asset?.url;

        if (typeof url === "undefined") {
            throw new Error(
                `The version "${version}"" does not exist in the "" file."`
            );
        } else {
            console.log(`Downloading "${url}".`);
            dep = await tc.downloadTool(
                url,
                joinPath(basePath, "deployer.phar")
            );
        }

        await exec.exec("chmod", ["+x", "deployer.phar"], {
            failOnStdErr: true,
            cwd: basePath
        });
    }

    const parseOptions = (input: string) => {
        if (input === "") {
            return [];
        }

        try {
            return Object.entries(JSON.parse(input)).flatMap(([key, value]) => [
                "-o",
                `${key}=>${value}`
            ]);
        } catch (e) {
            throw new Error("Invalid JSON in options");
        }
    };

    const deployer = new Deployer({
        binary: dep,
        command: core
            .getInput(Inputs.DeployerCommand, { required: true })
            .split(" "),
        cwd: basePath,
        ansiOptions: core.getBooleanInput(Inputs.DeployerAnsiOutput),
        verbosity: core.getInput(Inputs.DeployerVerbosity),
        options: parseOptions(core.getInput(Inputs.DeployerOptions))
    });

    const command = deployer.getCommand();

    try {
        await exec.exec("php", command, {
            failOnStdErr: true,
            cwd: deployer.getCwd()
        });
    } catch (err) {
        throw new Error(`Failed: dep ${command.join(" ")}`);
    }
}

void main();

export default main;
