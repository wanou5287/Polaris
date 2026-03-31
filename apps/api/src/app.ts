import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024,
  });
  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
    },
  });
  await registerRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    const err = error as {
      name?: string;
      code?: string;
      statusCode?: number;
      message?: string;
    };

    if (
      err.name === "FST_REQ_FILE_TOO_LARGE" ||
      err.code === "FST_REQ_FILE_TOO_LARGE" ||
      err.statusCode === 413
    ) {
      return reply.status(413).send({
        success: false,
        error: "上传文件过大，请控制在 20MB 以内，或先拆分 Excel 后再上传",
      });
    }

    app.log.error(error);
    return reply.status(err.statusCode ?? 500).send({
      success: false,
      error: err.message ?? "服务器内部错误",
    });
  });

  return app;
}
