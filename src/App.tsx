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

type Lang = "ja" | "en";

// UIラベルの辞書。都道府県名やカテゴリ等のデータ由来の値は対象外(日本語のまま)。
const STR = {
  ja: {
    toggle: "EN",
    title: "空き家バンク 市場ダッシュボード",
    asOf: (s: string) => `（${s} 時点）`,
    loading: "データを読み込み中…",
    error: (e: string) => `読み込みエラー: ${e}`,
    units: { items: "件", years: "年", count: "件数" },
    kpi: {
      registered: "登録残物件（在庫）",
      contracts: "年間成約物件",
      medianPrice: "売買居住用 価格中央値",
      medianAge: "築年数 中央値",
      cheap: "100万円以下 / 無償",
      cheapUnit: (free: number) => `件 / ${free}件`,
    },
    cards: {
      prefBar: {
        title: "都道府県別 登録残 × 成約（上位15）",
        hint: "在庫が多い地域と、実際に動いている地域の差を見る",
      },
      price: {
        title: "売買居住用 価格帯分布",
        hint: "300〜1,000万円が中心。100万円以下の超低価格帯も厚い",
      },
      age: {
        title: "築年数の分布",
        hint: "築50年超が約4分の1。再生・解体コストの検討が前提",
      },
      structure: {
        title: "建物構造",
        hint: "木造が大多数（「指定なし」は土地等を含む）",
      },
      category: {
        title: "物件カテゴリ（登録）",
        hint: "売買居住用と売買土地で大半を占める",
      },
      ranking: {
        title: "都道府県ランキング（クリックで並べ替え）",
        hint: "流動性% = 成約 ÷（登録残 + 成約）。高いほど物件が動いている目安",
      },
    },
    cols: {
      pref: "都道府県",
      registered: "登録残",
      contracts: "成約",
      liquidity: "流動性%",
      medianPrice: "売買中央値",
      medianAge: "築年中央値",
    },
    footer: {
      sourceLabel: "出典: ",
      license: " / ライセンス: 公共データ利用規約（CC-BY 4.0互換）",
      note: (gen: string) =>
        `データ生成: ${gen}。緯度経度・周辺施設距離・成約金額は元データで欠損が多く、本ダッシュボードは集計値ベースで構成しています。`,
    },
  },
  en: {
    toggle: "日本語",
    title: "Akiya Bank Market Dashboard",
    asOf: (s: string) => ` (as of ${s})`,
    loading: "Loading data…",
    error: (e: string) => `Load error: ${e}`,
    units: { items: "props", years: "yrs", count: "Count" },
    kpi: {
      registered: "Registered (inventory)",
      contracts: "Contracts / year",
      medianPrice: "Median sale price (residential)",
      medianAge: "Median building age",
      cheap: "Under ¥1M / free",
      cheapUnit: (free: number) => `props / ${free} free`,
    },
    cards: {
      prefBar: {
        title: "Registered × Contracts by prefecture (top 15)",
        hint: "Compare where inventory piles up vs. where deals actually close",
      },
      price: {
        title: "Sale price distribution (residential)",
        hint: "Concentrated at ¥3M–10M; a thick ultra-low band under ¥1M too",
      },
      age: {
        title: "Building age distribution",
        hint: "About a quarter are over 50 years old; renovation/demolition cost matters",
      },
      structure: {
        title: "Building structure",
        hint: "Mostly wooden ('unspecified' includes land, etc.)",
      },
      category: {
        title: "Property category (registered)",
        hint: "Residential sale and land sale make up the majority",
      },
      ranking: {
        title: "Prefecture ranking (click to sort)",
        hint: "Liquidity% = contracts ÷ (registered + contracts). Higher means properties move more",
      },
    },
    cols: {
      pref: "Prefecture",
      registered: "Registered",
      contracts: "Contracts",
      liquidity: "Liquidity%",
      medianPrice: "Median price",
      medianAge: "Median age",
    },
    footer: {
      sourceLabel: "Source: ",
      license: " / License: Public Data Terms of Use (CC-BY 4.0 compatible)",
      note: (gen: string) =>
        `Generated: ${gen}. Coordinates, nearby-facility distances and contract prices are largely missing in the source data, so this dashboard is built on aggregated values.`,
    },
  },
} as const;

type Dict = (typeof STR)[Lang];

