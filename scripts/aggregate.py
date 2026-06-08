#!/usr/bin/env python3
"""正規化レコードJSON → ダッシュボード用の集計JSON。

入力: data/normalized/records.json (P5が出力する正規化レコード。
      schema/normalized-records.schema.json 準拠)
出力: public/data/aggregates.json

本リポジトリ(suryey)に残す責務はここ: 自治体(都道府県)別の集計
(登録数/種別構成/築年分布/価格帯/成約傾向) と aggregates.json 生成のみ。
生CSVの取り込み・正規化・突合は P5 が担い、本スクリプトは触れない。
標準ライブラリのみで完結させ、CI(GitHub Actions)で依存インストール不要にする。
"""
import json
import os
import statistics
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 入力は環境変数 RECORDS_JSON で差し替え可能(P5の出力先に向けるため)
IN = os.environ.get("RECORDS_JSON") or os.path.join(ROOT, "data", "normalized", "records.json")
OUT = os.path.join(ROOT, "public", "data", "aggregates.json")


def load_records(path):
    if not os.path.exists(path):
        sys.exit(
            f"正規化レコードJSONが見つかりません: {path}\n"
            "P5の出力を配置するか、暫定的に `python3 scripts/normalize.py` で生成してください。"
        )
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    if "records" not in doc:
        sys.exit(f"{path}: 'records' 配列がありません (スキーマ不一致)")
    return doc.get("meta", {}), doc["records"]


def median(values):
    vals = [v for v in values if v is not None]
    return round(statistics.median(vals)) if vals else None


def counter(rows, key):
    out = {}
    for r in rows:
        v = (r.get(key) or "")
        v = v.strip() if isinstance(v, str) else v
        if v:
            out[v] = out.get(v, 0) + 1
    return out


def to_list(d, top=None):
    items = sorted(
        ({"name": k, "count": v} for k, v in d.items()),
        key=lambda x: x["count"],
        reverse=True,
    )
    return items[:top] if top else items


def main():
    meta_in, records = load_records(IN)
    as_of = meta_in.get("asOf", "2025-03-31")
    ref_year = int(str(as_of)[:4])

    reg = [r for r in records if r.get("type") == "registration"]
    con = [r for r in records if r.get("type") == "contract"]

    # --- 都道府県別集計 ---
    prefs = {}

    def slot(name):
        return prefs.setdefault(
            name,
            {"name": name, "registered": 0, "contracts": 0, "_salePrices": [], "_ages": []},
        )

    for r in reg:
        p = (r.get("prefecture") or "").strip()
        if not p:
            continue
        s = slot(p)
        s["registered"] += 1
        if r.get("category") == "売買居住用":
            price = r.get("price")
            if price and price > 0:
                s["_salePrices"].append(price)
        y = r.get("buildYear")
        if y:
            s["_ages"].append(ref_year - y)

    for r in con:
        p = (r.get("prefecture") or "").strip()
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
        r.get("price") for r in reg if r.get("category") == "売買居住用"
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
    ages = [ref_year - y for r in reg if (y := r.get("buildYear"))]
    age_bands = [
        {"label": lbl, "count": sum(1 for a in ages if lo <= a < hi)}
        for lbl, lo, hi in age_defs
    ]

    data = {
        "meta": {
            "source": meta_in.get("source", ""),
            "sourceUrl": meta_in.get("sourceUrl", ""),
            "asOf": as_of,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalRegistered": len(reg),
            "totalContracts": len(con),
            "medianSalePriceAll": median(sale_prices),
            "medianAgeAll": median(ages),
            "ultraCheapCount": sum(1 for p in sale_prices if p <= 1_000_000),
            "freeCount": sum(1 for p in sale_prices if p == 0),
        },
        "categoriesRegistered": to_list(counter(reg, "category")),
        "categoriesContracts": to_list(counter(con, "category")),
        "structures": to_list(counter(reg, "structure"), top=8),
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
