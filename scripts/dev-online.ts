// Opt-in development UI against the project's online services and real records.
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
if (!existsSync(".env.production.local")) throw Error("Fetch project credentials to .env.production.local first; never commit this file.");
const result = dotenv.config({ path: ".env.production.local", override: true, quiet: true });
if (result.error) throw result.error;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", AUTH_URL: "http://localhost:3000", APP_ORIGIN: "http://localhost:3000", PAYMENT_MODE: "production" };
console.log("Development UI uses online project records. Sandbox topups are disabled.");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "localhost", "--port", "3000"], { env, stdio: "inherit", windowsHide: true });
child.on("error", () => { console.error("Could not start development server"); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
