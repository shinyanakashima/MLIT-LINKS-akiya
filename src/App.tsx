import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Aggregates, Prefecture } from "./types";

const yen = (v: number | null): string => {
  if (v == null) return "—";
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}億円`;
  return `${Math.round(v / 10_000).toLocaleString()}万円`;
};

const GRID = "#2a3a4f";
const AXIS = "#9fb0c3";

type SortKey = keyof Pick<
  Prefecture,
  "registered" | "contracts" | "liquidity" | "medianSalePrice" | "medianAge"
>;

function PrefTable({ rows }: { rows: Prefecture[] }) {
  const [sort, setSort] = useState<SortKey>("registered");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort] ?? -1;
      const bv = b[sort] ?? -1;
      return desc ? bv - av : av - bv;
    });
  }, [rows, sort, desc]);

  const click = (k: SortKey) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(true);
    }
  };

  const cols: { key: SortKey; label: string }[] = [
    { key: "registered", label: "登録残" },
    { key: "contracts", label: "成約" },
    { key: "liquidity", label: "流動性%" },
    { key: "medianSalePrice", label: "売買中央値" },
    { key: "medianAge", label: "築年中央値" },
  ];

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>都道府県</th>
            {cols.map((c) => (
              <th
                key={c.key}
                className={sort === c.key ? "active" : ""}
                onClick={() => click(c.key)}
              >
                {c.label} {sort === c.key ? (desc ? "▼" : "▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>{p.registered.toLocaleString()}</td>
              <td>{p.contracts.toLocaleString()}</td>
              <td>{p.liquidity.toFixed(1)}</td>
              <td>{yen(p.medianSalePrice)}</td>
              <td>{p.medianAge != null ? `${p.medianAge}年` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleBar({
  data,
  color = "#38bdf8",
  height = 260,
}: {
  data: { name: string; count: number }[];
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          tick={{ fill: AXIS, fontSize: 11 }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: "#0f1720", border: `1px solid ${GRID}` }}
          formatter={(v: number) => [`${v.toLocaleString()} 件`, "件数"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function App() {
  const [data, setData] = useState<Aggregates | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/aggregates.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="loading">読み込みエラー: {err}</div>;
  if (!data) return <div className="loading">データを読み込み中…</div>;

  const m = data.meta;
  const prefTop = data.prefectures
    .slice(0, 15)
    .map((p) => ({ name: p.name.replace(/[県都府]$/, ""), 登録残: p.registered, 成約: p.contracts }));

  return (
    <div className="wrap">
      <header>
        <h1>空き家バンク 市場ダッシュボード</h1>
        <p className="sub">
          {m.source}（{m.asOf} 時点）
        </p>
      </header>

      <div className="kpis">
        <div className="kpi">
          <div className="label">登録残物件（在庫）</div>
          <div className="value">
            {m.totalRegistered.toLocaleString()}
            <small> 件</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">年間成約物件</div>
          <div className="value">
            {m.totalContracts.toLocaleString()}
            <small> 件</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">売買居住用 価格中央値</div>
          <div className="value">{yen(m.medianSalePriceAll)}</div>
        </div>
        <div className="kpi">
          <div className="label">築年数 中央値</div>
          <div className="value">
            {m.medianAgeAll}
            <small> 年</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">100万円以下 / 無償</div>
          <div className="value">
            {m.ultraCheapCount.toLocaleString()}
            <small> 件 / {m.freeCount}件</small>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card full">
          <h2>都道府県別 登録残 × 成約（上位15）</h2>
          <p className="hint">在庫が多い地域と、実際に動いている地域の差を見る</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={prefTop} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} interval={0} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0f1720", border: `1px solid ${GRID}` }}
                formatter={(v: number) => [`${v.toLocaleString()} 件`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="登録残" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="成約" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>売買居住用 価格帯分布</h2>
          <p className="hint">300〜1,000万円が中心。100万円以下の超低価格帯も厚い</p>
          <SimpleBar data={data.priceBands} color="#38bdf8" />
        </div>

        <div className="card">
          <h2>築年数の分布</h2>
          <p className="hint">築50年超が約4分の1。再生・解体コストの検討が前提</p>
          <SimpleBar data={data.ageBands} color="#f59e0b" />
        </div>

        <div className="card">
          <h2>建物構造</h2>
          <p className="hint">木造が大多数（「指定なし」は土地等を含む）</p>
          <SimpleBar data={data.structures} color="#34d399" />
        </div>

        <div className="card">
          <h2>物件カテゴリ（登録）</h2>
          <p className="hint">売買居住用と売買土地で大半を占める</p>
          <SimpleBar data={data.categoriesRegistered} color="#a78bfa" />
        </div>

        <div className="card full">
          <h2>都道府県ランキング（クリックで並べ替え）</h2>
          <p className="hint">
            流動性% = 成約 ÷（登録残 + 成約）。高いほど物件が動いている目安
          </p>
          <PrefTable rows={data.prefectures} />
        </div>
      </div>

      <footer>
        <p>
          出典:{" "}
          <a href={m.sourceUrl} target="_blank" rel="noreferrer">
            {m.source}
          </a>{" "}
          / ライセンス: 公共データ利用規約（CC-BY 4.0互換）
        </p>
        <p>
          データ生成: {m.generatedAt}。緯度経度・周辺施設距離・成約金額は元データで
          欠損が多く、本ダッシュボードは集計値ベースで構成しています。
        </p>
      </footer>
    </div>
  );
}
