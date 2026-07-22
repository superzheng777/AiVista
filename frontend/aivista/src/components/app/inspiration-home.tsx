import { ArrowUpRight, ImagePlus, Search, Sparkles } from "lucide-react";
import Link from "next/link";

const sampleWorks = [
  {
    title: "潮汐来信",
    author: "Lumen",
    className: "from-[#173266] via-[#176f94] to-[#e5a262]",
  },
  {
    title: "琥珀花园",
    author: "Mira",
    className: "from-[#254b42] via-[#c79747] to-[#e7d8ad]",
  },
  {
    title: "蓝焰旅人",
    author: "Kite",
    className: "from-[#07172f] via-[#126e99] to-[#c5ecf0]",
  },
  {
    title: "橘光肖像",
    author: "Nan",
    className: "from-[#627d76] via-[#df9a62] to-[#f2d7a2]",
  },
];

export function InspirationHome() {
  return (
    <div className="mx-auto max-w-[1720px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card px-5 py-16 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.42)] sm:px-10 lg:px-16 lg:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(127,232,255,0.28),transparent_32%),radial-gradient(circle_at_85%_100%,rgba(196,181,253,0.22),transparent_35%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="mb-4 text-center text-sm font-medium tracking-[0.18em] text-sky-600">AIVISTA · CREATE</p>
          <h1 className="text-center text-3xl font-semibold tracking-tight text-card-foreground sm:text-5xl">
            从一个念头，抵达一幅画面。
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-muted-foreground sm:text-base">
            上传参考图或写下你的想象，开始一段属于自己的视觉创作。
          </p>

          <Link
            href="/generate"
            className="group mt-10 flex min-h-40 items-end rounded-[1.5rem] border border-border bg-card/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-xl hover:shadow-sky-100/60 sm:p-5"
          >
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-sky-50 group-hover:text-sky-600">
              <ImagePlus className="size-5" />
            </div>
            <div className="ml-4 flex flex-1 flex-col justify-between self-stretch">
              <p className="text-sm text-muted-foreground">描述你想生成的图片，或上传一张参考图</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-lg border border-border px-2.5 py-1.5">图片生成</span>
                  <span className="rounded-lg border border-border px-2.5 py-1.5">参考图</span>
                  <span className="rounded-lg border border-border px-2.5 py-1.5">1–2 张结果</span>
                </div>
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:bg-sky-600">
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
            </div>
          </Link>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["文字生图", "把一句描述变成画面"],
              ["局部重绘", "针对画面细节继续创作"],
              ["灵感探索", "从公开作品发现新的方向"],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-border bg-card/70 p-4">
                <Sparkles className="mb-5 size-4 text-sky-500" />
                <p className="font-medium text-card-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-border bg-card p-4 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.42)] sm:p-6">
        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">发现</button>
            <button className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted">热门</button>
            <button className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted">新作</button>
          </div>
          <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl bg-muted px-3 text-sm text-muted-foreground sm:w-72">
            <Search className="size-4" />
            <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="搜索灵感" />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sampleWorks.map((work, index) => (
            <article key={work.title} className="group relative min-h-72 overflow-hidden rounded-2xl bg-slate-800">
              <div className={`absolute inset-0 bg-gradient-to-br ${work.className}`} />
              <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_15%,rgba(255,255,255,.8)_0,transparent_20%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,.35)_0,transparent_26%)]" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-5 text-white">
                <p className="text-lg font-medium">{work.title}</p>
                <p className="mt-1 text-sm text-white/75">@{work.author} · 灵感作品 {index + 1}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
