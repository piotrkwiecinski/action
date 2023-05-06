import { resolve as resolvePath } from "node:path";

import * as core from "@actions/core";

import { Inputs } from "./constants.js";
import { runDeployer } from "./deployer.js";
import { setupSsh } from "./ssh";

async function main(): Promise<void> {
    try {
        await setupSsh({
            privateKey: core.getInput(Inputs.SshPrivateKey),
            sshConfig: core.getInput(Inputs.SshConfig),
            skipSetup: core.getBooleanInput(Inputs.SshSkipSetup),
            knownHosts: core.getInput(Inputs.SshKnownHosts)
        });

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

void main();
