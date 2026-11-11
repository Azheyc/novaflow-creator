#!/usr/bin/env python3
"""只读的结构、证据和覆盖校验器；仅使用 Python 标准库。"""
import argparse
import json
import re
from pathlib import Path

SCHEMA = "1.1"
ASSET_GROUPS = {"characters": "CHAR", "props": "PROP", "scenes": "SCENE"}
ID_PATTERNS = {
    "CHAR": re.compile(r"CHAR-\d{3,}"),
    "PROP": re.compile(r"PROP-\d{3,}"),
    "SCENE": re.compile(r"SCENE-\d{3,}"),
    "SHOT": re.compile(r"SHOT-\d{3,}"),
    "EV": re.compile(r"EV-\d{3,}"),
    "SRC": re.compile(r"SRC-\d{3,}"),
}


def _normalize(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_core(data, sources):
    """返回稳定 JSON 结构；sources 为 {source_id: 已归一化或原始文本}。"""
    errors = []
    warnings = []
    assets = {}
    versions = {}
    evidence = {}
    shots = {}
    memberships = {}
    expected_by_scene = {}
    expected_props_for_char = {}

    def error(code, path, message):
        errors.append({"code": code, "path": path, "message": message})

    def warning(code, path, message):
        warnings.append({"code": code, "path": path, "message": message})

    if not isinstance(data, dict):
        return {"status": "failed", "errors": [{"code": "E_TYPE", "path": "$", "message": "顶层必须是对象"}], "warnings": [], "counts": {}, "limits": "仅检查结构、类型、引用、连续引文和覆盖声明；不验证事实与证据的语义支持，也不证明语义提取完整。"}
    if not isinstance(sources, dict):
        error("E_TYPE", "sources", "输入来源必须是对象")
        sources = {}

    if data.get("schema_version") != SCHEMA:
        error("E_VALUE", "schema_version", "必须为 1.1")
    if data.get("mode") not in ("strict", "design"):
        error("E_VALUE", "mode", "必须为 strict 或 design")

    for field in ("characters", "props", "scenes", "shots", "evidence", "source_documents", "merge_log", "issues"):
        if field not in data:
            error("E_REQUIRED", field, "缺少字段")
    if not isinstance(data.get("scope_complete"), bool):
        error("E_TYPE", "scope_complete", "必须是布尔值")

    for group, prefix in ASSET_GROUPS.items():
        items = data.get(group)
        if not isinstance(items, list):
            error("E_TYPE", group, "必须是数组")
            continue
        for index, item in enumerate(items):
            path = f"{group}[{index}]"
            if not isinstance(item, dict):
                error("E_TYPE", path, "条目必须是对象")
                continue
            aid = item.get("asset_id")
            if not isinstance(aid, str) or not ID_PATTERNS[prefix].fullmatch(aid):
                error("E_ID", path + ".asset_id", "资产编号格式错误")
                continue
            if aid in assets:
                error("E_DUPLICATE", path + ".asset_id", f"重复资产编号 {aid}")
            assets[aid] = item
            memberships[aid] = set()
            if not isinstance(item.get("name"), str) or not item.get("name").strip():
                error("E_TYPE", path + ".name", "必须是非空字符串")
            if item.get("importance") not in ("P1", "P2", "P3"):
                error("E_VALUE", path + ".importance", "必须为 P1、P2 或 P3")
            for field in ("facts", "unknowns", "proposals", "evidence_ids", "shot_ids"):
                if field not in item:
                    error("E_REQUIRED", path + "." + field, "缺少字段")
            for field in ("unknowns", "proposals", "evidence_ids", "shot_ids"):
                if field in item and not isinstance(item[field], list):
                    error("E_TYPE", path + "." + field, "必须是数组")
            if not isinstance(item.get("facts"), list):
                error("E_TYPE", path + ".facts", "必须是事实数组")
            if not isinstance(item.get("aliases", []), list):
                error("E_TYPE", path + ".aliases", "必须是数组")
            else:
                for a_index, alias in enumerate(item.get("aliases", [])):
                    if not isinstance(alias, str):
                        error("E_TYPE", f"{path}.aliases[{a_index}]", "别名必须是字符串")
            version_field = "variants" if prefix == "SCENE" else "versions"
            versions_value = item.get(version_field)
            if not isinstance(versions_value, list):
                error("E_TYPE", path + "." + version_field, "必须是数组")
                versions_value = []
            for v_index, version in enumerate(versions_value):
                vpath = f"{path}.{version_field}[{v_index}]"
                if not isinstance(version, dict):
                    error("E_TYPE", vpath, "版本必须是对象")
                    continue
                vid = version.get("version_id")
                if not isinstance(vid, str) or not re.fullmatch(re.escape(aid) + r"-V\d{2,}", vid):
                    error("E_ID", vpath + ".version_id", "版本编号不属于资产")
                elif vid in versions:
                    error("E_DUPLICATE", vpath + ".version_id", f"重复版本编号 {vid}")
                else:
                    versions[vid] = aid
                _validate_fact_list(version.get("facts"), vpath + ".facts", error)
                _validate_id_list(version.get("evidence_ids"), vpath + ".evidence_ids", "EV", error)
            _validate_fact_list(item.get("facts"), path + ".facts", error)
            _validate_id_list(item.get("evidence_ids"), path + ".evidence_ids", "EV", error)
            _validate_id_list(item.get("shot_ids"), path + ".shot_ids", "SHOT", error)
            for field, expected_prefix in (("prop_ids", "PROP"), ("character_ids", "CHAR"), ("scene_ids", "SCENE"), ("adjacent_scene_ids", "SCENE"), ("holders", "CHAR")):
                if field in item:
                    _validate_id_list(item.get(field), path + "." + field, expected_prefix, error)

    for index, entry in enumerate(data.get("evidence", []) if isinstance(data.get("evidence"), list) else []):
        path = f"evidence[{index}]"
        if not isinstance(entry, dict):
            error("E_TYPE", path, "证据必须是对象")
            continue
        eid = entry.get("evidence_id")
        if not isinstance(eid, str) or not ID_PATTERNS["EV"].fullmatch(eid):
            error("E_ID", path + ".evidence_id", "证据编号格式错误")
            continue
        if eid in evidence:
            error("E_DUPLICATE", path + ".evidence_id", f"重复证据编号 {eid}")
        evidence[eid] = entry
        sid = entry.get("source_id")
        quote = entry.get("quote")
        if not isinstance(sid, str) or sid not in sources:
            error("E_SOURCE", path + ".source_id", "证据来源未在输入 --source 中提供")
        if not isinstance(quote, str) or not quote.strip():
            error("E_EVIDENCE", path + ".quote", "引文必须是非空字符串")
        elif isinstance(sid, str) and sid in sources and _normalize(quote) not in _normalize(sources[sid]):
            error("E_EVIDENCE", path + ".quote", "引文不是来源中的连续原文")
        if "location" not in entry or not isinstance(entry.get("location"), (str, dict)):
            error("E_TYPE", path + ".location", "定位必须是字符串或对象")

    source_documents = data.get("source_documents")
    declared_sources = set()
    if not isinstance(source_documents, list):
        error("E_TYPE", "source_documents", "必须是数组")
        source_documents = []
    for index, document in enumerate(source_documents):
        path = f"source_documents[{index}]"
        if not isinstance(document, dict):
            error("E_TYPE", path, "来源登记必须是对象")
            continue
        sid = document.get("source_id")
        if not isinstance(sid, str) or not ID_PATTERNS["SRC"].fullmatch(sid):
            error("E_ID", path + ".source_id", "来源编号格式错误")
        elif sid in declared_sources:
            error("E_DUPLICATE", path + ".source_id", f"重复来源编号 {sid}")
        declared_sources.add(sid)
        if sid not in sources:
            error("E_SOURCE", path + ".source_id", "来源登记未对应输入 --source")
        coverage = document.get("coverage")
        _validate_coverage(coverage, path + ".coverage", sid, sources, error, warning)
    supplied_ids = set(sources)
    if declared_sources != supplied_ids:
        error("E_SOURCE", "source_documents", "source_documents 必须与输入 --source 的 source_id 一一对应")

    def check_evidence_ids(values, path):
        if not isinstance(values, list):
            return
        for index, eid in enumerate(values):
            if isinstance(eid, str) and eid not in evidence:
                error("E_REF", f"{path}[{index}]", f"未知证据 {eid}")

    for aid, item in assets.items():
        check_evidence_ids(item.get("evidence_ids"), aid + ".evidence_ids")
        _check_fact_evidence(item.get("facts"), aid + ".facts", check_evidence_ids)
        version_field = "variants" if aid.startswith("SCENE-") else "versions"
        for index, version in enumerate(item.get(version_field, []) if isinstance(item.get(version_field), list) else []):
            if isinstance(version, dict):
                check_evidence_ids(version.get("evidence_ids"), f"{aid}.{version_field}[{index}].evidence_ids")
                _check_fact_evidence(version.get("facts"), f"{aid}.{version_field}[{index}].facts", check_evidence_ids)
        for field, prefix in (("prop_ids", "PROP-"), ("character_ids", "CHAR-"), ("scene_ids", "SCENE-"), ("adjacent_scene_ids", "SCENE-"), ("holders", "CHAR-")):
            values = item.get(field, [])
            if not isinstance(values, list):
                continue
            for ref in values:
                if not isinstance(ref, str) or ref not in assets or not ref.startswith(prefix):
                    error("E_REF", aid + "." + field, f"引用不存在或类型错误: {ref}")

    shot_values = data.get("shots")
    if not isinstance(shot_values, list):
        shot_values = []
        error("E_TYPE", "shots", "必须是数组")
    for index, shot in enumerate(shot_values):
        path = f"shots[{index}]"
        if not isinstance(shot, dict):
            error("E_TYPE", path, "场次必须是对象")
            continue
        sid = shot.get("shot_id")
        if not isinstance(sid, str) or not ID_PATTERNS["SHOT"].fullmatch(sid):
            error("E_ID", path + ".shot_id", "场次编号格式错误")
            continue
        if sid in shots:
            error("E_DUPLICATE", path + ".shot_id", f"重复场次编号 {sid}")
        shots[sid] = shot
        memberships_for_shot = []
        source_id = shot.get("source_id")
        if source_id not in sources:
            error("E_SOURCE", path + ".source_id", "场次来源未在输入 --source 中提供")
        check_evidence_ids(shot.get("evidence_ids"), path + ".evidence_ids")
        location = shot.get("location_asset_id")
        if not isinstance(location, str) or location not in assets or not location.startswith("SCENE-"):
            error("E_REF", path + ".location_asset_id", "场景位置引用不存在或类型错误")
        else:
            memberships[location].add(sid)
            memberships_for_shot.append(location)
            expected_by_scene.setdefault(location, {"props": set(), "characters": set()})
            location_version = shot.get("location_version_id")
            if location_version is not None and (not isinstance(location_version, str) or versions.get(location_version) != location):
                error("E_REF", path + ".location_version_id", "场景版本不属于 location_asset_id")
        for field, prefix in (("characters", "CHAR-"), ("props", "PROP-")):
            values = shot.get(field)
            if not isinstance(values, list):
                error("E_TYPE", path + "." + field, "必须是数组")
                continue
            for uindex, use in enumerate(values):
                upath = f"{path}.{field}[{uindex}]"
                if not isinstance(use, dict):
                    error("E_TYPE", upath, "使用记录必须是对象")
                    continue
                aid = use.get("asset_id")
                if not isinstance(aid, str) or aid not in assets or not aid.startswith(prefix):
                    error("E_REF", upath + ".asset_id", "资产引用不存在或类型错误")
                    continue
                memberships[aid].add(sid)
                if location in expected_by_scene:
                    expected_by_scene[location][field].add(aid)
                vid = use.get("version_id")
                if vid is not None and (not isinstance(vid, str) or versions.get(vid) != aid):
                    error("E_REF", upath + ".version_id", "版本不属于引用资产")
                holder = use.get("holder")
                if holder is not None and (not isinstance(holder, str) or holder not in assets or not holder.startswith("CHAR-")):
                    error("E_REF", upath + ".holder", "持有者必须引用存在的角色")
                if field == "props" and isinstance(holder, str) and holder.startswith("CHAR-") and holder in assets:
                    expected_props_for_char.setdefault(holder, set()).add(aid)

    for aid, item in assets.items():
        listed = item.get("shot_ids")
        if isinstance(listed, list) and set(listed) != memberships.get(aid, set()):
            error("E_REVERSE", aid + ".shot_ids", "反向 shot_ids 与场次引用不闭环")
        if aid.startswith("SCENE-"):
            expected = expected_by_scene.get(aid, {"props": set(), "characters": set()})
            for field, reverse_field in (("props", "prop_ids"), ("characters", "character_ids")):
                if reverse_field in item and isinstance(item.get(reverse_field), list) and set(item[reverse_field]) != expected[field]:
                    error("E_REVERSE", aid + "." + reverse_field, "场景反向关联与场次引用不一致")
        if aid.startswith("CHAR-") and isinstance(item.get("prop_ids"), list):
            if set(item.get("prop_ids")) != expected_props_for_char.get(aid, set()):
                error("E_REVERSE", aid + ".prop_ids", "角色道具关联与场次持有者不一致")

    partial = data.get("scope_complete") is False
    for index, document in enumerate(source_documents):
        if isinstance(document, dict) and isinstance(document.get("coverage"), dict) and document["coverage"].get("complete") is False:
            partial = True
    if data.get("scope_complete") is True:
        for document in source_documents:
            if isinstance(document, dict) and isinstance(document.get("coverage"), dict) and document["coverage"].get("complete") is not True:
                error("E_COVERAGE", "scope_complete", "覆盖不完整时不能声明 scope_complete=true")
    if partial and not errors:
        warning("W_PARTIAL", "scope_complete", "部分覆盖；不宣称语义完整")

    counts = {key: len(data.get(key, [])) if isinstance(data.get(key), list) else 0 for key in (*ASSET_GROUPS, "shots", "evidence")}
    status = "failed" if errors else ("partial" if partial else "passed")
    return {"status": status, "errors": errors, "warnings": warnings, "counts": counts, "limits": "仅检查结构、类型、引用、连续引文和覆盖声明；不验证事实与证据的语义支持，也不证明语义提取完整。"}


def validate(data, sources):
    """Protect API callers as well as CLI from malformed containers; no arbitrary exceptions swallowed."""
    errors = []
    def visit(value, path):
        if isinstance(value, dict):
            for key, item in value.items():
                current = path + "." + str(key)
                if (key.endswith("_id") and item is not None and not isinstance(item, str)):
                    errors.append({"code": "E_TYPE", "path": current, "message": "编号必须是字符串或允许的null"})
                if key.endswith("_ids") and isinstance(item, list) and any(not isinstance(x, str) for x in item):
                    errors.append({"code": "E_TYPE", "path": current, "message": "编号数组元素必须为字符串"})
                visit(item, current)
        elif isinstance(value, list):
            for i, item in enumerate(value): visit(item, path + f"[{i}]")
    visit(data, "$")
    if isinstance(sources, dict) and any(not isinstance(k, str) or not isinstance(v, str) for k,v in sources.items()):
        errors.append({"code": "E_TYPE", "path": "sources", "message": "来源编号及正文须为字符串"})
    if errors:
        # Preserve prior E_REF signal for malformed use records.
        errors.append({"code": "E_REF", "path": "$", "message": "错误类型阻止引用校验"})
        return {"status":"failed", "errors":errors, "warnings":[], "counts":{}, "limits":"仅结构检查，不证明语义或图像效果"}
    return _validate_core(data, sources)

def _check_fact_evidence(value, path, check_evidence_ids):
    if isinstance(value, list):
        for index, fact in enumerate(value):
            if isinstance(fact, dict):
                check_evidence_ids(fact.get("evidence_ids"), f"{path}[{index}].evidence_ids")


def _validate_fact_list(value, path, error):
    if not isinstance(value, list):
        error("E_TYPE", path, "必须是事实数组")
        return
    for index, fact in enumerate(value):
        fpath = f"{path}[{index}]"
        if not isinstance(fact, dict):
            error("E_TYPE", fpath, "事实必须是对象")
            continue
        if not isinstance(fact.get("field"), str) or not fact.get("field").strip():
            error("E_TYPE", fpath + ".field", "必须是非空字符串")
        if not isinstance(fact.get("value"), str) or not fact.get("value").strip():
            error("E_TYPE", fpath + ".value", "必须是非空字符串")
        _validate_id_list(fact.get("evidence_ids"), fpath + ".evidence_ids", "EV", error)
        if isinstance(fact.get("evidence_ids"), list) and not fact.get("evidence_ids"):
            error("E_EVIDENCE", fpath + ".evidence_ids", "事实必须有非空证据引用")


def _validate_id_list(value, path, prefix, error):
    if not isinstance(value, list):
        error("E_TYPE", path, "必须是数组")
        return
    pattern = ID_PATTERNS.get(prefix)
    for index, item in enumerate(value):
        if not isinstance(item, str) or pattern is None or not pattern.fullmatch(item):
            error("E_ID", f"{path}[{index}]", f"必须是 {prefix} 编号")


def _validate_coverage(value, path, source_id, sources, error, warning):
    if not isinstance(value, dict):
        error("E_TYPE", path, "必须是对象")
        return
    start = value.get("start_line")
    end = value.get("end_line")
    ranges = value.get("scanned_ranges")
    complete = value.get("complete")
    if not _is_int(start) or not _is_int(end):
        error("E_TYPE", path, "start_line 和 end_line 必须是整数")
        return
    if start < 1 or end < start:
        error("E_COVERAGE", path, "行号范围无效")
    if not isinstance(complete, bool):
        error("E_TYPE", path + ".complete", "必须是布尔值")
    if not isinstance(ranges, list) or not ranges:
        error("E_TYPE", path + ".scanned_ranges", "必须是非空数组")
        return
    normalized = []
    for index, item in enumerate(ranges):
        if not isinstance(item, list) or len(item) != 2 or not all(_is_int(x) for x in item):
            error("E_TYPE", f"{path}.scanned_ranges[{index}]", "范围必须是 [整数, 整数]")
            continue
        left, right = item
        if left < 1 or right < left:
            error("E_COVERAGE", f"{path}.scanned_ranges[{index}]", "扫描范围无效")
        normalized.append((left, right))
    normalized.sort()
    previous = None
    for left, right in normalized:
        if previous is not None and left <= previous:
            error("E_COVERAGE", path + ".scanned_ranges", "扫描范围重叠")
        previous = right
    covers = bool(normalized) and normalized[0][0] == start and normalized[-1][1] == end and all(normalized[i][0] == normalized[i - 1][1] + 1 for i in range(1, len(normalized)))
    source_text = sources.get(source_id)
    if isinstance(source_text, str) and end > len(_normalize(source_text).split("\n")):
        error("E_COVERAGE", path, "end_line 超出实际来源行数")
    if complete is True and not covers:
        error("E_COVERAGE", path + ".complete", "扫描范围有缺口时不能声明 complete=true")
    if complete is False and covers:
        warning("W_COVERAGE", path + ".complete", "声明为 partial 但范围本身连续")


def main():
    parser = argparse.ArgumentParser(description="只读校验资产 JSON 与 UTF-8 来源文本")
    parser.add_argument("assets")
    parser.add_argument("--source", action="append", required=True, metavar="SRC-ID=PATH")
    args = parser.parse_args()
    try:
        sources = {}
        for spec in args.source:
            if not isinstance(spec, str) or "=" not in spec:
                raise ValueError("--source 必须是 SRC-001=路径")
            sid, path = spec.split("=", 1)
            if not ID_PATTERNS["SRC"].fullmatch(sid):
                raise ValueError("--source 的 source_id 格式错误")
            if sid in sources:
                raise ValueError("重复 --source source_id: " + sid)
            sources[sid] = Path(path).read_text(encoding="utf-8-sig")
        data = json.loads(Path(args.assets).read_text(encoding="utf-8-sig"))
        result = validate(data, sources)
    except (OSError, UnicodeError, ValueError, TypeError, json.JSONDecodeError) as exc:
        result = {"status": "failed", "errors": [{"code": "E_INPUT", "path": "$", "message": str(exc)}], "warnings": [], "counts": {}, "limits": "仅检查结构、类型、引用、连续引文和覆盖声明；不验证事实与证据的语义支持，也不证明语义提取完整。"}
    print(json.dumps(result, ensure_ascii=True, indent=2))
    raise SystemExit(1 if result["status"] == "failed" else 0)


if __name__ == "__main__":
    main()
