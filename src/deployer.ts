interface DeployerOptions {
    ansiOptions: boolean;
    binary: string;
    command: string[];
    cwd: string;
    options: string[];
    verbosity: string;
}

export class Deployer {
    public static packageName = "deployer/deployer";
    private readonly ansiOutput: boolean;
    private readonly binary: string;
    private readonly command: string[];
    private readonly cwd: string;
    private readonly verbosity: string;
    private readonly options: string[];

    constructor(options: DeployerOptions) {
        this.ansiOutput = options.ansiOptions;
        this.binary = options.binary;
        this.command = options.command;
        this.cwd = options.cwd;
        this.verbosity = options.verbosity;
        this.options = options.options;
    }

    getCwd(): string {
        return this.cwd;
    }

    getCommand(): string[] {
        return [
            this.binary,
            ...this.command,
            "--no-interaction",
            this.ansiOutput ? "--ansi" : "--no-ansi",
            this.verbosity,
            ...this.options
        ];
    }
}
