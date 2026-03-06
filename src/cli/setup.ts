import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { ImapFlow } from "imapflow";
import OpenAI from "openai";
import { ZMAIL_HOME } from "~/lib/config";

interface SetupConfig {
  imap: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  openai: {
    apiKey: string;
  };
  sync: {
    defaultSince: string;
  };
}

/** Derive IMAP host/port from email domain. Returns null if unknown. */
function deriveImapSettings(email: string): { host: string; port: number } | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  
  if (domain === "gmail.com") {
    return { host: "imap.gmail.com", port: 993 };
  }
  // Add more providers as needed
  return null;
}

/** Prompt user for input with optional default. */
function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const displayValue = defaultValue ? ` [${defaultValue}]` : "";
    rl.question(`${question}${displayValue}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/** Validate IMAP credentials by attempting connection. */
async function validateImap(config: { host: string; port: number; user: string; password: string }): Promise<boolean> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.password },
    logger: false,
    connectionTimeout: 10000,
  });
  
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch {
    return false;
  }
}

/** Validate OpenAI API key by making a test call. */
async function validateOpenAI(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}

/** Load existing config.json if it exists. */
function loadExistingConfig(): Partial<SetupConfig> | null {
  const configPath = join(ZMAIL_HOME, "config.json");
  if (!existsSync(configPath)) return null;
  
  try {
    const content = readFileSync(configPath, "utf8");
    const json = JSON.parse(content);
    return {
      imap: json.imap || {},
      sync: json.sync || {},
    } as Partial<SetupConfig>;
  } catch {
    return null;
  }
}

/** Load existing .env if it exists. */
function loadExistingEnv(): { password?: string; apiKey?: string } {
  const envPath = join(ZMAIL_HOME, ".env");
  if (!existsSync(envPath)) return {};
  
  const content = readFileSync(envPath, "utf8");
  const result: { password?: string; apiKey?: string } = {};
  
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^ZMAIL_IMAP_PASSWORD=(.*)$/);
    if (match) {
      result.password = match[1];
      continue;
    }
    const openaiMatch = trimmed.match(/^ZMAIL_OPENAI_API_KEY=(.*)$/);
    if (openaiMatch) {
      result.apiKey = openaiMatch[1];
    }
  }
  
  return result;
}

/** Mask secret value for display. */
function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 4) + "...";
}

/** Check if running in non-interactive environment (agent, CI, piped stdin). */
function isNonInteractive(): boolean {
  // stdin.isTTY is false when stdin is piped, redirected, or not a TTY (agent environments)
  if (!process.stdin.isTTY) return true;
  
  // Also check for common CI/agent environment variables
  const agentEnvVars = [
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CIRCLECI",
    "JENKINS_URL",
    "CURSOR_AGENT",
    "CLAUDE_AGENT",
    "ANTHROPIC_API_KEY", // Often set in agent contexts
  ];
  
  return agentEnvVars.some((key) => process.env[key] !== undefined);
}

interface SetupOptions {
  noValidate?: boolean;
  clean?: boolean;
  yes?: boolean;
}

export async function runSetup(options: SetupOptions | boolean = {}): Promise<void> {
  // Handle legacy boolean parameter for backwards compatibility
  const opts: SetupOptions = typeof options === "boolean" ? { noValidate: options } : options;
  const { noValidate = false, clean = false, yes = false } = opts;
  
  // Detect non-interactive environment
  if (isNonInteractive()) {
    console.error("zmail setup requires an interactive terminal.");
    console.error("");
    console.error("To set up zmail:");
    console.error("  1. Run 'zmail setup' in an interactive terminal");
    console.error("  2. Or manually create ~/.zmail/config.json and ~/.zmail/.env");
    console.error("");
    console.error("Example config.json:");
    console.error('  {');
    console.error('    "imap": {');
    console.error('      "host": "imap.gmail.com",');
    console.error('      "port": 993,');
    console.error('      "user": "you@gmail.com"');
    console.error('    },');
    console.error('    "sync": {');
    console.error('      "defaultSince": "1y",');
    console.error('      "mailbox": "",');
    console.error('      "excludeLabels": ["Trash", "Spam"]');
    console.error('    }');
    console.error('  }');
    console.error("");
    console.error("Example ~/.zmail/.env:");
    console.error("  ZMAIL_IMAP_PASSWORD=your-app-password");
    console.error("  ZMAIL_OPENAI_API_KEY=sk-...");
    console.error("");
    process.exit(1);
  }
  
  // Handle --clean flag
  if (clean) {
    const configPath = join(ZMAIL_HOME, "config.json");
    const envPath = join(ZMAIL_HOME, ".env");
    const dataPath = join(ZMAIL_HOME, "data");
    const hasExisting = existsSync(configPath) || existsSync(envPath) || existsSync(dataPath);
    
    if (hasExisting) {
      if (!yes) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question("This will delete all existing config and data. Continue? (yes/no): ", resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
          console.log("Cancelled.");
          process.exit(0);
        }
      }
      
      console.log("Cleaning existing config and data...");
      if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(envPath)) rmSync(envPath);
      if (existsSync(dataPath)) rmSync(dataPath, { recursive: true, force: true });
      console.log("Done.\n");
    }
  }
  
  // Ensure ZMAIL_HOME exists
  mkdirSync(ZMAIL_HOME, { recursive: true });
  
  const existingConfig = loadExistingConfig();
  const existingEnv = loadExistingEnv();
  const isFirstRun = !existingConfig && !existingEnv.password;
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  try {
    if (isFirstRun) {
      console.log("\nzmail setup — let's get you connected.\n");
    } else {
      console.log("\nzmail setup — updating existing config.\n");
    }
    
    // Email address
    const emailDefault = existingConfig?.imap?.user || "";
    let email = await prompt(rl, "Email address", emailDefault);
    if (!email) {
      console.error("Email address is required.");
      process.exit(1);
    }
    
    // Derive IMAP settings from email
    const derived = deriveImapSettings(email);
    const hostDefault = existingConfig?.imap?.host || derived?.host || "imap.gmail.com";
    const portDefault = existingConfig?.imap?.port || derived?.port || 993;
    
    if (derived) {
      console.log(`  → ${derived.host === "imap.gmail.com" ? "Gmail" : "Provider"} detected (${derived.host}:${derived.port})`);
    }
    
    // IMAP host (skip if derived)
    let host = hostDefault;
    if (!derived) {
      host = await prompt(rl, "IMAP host", hostDefault);
    }
    
    // IMAP port (skip if derived)
    let port = portDefault;
    if (!derived) {
      const portStr = await prompt(rl, "IMAP port", String(portDefault));
      port = parseInt(portStr, 10) || portDefault;
    }
    
    // IMAP password
    const passwordDefault = existingEnv.password ? maskSecret(existingEnv.password) : "";
    console.log("\nIMAP app password (create one at https://myaccount.google.com/apppasswords):");
    let password = await prompt(rl, "IMAP app password", passwordDefault);
    
    // If user entered the masked default (or just pressed Enter), use the actual value
    if ((password === passwordDefault || password === "") && existingEnv.password) {
      password = existingEnv.password;
    }
    
    if (!password) {
      console.error("IMAP password is required.");
      process.exit(1);
    }
    
    // Validate IMAP
    if (!noValidate) {
      process.stdout.write("  ✓ Connecting... ");
      const imapValid = await validateImap({ host, port, user: email, password });
      if (imapValid) {
        console.log(`Connected to ${host} as ${email}`);
      } else {
        console.log("Failed");
        console.error("  ✗ Could not connect. Check your credentials and try again.");
        process.exit(1);
      }
    }
    
    // OpenAI API key
    const apiKeyDefault = existingEnv.apiKey ? maskSecret(existingEnv.apiKey) : "";
    console.log("\nOpenAI API key (for semantic search — https://platform.openai.com/api-keys):");
    let apiKey = await prompt(rl, "OpenAI API key", apiKeyDefault);
    
    // If user entered the masked default (or just pressed Enter), use the actual value
    if ((apiKey === apiKeyDefault || apiKey === "") && existingEnv.apiKey) {
      apiKey = existingEnv.apiKey;
    }
    
    if (!apiKey) {
      console.error("OpenAI API key is required.");
      process.exit(1);
    }
    
    // Validate OpenAI
    if (!noValidate) {
      process.stdout.write("  ✓ Validating... ");
      const openaiValid = await validateOpenAI(apiKey);
      if (openaiValid) {
        console.log("API key valid");
      } else {
        console.log("Failed");
        console.error("  ✗ Invalid API key. Check your key and try again.");
        process.exit(1);
      }
    }
    
    // Sync default duration
    const defaultSince = existingConfig?.sync?.defaultSince || "1y";
    const since = await prompt(rl, "\nSync default duration (e.g. 7d, 5w, 3m, 2y)", defaultSince);
    
    // Write config.json
    const configJson = {
      imap: {
        host,
        port,
        user: email,
      },
      sync: {
        defaultSince: since || defaultSince,
        mailbox: "",
        excludeLabels: ["Trash", "Spam"],
      },
    };
    
    const configPath = join(ZMAIL_HOME, "config.json");
    writeFileSync(configPath, JSON.stringify(configJson, null, 2) + "\n");
    
    // Write .env
    const envContent = `ZMAIL_IMAP_PASSWORD=${password}
ZMAIL_OPENAI_API_KEY=${apiKey}
`;
    const envPath = join(ZMAIL_HOME, ".env");
    writeFileSync(envPath, envContent);
    
    console.log(`\nConfig saved to ${ZMAIL_HOME}/`);
    
    // Ask if user wants to start sync in background
    const startSyncAnswer = await prompt(rl, "\nStart syncing email now? (yes/no)", "yes");
    const shouldStartSync = startSyncAnswer.toLowerCase() === "yes" || startSyncAnswer.toLowerCase() === "y" || startSyncAnswer === "";
    
    if (shouldStartSync) {
      // Spawn sync in background process
      const syncSince = since || defaultSince;
      console.log(`\nStarting sync in background (--since ${syncSince})...`);
      
      // Find the entrypoint script path relative to project root
      // import.meta.dir is src/cli/, so go up to src/ then use index.ts
      const entrypointScript = join(import.meta.dir, "..", "index.ts");
      
      // Spawn detached process - redirect output so it doesn't interfere with setup
      const proc = Bun.spawn({
        cmd: ["bun", "run", entrypointScript, "sync", "--since", syncSince],
        cwd: process.cwd(),
        env: { ...process.env, ZMAIL_HOME: process.env.ZMAIL_HOME || ZMAIL_HOME },
        stdout: "pipe", // Don't inherit - let it run silently in background
        stderr: "pipe",
        detached: true,
      });
      
      // Don't wait for it - let it run in background
      proc.unref();
      
      console.log("Sync started in background. Use 'zmail status' to check progress.");
    } else {
      console.log("Run `zmail sync --since 7d` to start initial sync, then `zmail refresh` for frequent updates.");
    }
    console.log("");
  } finally {
    rl.close();
  }
}
