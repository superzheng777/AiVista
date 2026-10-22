import { defineConfig } from "prisma/config";
import { loadJavaLocalEnvironment } from "./src/config/java-local-environment.js";

const environment = {
  ...loadJavaLocalEnvironment(process.env.AIVISTA_JAVA_LOCAL_YAML, process.env),
  ...process.env,
};
const url = new URL("mysql://127.0.0.1:3306/aivista");
url.hostname = String(environment.AIVISTA_DB_HOST ?? "127.0.0.1");
url.port = String(environment.AIVISTA_DB_PORT ?? 3306);
url.username = String(environment.AIVISTA_DB_USERNAME ?? "");
url.password = String(environment.AIVISTA_DB_PASSWORD ?? "");
url.pathname = `/${environment.AIVISTA_DB_NAME ?? "aivista"}`;

// Flyway owns DDL. This configuration is used only for introspection and client generation.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: url.href },
});
