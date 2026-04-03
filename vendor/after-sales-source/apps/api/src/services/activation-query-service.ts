import fs from "node:fs/promises";
import type { ActivationQueryResult } from "@warranty/shared";
import { config } from "../config.js";

export interface ActivationQueryService {
  queryBySn(sn: string): Promise<ActivationQueryResult>;
}

type MockDataset = Record<string, ActivationQueryResult>;

export class MockActivationQueryService implements ActivationQueryService {
  private cache: MockDataset | null = null;

  async queryBySn(sn: string): Promise<ActivationQueryResult> {
    const dataset = await this.loadDataset();
    return (
      dataset[sn] ?? {
        success: true,
        data: {
          sn,
          activationStatus: "UNKNOWN",
          activationRecords: [],
        },
      }
    );
  }

  private async loadDataset() {
    if (this.cache) {
      return this.cache;
    }

    const content = await fs.readFile(config.activationMockFile, "utf8");
    this.cache = JSON.parse(content) as MockDataset;
    return this.cache;
  }
}

export class RealActivationQueryService implements ActivationQueryService {
  async queryBySn(sn: string): Promise<ActivationQueryResult> {
    if (!config.realBaseUrl) {
      return {
        success: false,
        errorCode: "REAL_BASE_URL_MISSING",
        errorMessage: "未配置真实激活接口地址",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.realTimeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.realAuthType === "bearer" && config.realToken) {
        headers.Authorization = `Bearer ${config.realToken}`;
      }

      if (config.realAuthType === "token" && config.realToken) {
        headers.Authorization = config.realToken;
      }

      const response = await fetch(new URL(config.realPath, config.realBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ sn }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        code?: number | string;
        message?: string;
        msg?: string;
        data?: {
          sn?: string;
          activated?: boolean;
          activatedAt?: string | null;
        } | null;
      };

      if (!response.ok) {
        return {
          success: false,
          errorCode: `HTTP_${response.status}`,
          errorMessage:
            payload.message ??
            payload.msg ??
            `真实激活接口请求失败，HTTP ${response.status}`,
        };
      }

      const successCode = String(payload.code ?? "");
      if (successCode !== "200" && successCode !== "00000") {
        return {
          success: false,
          errorCode: String(payload.code ?? "REAL_QUERY_FAILED"),
          errorMessage: payload.message ?? payload.msg ?? "真实激活接口返回失败",
        };
      }

      const activatedAt = payload.data?.activatedAt ?? null;

      return {
        success: true,
        data: {
          sn: payload.data?.sn ?? sn,
          activationStatus: payload.data?.activated ? "ACTIVATED" : "NOT_ACTIVATED",
          activationRecords: activatedAt
            ? [
                {
                  activatedAt,
                  recordType: "CURRENT_CYCLE",
                },
              ]
            : [],
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "真实激活接口调用异常";
      const resolvedMessage =
        message === "fetch failed" || message === "This operation was aborted"
          ? "真实激活接口不可达或响应超时，请检查 VPN、内网访问、网关白名单或接口地址"
          : message;
      return {
        success: false,
        errorCode: "REAL_REQUEST_ERROR",
        errorMessage: resolvedMessage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createActivationQueryService(): ActivationQueryService {
  if (config.activationMode === "real") {
    return new RealActivationQueryService();
  }
  return new MockActivationQueryService();
}
