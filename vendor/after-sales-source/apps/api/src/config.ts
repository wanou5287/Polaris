import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { activationModes, type ActivationMode } from "@warranty/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../../..");

dotenvConfig({
  path: path.resolve(workspaceRoot, ".env"),
});

function getActivationMode(): ActivationMode {
  const mode = process.env.ACTIVATION_MODE ?? "mock";
  if (activationModes.includes(mode as ActivationMode)) {
    return mode as ActivationMode;
  }
  return "mock";
}

function getActivationMockFile(): string {
  const configured = process.env.ACTIVATION_MOCK_FILE;
  if (configured) {
    return path.resolve(workspaceRoot, configured);
  }

  const packagedCandidate = path.resolve(workspaceRoot, "../../../mock/activation-data.json");
  if (existsSync(packagedCandidate)) {
    return packagedCandidate;
  }

  return path.resolve(workspaceRoot, "./mock/activation-data.json");
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  activationMode: getActivationMode(),
  activationMockFile: getActivationMockFile(),
  realBaseUrl: process.env.ACTIVATION_REAL_BASE_URL ?? "",
  realPath: process.env.ACTIVATION_REAL_PATH ?? "/wo/tt/main/activation/info",
  realTimeoutMs: Number(process.env.ACTIVATION_REAL_TIMEOUT_MS ?? 5000),
  realAuthType: process.env.ACTIVATION_REAL_AUTH_TYPE ?? "",
  realToken: process.env.ACTIVATION_REAL_TOKEN ?? "",
};
