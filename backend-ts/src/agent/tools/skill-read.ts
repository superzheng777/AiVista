import { access, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";

/** Pi-compatible read Tool restricted to project Skill resources. */
export function createSkillReadTool(cwd: string) {
  const skillsRoot = resolve(cwd, ".pi", "skills");
  const canonicalRoot = realpath(skillsRoot);
  const authorize = async (path: string): Promise<string> => {
    const absolute = await realpath(resolve(cwd, path));
    const child = relative(await canonicalRoot, absolute);
    if (child === "" || child === ".." || child.startsWith(`..\\`) || child.startsWith("../")
        || isAbsolute(child)) {
      throw new Error("read 只允许读取已发布的 Skill 文件。");
    }
    return absolute;
  };
  return createReadToolDefinition(cwd, {
    autoResizeImages: false,
    operations: {
      access: async (path) => access(await authorize(path)),
      readFile: async (path) => readFile(await authorize(path)),
    },
  });
}