const yen = (v: number | null, lang: Lang): string => {
  if (v == null) return "—";
  if (lang === "en") return `¥${Math.round(v).toLocaleString()}`;
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}億円`;
  return `${Math.round(v / 10_000).toLocaleString()}万円`;
};

const GRID = "#2a3a4f";
const AXIS = "#9fb0c3";

type SortKey = keyof Pick<
  Prefecture,
  "registered" | "contracts" | "liquidity" | "medianSalePrice" | "medianAge"
>;

function PrefTable({ rows, t, lang }: { rows: Prefecture[]; t: Dict; lang: Lang }) {
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
    { key: "registered", label: t.cols.registered },
    { key: "contracts", label: t.cols.contracts },
    { key: "liquidity", label: t.cols.liquidity },
    { key: "medianSalePrice", label: t.cols.medianPrice },
    { key: "medianAge", label: t.cols.medianAge },
  ];

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.cols.pref}</th>
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
              <td>{yen(p.medianSalePrice, lang)}</td>
              <td>{p.medianAge != null ? `${p.medianAge}${t.units.years}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleBar({
  data,
  t,
  color = "#38bdf8",
  height = 260,
}: {
  data: { name: string; count: number }[];
  t: Dict;
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
          formatter={(v: number) => [`${v.toLocaleString()} ${t.units.items}`, t.units.count]}
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
  const [lang, setLang] = useState<Lang>("ja");
  const t = STR[lang];

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/aggregates.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="loading">{t.error(err)}</div>;
  if (!data) return <div className="loading">{t.loading}</div>;

  const m = data.meta;
  const prefTop = data.prefectures
    .slice(0, 15)
    .map((p) => ({
      name: p.name.replace(/[県都府]$/, ""),
      registered: p.registered,
      contracts: p.contracts,
    }));

  return (
    <div className="wrap">
      <header>
        <div className="header-row">
          <h1>{t.title}</h1>
          <button
            type="button"
            className="lang-toggle"
            onClick={() => setLang((l) => (l === "ja" ? "en" : "ja"))}
            aria-label={lang === "ja" ? "Switch to English" : "日本語に切り替え"}
          >
            {t.toggle}
          </button>
        </div>
        <p className="sub">
          {m.source}
          {t.asOf(m.asOf)}
        </p>
      </header>

      <div className="kpis">
        <div className="kpi">
          <div className="label">{t.kpi.registered}</div>
          <div className="value">
            {m.totalRegistered.toLocaleString()}
            <small> {t.units.items}</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">{t.kpi.contracts}</div>
          <div className="value">
            {m.totalContracts.toLocaleString()}
            <small> {t.units.items}</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">{t.kpi.medianPrice}</div>
          <div className="value">{yen(m.medianSalePriceAll, lang)}</div>
        </div>
        <div className="kpi">
          <div className="label">{t.kpi.medianAge}</div>
          <div className="value">
            {m.medianAgeAll}
            <small> {t.units.years}</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">{t.kpi.cheap}</div>
          <div className="value">
            {m.ultraCheapCount.toLocaleString()}
            <small> {t.kpi.cheapUnit(m.freeCount)}</small>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card full">
          <h2>{t.cards.prefBar.title}</h2>
          <p className="hint">{t.cards.prefBar.hint}</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={prefTop} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} interval={0} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0f1720", border: `1px solid ${GRID}` }}
                formatter={(v: number) => [`${v.toLocaleString()} ${t.units.items}`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar name={t.cols.registered} dataKey="registered" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar name={t.cols.contracts} dataKey="contracts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>{t.cards.price.title}</h2>
          <p className="hint">{t.cards.price.hint}</p>
          <SimpleBar data={data.priceBands} t={t} color="#38bdf8" />
        </div>

        <div className="card">
          <h2>{t.cards.age.title}</h2>
          <p className="hint">{t.cards.age.hint}</p>
          <SimpleBar data={data.ageBands} t={t} color="#f59e0b" />
        </div>

        <div className="card">
          <h2>{t.cards.structure.title}</h2>
          <p className="hint">{t.cards.structure.hint}</p>
          <SimpleBar data={data.structures} t={t} color="#34d399" />
        </div>

        <div className="card">
          <h2>{t.cards.category.title}</h2>
          <p className="hint">{t.cards.category.hint}</p>
          <SimpleBar data={data.categoriesRegistered} t={t} color="#a78bfa" />
        </div>

        <div className="card full">
          <h2>{t.cards.ranking.title}</h2>
          <p className="hint">{t.cards.ranking.hint}</p>
          <PrefTable rows={data.prefectures} t={t} lang={lang} />
        </div>
      </div>

      <footer>
        <p>
          {t.footer.sourceLabel}
          <a href={m.sourceUrl} target="_blank" rel="noreferrer">
            {m.source}
          </a>
          {t.footer.license}
        </p>
        <p>{t.footer.note(m.generatedAt)}</p>
      </footer>
    </div>
  );
}
