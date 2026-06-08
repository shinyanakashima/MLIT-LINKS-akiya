#!/usr/bin/env python3
"""【暫定 / P5へ移管予定】生CSV → 正規化レコードJSON 変換。

本来この処理は MLIT-LINKS-akiya-pipeline (P5) が担う:
  - CSV取り込み (BOM/改行対応)
  - 売買賃貸分離 / 用途分類
  - 単位正規化 (金額→円・整数)
  - 築年丸め (DATE_OF_CONSTRUCTION → 西暦年)
  - 列名整理・型付け
  - 登録×成約の突合と成約フラグ生成

P5が完成するまでの暫定措置として、ローカルの生CSVから
スキーマ準拠の正規化レコードJSON (schema/normalized-records.schema.json) を
生成し、本リポジトリの集計(scripts/aggregate.py)が動くようにする。

P5完成後は本スクリプトを廃止し、P5の出力JSONをそのまま入力に置けばよい。

出力: data/normalized/records.json
"""
import csv
import json
import os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG_CSV = os.path.join(ROOT, "data", "01_tourokubukken.csv")
CON_CSV = os.path.join(ROOT, "data", "02_seiyakubukken.csv")
OUT = os.path.join(ROOT, "data", "normalized", "records.json")

SCHEMA_VERSION = "1.0"
AS_OF = "2025-03-31"
SOURCE = "国土交通省 Project LINKS / 空き家・空き地バンク登録物件・成約物件データ(2025年度)"
SOURCE_URL = "https://www.geospatial.jp/ckan/dataset/links-akiyabank-2025"


def read_csv(path):
    # BOM付きUTF-8。utf-8-sigで先頭BOMを除去。newline="" でCSV内改行に対応。
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def clean(v):
    s = (v or "").strip()
    return s or None


def to_int_yen(v):
    """単位正規化: 金額を整数(円)に。数値化できなければ None。"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(round(f))


def build_year(v):
    """築年丸め: 各種日付表記を西暦年(int)に。"""
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(s, fmt).year
        except ValueError:
            continue
    return None


def iso_date(v):
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def split_category(category):
    """売買賃貸分離 + 用途分類。category 例: '売買居住用'。"""
    if not category:
        return None, None
    transaction = None
    if category.startswith("売買"):
        transaction = "売買"
    elif category.startswith("賃貸"):
        transaction = "賃貸"
    use_type = None
    if "居住用" in category:
        use_type = "居住用"
    elif "土地" in category:
        use_type = "土地"
    elif "事業用" in category:
        use_type = "事業用"
    return transaction, use_type


def normalize_registration(r, contracted_ids):
    category = (r.get("PROPERTY_CATEGORY") or "").strip()
    transaction, use_type = split_category(category)
    rid = clean(r.get("PROPERTY_NUMBER_ID"))
    return {
        "type": "registration",
        "id": rid,
        "prefecture": (r.get("PREFECTURE") or "").strip(),
        "city": clean(r.get("CITY")),
        "category": category,
        "transaction": transaction,
        "useType": use_type,
        "structure": clean(r.get("CONSTRUCTION")),
        "buildYear": build_year(r.get("DATE_OF_CONSTRUCTION")),
        "price": to_int_yen(r.get("AMOUNT/RENT")),
        "isRent": transaction == "賃貸",
        # 登録×成約の突合: 物件番号が成約側に存在すれば成約フラグを立てる
        "contracted": rid is not None and rid in contracted_ids,
        "contractDate": None,
        "contractPrice": None,
    }


def normalize_contract(r):
    category = (r.get("PROPERTY_CATEGORY") or "").strip()
    transaction, use_type = split_category(category)
    return {
        "type": "contract",
        "id": clean(r.get("ID")),
        "prefecture": (r.get("PREFECTURE") or "").strip(),
        "city": clean(r.get("CITY")),
        "category": category,
        "transaction": transaction,
        "useType": use_type,
        "structure": clean(r.get("CONSTRUCTION")),
        "buildYear": build_year(r.get("DATE_OF_CONSTRUCTION")),
        "price": to_int_yen(r.get("AMOUNT/RENT")),
        "isRent": transaction == "賃貸",
        "contracted": True,
        "contractDate": iso_date(r.get("CONTRACT_INFO_DATE")),
        "contractPrice": to_int_yen(r.get("CONTRACT_INFO_AMOUNT/RENT")),
    }


def main():
    reg = read_csv(REG_CSV)
    con = read_csv(CON_CSV)

    contracted_ids = {clean(r.get("ID")) for r in con}
    contracted_ids.discard(None)

    records = [normalize_registration(r, contracted_ids) for r in reg]
    records += [normalize_contract(r) for r in con]

    out = {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE,
            "sourceUrl": SOURCE_URL,
            "asOf": AS_OF,
            "generatedBy": "scripts/normalize.py (暫定: P5未完成のためのローカル生成)",
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "records": records,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    n_reg = sum(1 for r in records if r["type"] == "registration")
    n_con = sum(1 for r in records if r["type"] == "contract")
    matched = sum(1 for r in records if r["type"] == "registration" and r["contracted"])
    print(f"wrote {OUT}: {n_reg} registrations ({matched} matched as contracted), {n_con} contracts")


if __name__ == "__main__":
    main()
