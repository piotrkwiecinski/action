import { Inputs } from "../constants.js";

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
    return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

export function setInput(name: string, value: string): void {
    process.env[getInputName(name)] = value;
}

export function clearInputs(): void {
    delete process.env[getInputName(Inputs.DeployerBinary)];
    delete process.env[getInputName(Inputs.DeployerCommand)];
    delete process.env[getInputName(Inputs.DeployerOptions)];
    delete process.env[getInputName(Inputs.DeployerVerbosity)];
    delete process.env[getInputName(Inputs.DeployerVersion)];
    delete process.env[getInputName(Inputs.SshConfig)];
    delete process.env[getInputName(Inputs.SshKnownHosts)];
    delete process.env[getInputName(Inputs.SshSkipSetup)];
    delete process.env[getInputName(Inputs.SshPrivateKey)];
}
