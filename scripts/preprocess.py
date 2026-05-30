#!/usr/bin/env python3
"""空き家・空き地バンクの登録/成約CSVを、ダッシュボード用の集計JSONに変換する。

標準ライブラリのみで完結させ、CI(GitHub Actions)で依存インストール不要にする。
出力: public/data/aggregates.json
"""
import csv
import json
import os
import statistics
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG_CSV = os.path.join(ROOT, "data", "01_tourokubukken.csv")
CON_CSV = os.path.join(ROOT, "data", "02_seiyakubukken.csv")
OUT = os.path.join(ROOT, "public", "data", "aggregates.json")

AS_OF = "2025-03-31"


def read_csv(path):
    # BOM付きUTF-8。utf-8-sigで先頭BOMを除去
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build_year(v):
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(s, fmt).year
        except ValueError:
            continue
    return None


def median(values):
    vals = [v for v in values if v is not None]
    return round(statistics.median(vals)) if vals else None


def counter(rows, key):
    out = {}
    for r in rows:
        v = (r.get(key) or "").strip()
        if v:
            out[v] = out.get(v, 0) + 1
    return out


def main():
    reg = read_csv(REG_CSV)
    con = read_csv(CON_CSV)

    # --- 都道府県別集計 ---
    prefs = {}

    def slot(name):
        return prefs.setdefault(
            name,
            {"name": name, "registered": 0, "contracts": 0, "_salePrices": [], "_ages": []},
        )

    for r in reg:
        p = (r.get("PREFECTURE") or "").strip()
        if not p:
            continue
        s = slot(p)
        s["registered"] += 1
        if r.get("PROPERTY_CATEGORY") == "売買居住用":
            price = to_float(r.get("AMOUNT/RENT"))
            if price and price > 0:
                s["_salePrices"].append(price)
        y = build_year(r.get("DATE_OF_CONSTRUCTION"))
        if y:
            s["_ages"].append(2025 - y)

    for r in con:
        p = (r.get("PREFECTURE") or "").strip()
        if not p:
            continue
        slot(p)["contracts"] += 1

    prefectures = []
    for s in prefs.values():
        reg_n, con_n = s["registered"], s["contracts"]
        total = reg_n + con_n
        prefectures.append(
            {
                "name": s["name"],
                "registered": reg_n,
                "contracts": con_n,
                # 流動性の目安: 成約 / (登録残 + 成約)
                "liquidity": round(con_n / total * 100, 1) if total else 0,
                "medianSalePrice": median(s["_salePrices"]),
                "medianAge": median(s["_ages"]),
            }
        )
    prefectures.sort(key=lambda x: x["registered"], reverse=True)

    # --- 売買居住用 価格帯分布 ---
    bands = [
        ("~100万", 0, 1_000_000),
        ("100-300万", 1_000_000, 3_000_000),
        ("300-500万", 3_000_000, 5_000_000),
        ("500万-1千万", 5_000_000, 10_000_000),
        ("1千万-2千万", 10_000_000, 20_000_000),
        ("2千万~", 20_000_000, float("inf")),
    ]
    sale_prices = [
        to_float(r.get("AMOUNT/RENT"))
        for r in reg
        if r.get("PROPERTY_CATEGORY") == "売買居住用"
    ]
    sale_prices = [p for p in sale_prices if p is not None and p >= 0]
    price_bands = [
        {"label": lbl, "count": sum(1 for p in sale_prices if lo <= p < hi)}
        for lbl, lo, hi in bands
    ]

    # --- 築年数帯 (登録物件 全体) ---
    age_defs = [
        ("~20年", 0, 20),
        ("20-30年", 20, 30),
        ("30-40年", 30, 40),
        ("40-50年", 40, 50),
        ("50-60年", 50, 60),
        ("60年~", 60, float("inf")),
    ]
    ages = [2025 - y for r in reg if (y := build_year(r.get("DATE_OF_CONSTRUCTION")))]
    age_bands = [
        {"label": lbl, "count": sum(1 for a in ages if lo <= a < hi)}
        for lbl, lo, hi in age_defs
    ]

    # --- 構造 / カテゴリ ---
    def to_list(d, top=None):
        items = sorted(
            ({"name": k, "count": v} for k, v in d.items()),
            key=lambda x: x["count"],
            reverse=True,
        )
        return items[:top] if top else items

    data = {
        "meta": {
            "source": "国土交通省 Project LINKS / 空き家・空き地バンク登録物件・成約物件データ(2025年度)",
            "sourceUrl": "https://www.geospatial.jp/ckan/dataset/links-akiyabank-2025",
            "asOf": AS_OF,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalRegistered": len(reg),
            "totalContracts": len(con),
            "medianSalePriceAll": median(sale_prices),
            "medianAgeAll": median(ages),
            "ultraCheapCount": sum(1 for p in sale_prices if p <= 1_000_000),
            "freeCount": sum(1 for p in sale_prices if p == 0),
        },
        "categoriesRegistered": to_list(counter(reg, "PROPERTY_CATEGORY")),
        "categoriesContracts": to_list(counter(con, "PROPERTY_CATEGORY")),
        "structures": to_list(counter(reg, "CONSTRUCTION"), top=8),
        "priceBands": price_bands,
        "ageBands": age_bands,
        "prefectures": prefectures,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"wrote {OUT}: {len(reg)} registered, {len(con)} contracts, {len(prefectures)} prefectures")


if __name__ == "__main__":
    main()
