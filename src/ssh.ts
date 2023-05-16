import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

import * as core from "@actions/core";
import * as exec from "@actions/exec";

interface SshOptions {
    privateKey: string;
    knownHosts: string;
    sshConfig: string;
}

export async function setup({
    privateKey,
    knownHosts,
    sshConfig
}: SshOptions): Promise<void> {
    const sshHomeDir = `${process.env["HOME"]}/.ssh`;

    if (!existsSync(sshHomeDir)) {
        mkdirSync(sshHomeDir, { recursive: true });
    }

    const authSock = "/tmp/ssh-auth.sock";
    await exec.exec("ssh-agent", ["-a", `${authSock}`]);
    core.exportVariable("SSH_AUTH_SOCK", authSock);

    if (privateKey !== "") {
        privateKey = privateKey.replace("/\r/g", "").trim() + "\n";
        await exec.exec(`echo "${privateKey}" | ssh-add -`);
    }

    if (knownHosts !== "") {
        appendFileSync(`${sshHomeDir}/known_hosts`, knownHosts, {
            mode: 0o600
        });
    } else {
        appendFileSync(`${sshHomeDir}/config`, `StrictHostKeyChecking no\n`, {
            mode: 0o600
        });
    }

    if (sshConfig !== "") {
        writeFileSync(`${sshHomeDir}/config`, sshConfig, { mode: 0o600 });
    }
}
