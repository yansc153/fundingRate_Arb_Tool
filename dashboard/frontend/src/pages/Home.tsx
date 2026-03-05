import { useState, useMemo } from "react";
import Marquee from "react-fast-marquee";
import { useFundingRates } from "../hooks/useFundingRates";
import { useStats } from "../hooks/useStats";

const PROMPT_PREVIEW = `去 GitHub 读取并执行资金费率套利策略：
https://github.com/yansc153/fundingRate_Arb_Tool

1. 读 MASTER_SKILL.md — 完整策略逻辑
2. 读 skills/ 下的三个 SKILL.md — API 端点规范
3. 按策略执行：扫描费率 → 开仓 → 监控 → 平仓`;

export default function Home() {
  const [copied, setCopied] = useState(false);
  const { data: stats } = useStats();
  const { data: fundingRates } = useFundingRates();

  const topRates = [...fundingRates]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, 6);

  // 机枪池预估年化：取 Top 5 费率均值 × 3次/天 × 365天
  const yieldOptimizerApy = useMemo(() => {
    const top5 = [...fundingRates]
      .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
      .slice(0, 5);
    if (top5.length === 0) return 0;
    const avgRate = top5.reduce((sum, r) => sum + Math.abs(r.fundingRate), 0) / top5.length;
    return avgRate * 3 * 365 * 100; // 3 settlements/day × 365 days × 100 for %
  }, [fundingRates]);

  const handleCopy = async () => {
    setCopied(true);
    try {
      await navigator.clipboard.writeText(PROMPT_PREVIEW);
    } catch { /* ignore */ }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* ── 顶部：标题 + 特性标签 ── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1
            className="font-bold uppercase tracking-tighter leading-[0.9]"
            style={{ fontSize: "clamp(2.5rem, 6vw, 6rem)" }}
          >
            资金费率套利
          </h1>
          <p className="text-muted-foreground text-lg mt-2">
            现货做多 + 永续做空 = Delta 中性，每 8 小时收一次资金费率
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:pb-2">
          {[
            { icon: "🔒", text: "数据安全" },
            { icon: "🚫", text: "不托管资产" },
            { icon: "🏠", text: "自主部署" },
            { icon: "📖", text: "代码开源" },
          ].map((tag) => (
            <span
              key={tag.text}
              className="border-2 border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:border-accent hover:text-accent transition-colors"
            >
              {tag.icon} {tag.text}
            </span>
          ))}
        </div>
      </div>

      {/* ── 统计横幅 Marquee ── */}
      <div className="bg-accent py-3 -mx-4 px-4 overflow-hidden">
        <Marquee speed={60} gradient={false}>
          {[
            { v: String(fundingRates.length), l: "交易对" },
            { v: `$${stats.fundingCollectedToday.toLocaleString()}`, l: "今日收益" },
            { v: `${stats.agentsLive}`, l: "在线 Agent" },
            { v: "94%", l: "胜率" },
            { v: "24/7", l: "全天候监控" },
          ].map((item, i) => (
            <div key={i} className="flex items-baseline gap-3 mx-8">
              <span className="font-mono text-3xl font-bold text-accent-foreground">{item.v}</span>
              <span className="text-xs uppercase tracking-widest text-accent-foreground/70">{item.l}</span>
              <span className="text-accent-foreground/30 mx-4">—</span>
            </div>
          ))}
        </Marquee>
      </div>

      {/* ── 主体：Prompt + 实时数据 两栏 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左：Agent Prompt (3/5) */}
        <div className="lg:col-span-3 border-2 border-border">
          <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border">
            <div>
              <h2 className="text-lg font-bold uppercase tracking-tighter">AGENT PROMPT</h2>
              <p className="text-xs text-muted-foreground mt-0.5">一键复制完整 2000+ 行 Prompt（从 GitHub 实时拉取）</p>
            </div>
            <button
              onClick={handleCopy}
              className={`h-10 px-6 text-xs font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${
                copied
                  ? "bg-green text-background"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {copied ? "✓ 已复制" : "复制 PROMPT"}
            </button>
          </div>
          <div className="p-6 max-h-[520px] overflow-y-auto">
            <pre className="font-mono text-[13px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
              {PROMPT_PREVIEW}
            </pre>
          </div>
        </div>

        {/* 右：实时费率 Top 6 (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 实时费率排行 */}
          <div className="border-2 border-border">
            <div className="px-6 py-4 border-b-2 border-border flex items-center justify-between">
              <h2 className="text-lg font-bold uppercase tracking-tighter">实时费率</h2>
              <a href="/scanner" className="text-xs text-accent uppercase tracking-widest hover:underline">
                查看全部 →
              </a>
            </div>
            <div>
              {topRates.map((r, i) => (
                <div
                  key={r.symbol}
                  className={`flex items-center justify-between px-6 py-3 group hover:bg-accent/5 transition-colors ${
                    i < topRates.length - 1 ? "border-b border-border/30" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground/50 w-5">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-bold uppercase tracking-tight">
                      {r.symbol.replace("USDT", "")}
                      <span className="text-muted-foreground/40 font-normal">/USDT</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-mono text-sm font-bold ${r.fundingRate > 0 ? "text-green" : "text-red"}`}>
                      {r.fundingRate > 0 ? "+" : ""}{(r.fundingRate * 100).toFixed(4)}%
                    </span>
                    <span className="font-mono text-xs text-muted-foreground w-16 text-right">
                      {r.apy.toFixed(0)}% APY
                    </span>
                    {r.signal === "ARB" && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-accent/10 text-accent px-2 py-0.5">
                        ARB
                      </span>
                    )}
                    {r.signal === "WATCH" && (
                      <span className="text-[10px] font-bold uppercase tracking-widest border border-border text-muted-foreground px-2 py-0.5">
                        观察
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 快速统计 */}
          <div className="grid grid-cols-2 gap-px bg-border">
            <div className="bg-background p-5 group hover:bg-accent transition-colors duration-300">
              <p className="font-mono text-2xl font-bold group-hover:text-accent-foreground">
                {stats.agentsLive}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent-foreground/70">
                在线 Agent
              </p>
            </div>
            <div className="bg-background p-5 group hover:bg-accent transition-colors duration-300">
              <p className="font-mono text-2xl font-bold text-accent group-hover:text-accent-foreground">
                ${stats.fundingCollectedToday.toLocaleString()}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent-foreground/70">
                今日收益
              </p>
            </div>
            <div className="bg-background p-5 group hover:bg-accent transition-colors duration-300">
              <p className="font-mono text-2xl font-bold group-hover:text-accent-foreground">
                {(stats.avgNetYield * 100).toFixed(2)}%
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent-foreground/70">
                平均净收益/8H
              </p>
            </div>
            <div className="bg-background p-5 group hover:bg-accent transition-colors duration-300">
              <p className="font-mono text-2xl font-bold group-hover:text-accent-foreground">
                {stats.activePositions}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent-foreground/70">
                活跃持仓
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 三步使用 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
        {[
          { n: "01", t: "复制 PROMPT", d: "点击上方按钮，复制完整的资金费率套利策略 Prompt" },
          { n: "02", t: "粘贴到 OPENCLAW 🦞", d: "打开你的 OpenClaw Agent，把 Prompt 粘贴进去" },
          { n: "03", t: "收取收益", d: "Agent 自动扫描 → 开仓 → 每 8 小时收一次资金费率" },
        ].map((s) => (
          <div key={s.n} className="bg-background p-8">
            <span className="font-mono text-[4rem] font-bold text-muted leading-none block">{s.n}</span>
            <p className="text-xl font-bold uppercase tracking-tighter mt-3">{s.t}</p>
            <p className="text-sm text-muted-foreground mt-2">{s.d}</p>
          </div>
        ))}
      </div>

      {/* ── 机枪池模式预告 ── */}
      <div className="border-2 border-accent">
        <div className="flex flex-col lg:flex-row">
          {/* 左：年化数字 */}
          <div className="lg:w-2/5 bg-accent p-8 flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-background/60">
              机枪池模式 · 预估年化
            </p>
            <p
              className="font-mono font-bold text-background leading-none mt-2"
              style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
            >
              {yieldOptimizerApy.toFixed(0)}%
            </p>
            <p className="text-sm text-background/70 mt-2">
              基于当前 Top 5 费率实时计算
            </p>
            <span className="inline-block mt-4 border-2 border-background/30 text-background text-[10px] font-bold uppercase tracking-widest px-3 py-1 w-fit">
              即将推出
            </span>
          </div>

          {/* 右：功能对比 */}
          <div className="lg:w-3/5 p-8">
            <h3 className="text-lg font-bold uppercase tracking-tighter mb-4">
              免费版 vs 机枪池
            </h3>
            <div>
              {/* 表头 */}
              <div className="grid grid-cols-[1fr_80px_80px] items-center pb-2 border-b-2 border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>功能</span>
                <span className="text-center">免费</span>
                <span className="text-center text-accent">机枪池</span>
              </div>
              {[
                { feature: "实时费率扫描", free: true, pro: true },
                { feature: "单币对手动套利", free: true, pro: true },
                { feature: "多币对自动轮换", free: false, pro: true },
                { feature: "每 4H 最优调仓", free: false, pro: true },
                { feature: "Telegram 实时推送", free: false, pro: true },
                { feature: "历史回测 (90天)", free: false, pro: true },
                { feature: "多因子信号打分", free: false, pro: true },
              ].map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-[1fr_80px_80px] items-center py-2.5 text-sm ${
                    i > 0 ? "border-t border-border/30" : ""
                  }`}
                >
                  <span className="text-foreground/80">{row.feature}</span>
                  <span className="text-center">
                    {row.free ? (
                      <span className="text-green font-bold">✓</span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </span>
                  <span className="text-center">
                    <span className="text-accent font-bold">✓</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 风险提示 ── */}
      <div className="border-2 border-border p-6 flex items-start gap-4">
        <span className="text-accent text-xl font-bold shrink-0">⚠</span>
        <div>
          <p className="font-bold uppercase tracking-tighter">风险提示</p>
          <p className="text-sm text-muted-foreground mt-1">
            本工具仅供教育和研究目的。策略默认在 Testnet 运行，切换到主网前请充分测试。
            资金费率套利存在执行风险、基差风险和费率反转风险。请从小仓位开始（$100-500）。
          </p>
        </div>
      </div>
    </div>
  );
}
