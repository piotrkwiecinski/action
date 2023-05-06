import * as path from "node:path";

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest
} from "@jest/globals";
import * as fs from "fs";

import { setupSsh } from "../src/ssh";

const tempPath = path.join(__dirname, "TEMP");

let replacedEnv: jest.Replaced<typeof process.env> | undefined = undefined;

describe("ssh setup", function () {
    beforeEach(() => {
        jest.spyOn(exec, "exec").mockImplementation(async () => {
            return 0;
        });
        replacedEnv = jest.replaceProperty(process, "env", { HOME: tempPath });
    });

    afterEach(() => {
        replacedEnv?.restore();
        jest.resetAllMocks();
        jest.clearAllMocks();
        fs.rmSync(tempPath, { recursive: true });
    });

    it("should create ssh dir if doesn't exist", async () => {
        await setupSsh({
            skipSetup: false,
            sshConfig: "",
            knownHosts: "",
            privateKey: ""
        });

        expect(fs.existsSync(path.join(tempPath, ".ssh"))).toBeTruthy();
    });

    it("should bind ssh agent to a socket", async () => {
        const execFunc = jest.spyOn(exec, "exec");
        const exportVariable = jest.spyOn(core, "exportVariable");
        await setupSsh({
            skipSetup: false,
            sshConfig: "",
            knownHosts: "",
            privateKey: ""
        });

        expect(execFunc).toBeCalledWith("ssh-agent", [
            "-a",
            "/tmp/ssh-auth.sock"
        ]);
        expect(exportVariable).toBeCalledWith(
            "SSH_AUTH_SOCK",
            "/tmp/ssh-auth.sock"
        );
    });

    it("should set private key", async () => {
        const execFunc = jest.spyOn(exec, "exec");
        await setupSsh({
            skipSetup: false,
            sshConfig: "",
            knownHosts: "",
            privateKey: "test"
        });

        expect(execFunc).toHaveBeenLastCalledWith("ssh-add", ["-", "test\n"]);
    });

    it("should set strict host key check to no when known hosts are provided", async () => {
        await setupSsh({
            skipSetup: false,
            sshConfig: "",
            knownHosts: "",
            privateKey: ""
        });

        const configPath = path.join(tempPath, ".ssh/config");
        expect(fs.existsSync(configPath)).toBeTruthy();
        expect(fs.statSync(configPath).mode & 0o600).toBe(0o600);
        expect(fs.readFileSync(configPath, "utf8")).toContain(
            "StrictHostKeyChecking no\n"
        );
    });
});
