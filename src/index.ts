import * as core from "@actions/core";
import { $, cd, fs } from "zx";

import { Inputs } from "./constants.js";

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

    if (!fs.existsSync(sshHomeDir)) {
        fs.mkdirSync(sshHomeDir);
    }

    const authSock = "/tmp/ssh-auth.sock";
    await $`ssh-agent -a ${authSock}`;
    core.exportVariable("SSH_AUTH_SOCK", authSock);

    let privateKey = core.getInput(Inputs.SshPrivateKey, { required: false });
    if (privateKey !== "") {
        privateKey = privateKey.replace("/\r/g", "").trim() + "\n";
        const p = $`ssh-add -`;
        p.stdin.write(privateKey);
        p.stdin.end();
        await p;
    }

    const knownHosts = core.getInput(Inputs.SshKnownHosts, { required: false });
    if (knownHosts !== "") {
        fs.appendFileSync(`${sshHomeDir}/known_hosts`, knownHosts);
        fs.chmodSync(`${sshHomeDir}/known_hosts`, "600");
    } else {
        fs.appendFileSync(`${sshHomeDir}/config`, `StrictHostKeyChecking no`);
        fs.chmodSync(`${sshHomeDir}/config`, "600");
    }

    const sshConfig = core.getInput(Inputs.SshConfig, { required: false });
    if (sshConfig !== "") {
        fs.writeFileSync(`${sshHomeDir}/config`, sshConfig);
        fs.chmodSync(`${sshHomeDir}/config`, "600");
    }
}

async function dep(): Promise<void> {
    let dep = core.getInput(Inputs.DeployerBinary);
    const subDirectory = core.getInput("sub-directory", {
        trimWhitespace: true
    });

    if (subDirectory !== "") {
        cd(subDirectory);
    }

    if (dep === "")
        for (const c of [
            "vendor/bin/deployer.phar",
            "vendor/bin/dep",
            "deployer.phar"
        ]) {
            if (fs.existsSync(c)) {
                dep = c;
                console.log(`Using "${c}".`);
                break;
            }
        }

    if (dep === "") {
        let version = core.getInput(Inputs.DeployerVersion, {
            required: false
        });
        if (version === "" && fs.existsSync("composer.lock")) {
            const lock = JSON.parse(fs.readFileSync("composer.lock", "utf8"));
            if (lock["packages"]) {
                version = lock["packages"].find(
                    p => p.name === "deployer/deployer"
                )?.version;
            }
            if (
                (version === "" || typeof version === "undefined") &&
                lock["packages-dev"]
            ) {
                version = lock["packages-dev"].find(
                    p => p.name === "deployer/deployer"
                )?.version;
            }
        }
        if (version === "" || typeof version === "undefined") {
            throw new Error(
                "Deployer binary not found. Please specify deployer-binary or deployer-version."
            );
        }
        version = version.replace(/^v/, "");
        const manifest = JSON.parse(
            (await $`curl -L https://deployer.org/manifest.json`).stdout
        );
        let url;
        for (const asset of manifest) {
            if (asset.version === version) {
                url = asset.url;
                break;
            }
        }
        if (typeof url === "undefined") {
            throw new Error(
                `The version "${version}"" does not exist in the "https://deployer.org/manifest.json" file."`
            );
        } else {
            console.log(`Downloading "${url}".`);
            await $`curl -LO ${url}`;
        }

        await $`sudo chmod +x deployer.phar`;
        dep = "deployer.phar";
    }

    const cmd = core
        .getInput(Inputs.DeployerCommand, { required: true })
        .split(" ");
    const ansi = core.getBooleanInput("ansi") ? "--ansi" : "--no-ansi";
    const verbosity = core.getInput(Inputs.DeployerVerbosity, {
        required: false
    });
    const options: string[] = [];
    try {
        for (const [key, value] of Object.entries(
            JSON.parse(
                core.getInput(Inputs.DeployerOptions, { required: false })
            )
        )) {
            options.push("-o", `${key}=${value}`);
        }
    } catch (e) {
        throw new Error("Invalid JSON in options");
    }

    try {
        await $`php ${dep} ${cmd} --no-interaction ${ansi} ${verbosity} ${options}`;
    } catch (err) {
        throw new Error(`Failed: dep ${cmd}`);
    }
}

main();
