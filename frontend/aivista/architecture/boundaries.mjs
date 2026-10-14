import path from "node:path";
import { readFileSync } from "node:fs";

const publicApi = JSON.parse(readFileSync(new URL("./public-api.json", import.meta.url), "utf8"));
const layers = { app: 5, widgets: 4, features: 3, entities: 2, components: 1, shared: 0 };
const featureDependencies = {
  "account-menu": ["auth"],
  generation: ["auth", "user-agreement", "assets", "image-access"],
  "image-access": ["assets", "inspiration"],
  inspiration: ["auth", "assets", "publication", "public-user"],
};
const entityTypes = {
  "entities/image-resource/model/resource-cache": "entities/creation-session/model/session",
  "entities/notification/model/notification": "entities/image-resource/model/image-resource",
};
const fixtureConsumers = [
  "widgets/generation-workspace/ui/generation-workspace.test.tsx",
  "app/_bootstrap/user-event-stream-initializer.test.tsx",
];
const moduleOf = (file) =>
  file
    .split("/")
    .slice(0, ["entities", "features", "widgets"].includes(file.split("/")[0]) ? 2 : 1)
    .join("/");
const withoutExtension = (file) => file.replace(/\.(tsx?|jsx?|mjs)$/, "");

/** Resolve both aliases and relative imports before checking the same boundaries. */
export function boundaryViolation(from, specifier, { typeOnly = false, names = [] } = {}) {
  const target = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? path.posix.join(path.posix.dirname(from), specifier)
      : null;
  if (!target) return null;
  const to = withoutExtension(path.posix.normalize(target));
  const source = withoutExtension(from);
  const test = /\.test\./.test(from) || from.includes(".test-fixture.");
  if (to.includes(".test")) {
    if (!test) return "生产代码不能引用测试或 fixture。";
    if (moduleOf(from) === moduleOf(to)) return null;
    if (to === "features/generation/model/session-events.test-fixture" && fixtureConsumers.includes(from)) return null;
    return "跨模块测试 fixture 未列入白名单。";
  }
  const [fromLayer, fromModule] = from.split("/");
  const [toLayer, toModule] = to.split("/");
  if (!(toLayer in layers)) return "源码引用必须位于已定义的分层内。";
  if (layers[fromLayer] < layers[toLayer] || (fromLayer === "entities" && toLayer === "components")) {
    return "不能反向依赖上层模块。";
  }
  if (moduleOf(from) === moduleOf(to)) return null;
  if (fromLayer === toLayer) {
    if (fromLayer === "widgets") return "widgets 之间由 app 组合，不能互相引用。";
    if (fromLayer === "features" && !featureDependencies[fromModule]?.includes(toModule))
      return "该 feature 横向依赖未获允许。";
    if (fromLayer === "entities" && !(typeOnly && entityTypes[source] === to)) return "跨实体仅允许已登记的类型引用。";
  }
  if (["widgets", "features", "entities"].includes(toLayer)) {
    if (!publicApi[to]) return "请使用该模块已登记的对外入口。";
    if (!test && names.some((name) => !publicApi[to].includes(name))) return "导入符号未列入模块公开 API。";
  }
  return null;
}

export const boundaries = {
  meta: { type: "problem", schema: [], messages: { violation: "{{reason}}（{{specifier}}）" } },
  create(context) {
    const normalized = context.filename.replaceAll("\\", "/");
    const from = normalized.slice(normalized.lastIndexOf("/src/") + 5);
    function check(node) {
      const specifier = node.source?.value;
      if (typeof specifier !== "string") return;
      const specifiers = node.specifiers ?? [];
      const typeOnly =
        node.type === "TSImportType" ||
        node.importKind === "type" ||
        node.exportKind === "type" ||
        (specifiers.length > 0 && specifiers.every((item) => item.importKind === "type" || item.exportKind === "type"));
      const names = specifiers.map((item) => item.imported?.name ?? item.imported?.value ?? item.local?.name ?? "*");
      if (node.type === "TSImportType") {
        // import("module").Namespace.Member exposes the root export, Namespace.
        let qualifier = node.qualifier;
        while (qualifier?.type === "TSQualifiedName") qualifier = qualifier.left;
        names.push(qualifier?.name ?? "*");
      }
      if (node.type === "ImportDeclaration")
        specifiers.forEach((item, index) => {
          if (item.type === "ImportDefaultSpecifier") names[index] = "default";
          if (item.type === "ImportNamespaceSpecifier") names[index] = "*";
        });
      if (node.type === "ExportAllDeclaration" || node.type === "ImportExpression") names.push("*");
      const reason = boundaryViolation(from, specifier, { typeOnly, names });
      if (reason) context.report({ node, messageId: "violation", data: { reason, specifier } });
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      TSImportType: check,
    };
  },
};
