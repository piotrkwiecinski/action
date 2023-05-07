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

const defaultOptions = {
    skipSetup: false,
    sshConfig: "",
    knownHosts: "",
    privateKey: ""
};

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
        if (fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true });
        }
    });

    it("should create ssh dir if doesn't exist", async () => {
        await setupSsh(defaultOptions);
        expect(fs.existsSync(path.join(tempPath, ".ssh"))).toBeTruthy();
    });

    it("should bind ssh agent to a socket", async () => {
        const execFunc = jest.spyOn(exec, "exec");
        const exportVariable = jest.spyOn(core, "exportVariable");
        await setupSsh(defaultOptions);

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
        const options = Object.assign({}, defaultOptions, {
            privateKey: "test"
        });
        const execFunc = jest.spyOn(exec, "exec");
        await setupSsh(options);
        expect(execFunc).toHaveBeenLastCalledWith("ssh-add", ["-", "test\n"]);
    });

    it("should set strict host key check to no when known hosts are not provided", async () => {
        await setupSsh(defaultOptions);
        const configPath = path.join(tempPath, ".ssh/config");
        expect(fs.existsSync(configPath)).toBeTruthy();
        expect(fs.statSync(configPath).mode & 0o600).toBe(0o600);
        expect(fs.readFileSync(configPath, "utf8")).toContain(
            "StrictHostKeyChecking no\n"
        );
    });

    it("should write ssh config", async () => {
        const options = Object.assign({}, defaultOptions, {
            sshConfig: `
Host *
  ServerAliveInterval 300
  ServerAliveCountMax 2
  ForwardAgent yes
  TCPKeepAlive yes                       
`
        });
        await setupSsh(options);
        const configPath = path.join(tempPath, ".ssh/config");
        expect(fs.existsSync(configPath)).toBeTruthy();
        expect(fs.statSync(configPath).mode & 0o600).toBe(0o600);
        expect(fs.readFileSync(configPath, "utf8")).toContain("Host *");
    });

    it("should set known hosts", async () => {
        const knownHosts = `
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=        
        `;
        const options = Object.assign({}, defaultOptions, {
            knownHosts: knownHosts
        });
        await setupSsh(options);
        const knownHostsPath = path.join(tempPath, ".ssh/known_hosts");
        expect(fs.existsSync(knownHostsPath)).toBeTruthy();
        expect(fs.readFileSync(knownHostsPath, "utf8")).toContain(knownHosts);
    });

    it("should skip when flag is set", async () => {
        const execFunc = jest.spyOn(exec, "exec");
        const options = Object.assign({}, defaultOptions, {
            skipSetup: true
        });

        await setupSsh(options);

        expect(execFunc).not.toBeCalled();
    });
});
