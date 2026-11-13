"use client";

import { useState } from "react";
import { formatWon, monthLabel } from "./format";

/* ───────── 월별 수입·지출 (묶은 막대, 2계열) ───────── */

export type MonthTotal = { month: string; income: number; expense: number };

const short = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function MonthlyBars({ data }: { data: MonthTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 340;
  const H = 180;
  const pad = { l: 36, r: 4, t: 8, b: 22 };
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / data.length;
  const bw = Math.min(14, (slot - 10) / 2);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const last = data.length - 1;

  // 4px 둥근 끝, 바닥은 각지게
  const bar = (x: number, v: number) => {
    const top = y(v);
    const h = pad.t + plotH - top;
    if (h <= 0) return "";
    const r = Math.min(4, h, bw / 2);
    return `M${x},${pad.t + plotH}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${pad.t + plotH}Z`;
  };

  const a = active ?? last;

  return (
    <figure>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-chart-income" /> 수입
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-chart-expense" /> 지출
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="최근 월별 수입과 지출 막대 차트" onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)">
                {short.format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const x1 = cx - bw - 1; // 막대 사이 2px 간격
            const x2 = cx + 1;
            return (
              <g key={d.month} opacity={active === null || active === i ? 1 : 0.45}>
                <path d={bar(x1, d.income)} fill="var(--chart-income)" />
                <path d={bar(x2, d.expense)} fill="var(--chart-expense)" />
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill={i === a ? "var(--ink)" : "var(--muted)"}>
                  {Number(d.month.slice(5))}월
                </text>
                {/* 마크보다 넓은 히트 영역 */}
                <rect
                  x={pad.l + slot * i}
                  y={pad.t}
                  width={slot}
                  height={plotH + pad.b}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* 선택한 달 (기본: 이번 달) 값: 툴팁 역할을 하는 고정 판독 영역 */}
      <figcaption className="tabular mt-2 flex items-baseline justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
        <span className="font-semibold">{monthLabel(data[a].month)}</span>
        <span className="flex gap-3">
          <span>
            <span className="text-muted">수입 </span>
            {formatWon(data[a].income)}
          </span>
          <span>
            <span className="text-muted">지출 </span>
            {formatWon(data[a].expense)}
          </span>
        </span>
      </figcaption>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">표로 보기</summary>
        <table className="tabular mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">월</th>
              <th className="py-1 text-right font-normal">수입</th>
              <th className="py-1 text-right font-normal">지출</th>
              <th className="py-1 text-right font-normal">차액</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-line">
                <td className="py-1.5">{monthLabel(d.month)}</td>
                <td className="py-1.5 text-right">{formatWon(d.income)}</td>
                <td className="py-1.5 text-right">{formatWon(d.expense)}</td>
                <td className="py-1.5 text-right">{formatWon(d.income - d.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/* ───────── 카테고리 비중 (단일 계열 가로 막대) ───────── */

export type CategoryShare = { name: string; amount: number };

export function CategoryBars({ data, total }: { data: CategoryShare[]; total: number }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted">이번 달 지출이 없어요</p>;
  const top = data[0].amount;
  return (
    <ul className="space-y-3" aria-label="카테고리별 지출">
      {data.map((c) => (
        <li key={c.name} className="text-sm">
          <div className="tabular flex justify-between">
            <span>{c.name}</span>
            <span>
              {formatWon(c.amount)} <span className="text-muted">{total ? Math.round((c.amount / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-chart-expense" style={{ width: `${(c.amount / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────── 전월 대비 증감 ───────── */

export type CategoryDelta = { name: string; current: number; previous: number };

export function CategoryChanges({ data }: { data: CategoryDelta[] }) {
  const rows = data.filter((d) => d.current !== d.previous).slice(0, 6);
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted">지난달과 비교할 내역이 없어요</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((d) => {
        const diff = d.current - d.previous;
        const up = diff > 0;
        return (
          <li key={d.name} className="tabular flex items-center justify-between py-2">
            <span>{d.name}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted">{formatWon(d.previous)} →</span>
              <span className="font-semibold">
                <span aria-hidden className={up ? "text-expense" : "text-income"}>
                  {up ? "▲" : "▼"}
                </span>{" "}
                {up ? "+" : "-"}
                {formatWon(Math.abs(diff))}
                <span className="sr-only">{up ? " 증가" : " 감소"}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
