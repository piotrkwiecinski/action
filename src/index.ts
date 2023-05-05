import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import * as core from "@actions/core";
import * as exec from "@actions/exec";

import { Inputs } from "./constants.js";
import { runDeployer } from "./deployer.js";

async function main(): Promise<void> {
    try {
        if (!core.getBooleanInput(Inputs.SshSkipSetup)) {
            await ssh();
        }

        await runDeployer({
            binaryPath: core.getInput(Inputs.DeployerBinary),
            version: core.getInput(Inputs.DeployerVersion),
            command: core
                .getInput(Inputs.DeployerCommand, { required: true })
                .split(" "),
            ansiOutput: core.getBooleanInput(Inputs.DeployerAnsiOutput),
            verbosity: core.getInput(Inputs.DeployerVerbosity),
            options: parseOptions(core.getInput(Inputs.DeployerOptions)),
            cwd: resolveCwd(
                core.getInput(Inputs.SubDirectory, {
                    trimWhitespace: true
                })
            )
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        core.setFailed(message);
    }
}

const parseOptions = (input: string) => {
    if (input === "") {
        return {};
    }
    try {
        return JSON.parse(input);
    } catch (e) {
        throw new Error("Invalid JSON in options");
    }
};

const resolveCwd = (path: string) => resolvePath(path === "" ? "." : path);

async function ssh(): Promise<void> {
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
    } else {
        appendFileSync(`${sshHomeDir}/config`, `StrictHostKeyChecking no`, {
            mode: 0o600
        });
    }

    const sshConfig = core.getInput(Inputs.SshConfig);
    if (sshConfig !== "") {
        writeFileSync(`${sshHomeDir}/config`, sshConfig, { mode: 0o600 });
    }
}

void main();
