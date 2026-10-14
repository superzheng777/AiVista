import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { boundaryViolation as check } from "./boundaries.mjs";

const eslint = new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });

for (const { name, file, code, error } of [
  {
    name: "ordinary type imports still enforce layer direction",
    file: "shared/probe.ts",
    code: 'import type { ProfileHero } from "@/widgets/user-profile/ui/profile-hero"; export type T = typeof ProfileHero;',
    error: "不能反向依赖上层模块",
  },
  {
    name: "inline typeof imports cannot bypass layer direction",
    file: "shared/probe.ts",
    code: 'export type T = typeof import("@/widgets/user-profile/ui/profile-hero").ProfileHero;',
    error: "不能反向依赖上层模块",
  },
  {
    name: "relative inline imports cannot bypass private entries",
    file: "app/probe.ts",
    code: 'export type T = typeof import("../widgets/user-profile/ui/profile-hero").ProfileHero;',
    error: "对外入口",
  },
  {
    name: "inline imports check the root of a qualified exported name",
    file: "app/probe.ts",
    code: 'export type T = import("@/features/auth/model/auth-store").Private.Nested;',
    error: "导入符号",
  },
  {
    name: "unqualified module types cannot expose all private exports",
    file: "app/probe.ts",
    code: 'export type T = typeof import("@/features/auth/model/auth-store");',
    error: "导入符号",
  },
  {
    name: "public inline value types are allowed",
    file: "app/probe.ts",
    code: 'export type T = typeof import("@/features/auth/model/auth-store").useAuthStore;',
    error: null,
  },
  {
    name: "the registered cross-entity type exception allows inline imports",
    file: "entities/image-resource/model/resource-cache.ts",
    code: 'export type T = import("@/entities/creation-session/model/session").SessionDetail;',
    error: null,
  },
  {
    name: "ordinary cross-entity type imports remain allowed",
    file: "entities/image-resource/model/resource-cache.ts",
    code: 'import type { SessionDetail } from "@/entities/creation-session/model/session"; export type T = SessionDetail;',
    error: null,
  },
  {
    name: "the cross-entity exception does not apply to other consuming files",
    file: "entities/image-resource/model/image-resource.ts",
    code: 'export type T = import("@/entities/creation-session/model/session").SessionDetail;',
    error: "跨实体",
  },
]) {
  test(`ESLint parser: ${name}`, async () => {
    const [result] = await eslint.lintText(code, { filePath: `src/${file}` });
    assert.equal(result.fatalErrorCount, 0);
    const messages = result.messages.filter((message) => message.ruleId === "architecture/boundaries");
    assert.equal(messages.length, error ? 1 : 0);
    if (error) assert.ok(messages[0].message.includes(error), messages[0].message);
  });
}

test("relative paths cannot bypass the layer boundary", () => {
  assert.ok(check("shared/api/client.ts", "../../features/auth/model/auth-store"));
  assert.ok(check("entities/user/model/user.ts", "../../../components/ui/button"));
  assert.equal(check("components/ui/button.tsx", "../../shared/lib/cn"), null);
});
test("feature dependencies and private entry points are both checked", () => {
  assert.equal(
    check("features/generation/ui/generation-composer.tsx", "@/features/auth/model/auth-store", {
      names: ["useAuthStore"],
    }),
    null,
  );
  assert.ok(check("features/auth/ui/auth-dialog.tsx", "@/features/generation/ui/generation-composer"));
  assert.ok(check("app/page.tsx", "@/widgets/user-profile/ui/profile-hero"));
  assert.ok(check("app/page.tsx", "@/features/auth/model/auth-store", { names: ["privateHelper"] }));
});
test("widgets cannot import a different widget even through its public entry", () => {
  assert.ok(
    check("widgets/user-profile/ui/user-profile-page.tsx", "@/widgets/asset-library/ui/asset-library-workspace"),
  );
});
test("cross-entity exceptions are type-only and specific to the consuming file", () => {
  const target = "@/entities/creation-session/model/session";
  assert.equal(check("entities/image-resource/model/resource-cache.ts", target, { typeOnly: true }), null);
  assert.ok(check("entities/image-resource/model/resource-cache.ts", target));
  assert.ok(check("entities/image-resource/model/image-resource.ts", target, { typeOnly: true }));
});
test("test fixtures cannot enter production or unrelated tests", () => {
  const target = "@/features/generation/model/session-events.test-fixture";
  assert.ok(check("app/_bootstrap/user-event-stream-initializer.tsx", target));
  assert.equal(check("app/_bootstrap/user-event-stream-initializer.test.tsx", target), null);
  assert.ok(check("app/other.test.tsx", target));
});
