import { ArrowRight, FolderOpen, Sparkles } from "lucide-react";

export function GeneratePlaceholder() {
  return (
    <section className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
      <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.42)] sm:p-12">
        <Sparkles className="size-7 text-sky-500" />
        <p className="mt-8 text-sm font-medium tracking-[0.14em] text-sky-600">生成工作台</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">从这里开始一次新的创作。</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-500">
          文生图任务、局部重绘、生成参数与结果状态将在后端迭代 2 完成后接入。当前先保留独立工作台入口。
        </p>
      </div>
    </section>
  );
}

export function AssetsPlaceholder({
  isLoggedIn,
  onLoginRequest,
}: {
  isLoggedIn: boolean;
  onLoginRequest: () => void;
}) {
  return (
    <section className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
      <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.42)] sm:p-12">
        <FolderOpen className="size-7 text-sky-500" />
        <p className="mt-8 text-sm font-medium tracking-[0.14em] text-sky-600">个人资产</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {isLoggedIn ? "你的创作会在这里沉淀。" : "登录后查看你的创作资产。"}
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-500">
          历史生成图片、收藏筛选与发布状态会随着后端迭代 3、4 接入。
        </p>
        {!isLoggedIn && (
          <button type="button" onClick={onLoginRequest} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600">
            去登录 <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </section>
  );
}
