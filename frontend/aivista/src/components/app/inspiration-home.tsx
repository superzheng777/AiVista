import { Compass, ImagePlus, Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { GenerationComposer } from "@/features/generation/ui/generation-composer";

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
      <section className="relative overflow-hidden px-5 py-14 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(127,232,255,0.28),transparent_32%),radial-gradient(circle_at_85%_100%,rgba(196,181,253,0.22),transparent_35%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="mb-4 text-center text-sm font-medium tracking-[0.18em] text-sky-600">AIVISTA · CREATE</p>
          <h1 className="text-center text-3xl font-semibold tracking-tight text-card-foreground sm:text-5xl">
            从一个念头，抵达一幅画面。
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-muted-foreground sm:text-base">
            写下你的想象，开始一段属于自己的视觉创作。
          </p>

          <div className="mx-auto mt-10 max-w-5xl"><GenerationComposer /></div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <FeatureCard icon={Sparkles} title="文字生图" description="把一句描述变成画面" />
            <FeatureCard icon={ImagePlus} title="局部重绘" description="针对画面细节继续创作" comingSoon />
            <Link href="#inspiration" className="rounded-2xl border border-border bg-card/70 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Compass className="mb-5 size-4 text-sky-500" />
              <p className="font-medium text-card-foreground">灵感探索</p>
              <p className="mt-1 text-xs text-muted-foreground">从公开作品发现新的方向</p>
            </Link>
          </div>
        </div>
      </section>

      <section id="inspiration" className="mt-4">
        <div className="sticky top-0 z-20 -mx-4 flex min-h-[4.5rem] flex-col gap-4 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8">
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

function FeatureCard({ icon: Icon, title, description, comingSoon = false }: { icon: typeof Sparkles; title: string; description: string; comingSoon?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <Icon className="mb-5 size-4 text-sky-500" />
      <div className="flex items-center gap-2"><p className="font-medium text-card-foreground">{title}</p>{comingSoon ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">即将支持</span> : null}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
