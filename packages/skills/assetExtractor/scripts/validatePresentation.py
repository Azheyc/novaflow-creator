#!/usr/bin/env python3
"""Read-only presentation field validation; standard library only. No image inspection."""
import argparse
import json
import re
from pathlib import Path

KINDS = {"characters": "character_board", "props": "prop_board", "scenes": "scene_view"}
ROLES = {"characters": ["front", "back", "face_detail"], "props": ["front", "back"], "scenes": ["overview"]}
PURPOSES = {"identity", "look_state", "geometry", "composition", "scale", "material", "style"}
CONTRACT_VERSION = "1.4.3"
HEADLESS_NEGATIVE = (
    "左侧正面出现头部", "左侧领口长出五官", "领口上方凸出黑色脖柱",
    "黑色假人脖颈底座", "领口外伸出黑柱", "残缺头部", "畸变头脸", "肉色截断面",
)
FULL_HEAD_NEGATIVE = ("无头", "缺头", "裁切头部", "无手", "空袖管")
HEADLESS_FRONT_ANCHORS = (
    "衣领上沿", "最高边界", "衣领轮廓线外侧直接衔接纯净米白背景",
    "领口上方整个区域连续保持米白背景", "阴影严格收在衣领开口边界以内",
    "与衣领弧线平齐",
)
LIMITS = "检查展示字段、人物1.4.3固定文本、1.5.0外观决策/设计记录结构与摘要携带、跨母角色脸/体态摘要规范化完全重复；不证明授权真实、语义差异、事实支持、近义同脸或图像效果，不读取参考图。"


def validate(data):
    errors, warnings = [], []
    checked, missing = 0, 0
    references = {}
    character_signatures = []
    groups = data.get("characters", []) if isinstance(data, dict) else []
    character_ids = {a.get("asset_id") for a in groups if isinstance(a, dict) and isinstance(a.get("asset_id"), str)} if isinstance(groups, list) else set()

    def error(path, message):
        errors.append({"code": "E_PRESENTATION", "path": path, "message": message})

    def text(value):
        return isinstance(value, str) and bool(value.strip())

    def string_list(value, path, nonempty=False):
        if not isinstance(value, list) or (nonempty and not value):
            error(path, "必须为字符串数组" + ("且非空" if nonempty else ""))
            return False
        if any(not text(x) for x in value):
            error(path, "数组元素必须为非空字符串")
            return False
        return True

    def ratio(value, path):
        if not isinstance(value, str) or not re.fullmatch(r"[1-9]\d*:[1-9]\d*", value):
            error(path, "必须为正整数宽:高比例")

    def character_contract(p, path, asset):
        version = p.get("prompt_contract_version")
        if version is None:
            warnings.append({"code": "W_CHARACTER_CONTRACT_LEGACY", "path": path, "message": "旧人物方案未声明1.4.3文本契约；不能确认已满足新无头/负面规则"})
            return
        if version != CONTRACT_VERSION:
            error(path + ".prompt_contract_version", "仅支持人物文本契约1.4.3")
            return
        exception = p.get("prompt_exception_reason")
        if exception is not None and not text(exception):
            error(path + ".prompt_exception_reason", "豁免通用手部词须给出非空原文/结构依据")
        exempt_hands = text(exception)
        mode = p.get("mode")

        def inspect(positive, negative, pp, np, role=None):
            if not text(positive):
                error(pp, "当前人物契约须填写完整正向提示词")
                return
            if not text(negative):
                error(np, "当前人物契约须填写独立负面提示词")
                return
            compact = re.sub(r"\s+", "", positive)
            neg = re.sub(r"\s+", "", negative)
            labels = re.findall(r"角色\s*[:：]\s*([^；;\n]+)", positive)
            expected_name = asset.get("name")
            if not text(expected_name) and p.get("prompt_status") == "draft":
                expected_name = asset.get("asset_id")
            if not text(expected_name):
                error(pp, "人物当前契约须有母资产name，未定名草案可用稳定asset_id")
            elif len(labels) != 1 or labels[0].strip() != expected_name.strip():
                error(pp, "须有单次角色标签且与母资产name一致；草案未定名时使用asset_id")
            elif positive.count(expected_name.strip()) != 1:
                error(pp, "角色名称仅在角色标签出现一次；各列使用同一人物")
            if any(token in compact for token in ("颈部收断", "假人模台")):
                error(pp, "正向含原稿明确禁止的颈部/假人表达")
            if role is None:
                alignment = ("投影尺度", "相机高度", "足底基线", "肩", "腰", "髋", "膝", "踝")
                if any(token not in compact for token in alignment):
                    error(pp, "同图正背面须携带尺度、相机、足底及身体部位对齐约束")
                required = ("左列", "中列", "右列", "不对称展示", "头部、颈部与发型的可见展示范围限定在中列和右列") if mode == "headless_front" else ("左列", "中列", "右列", "正常完整头部", "自然颈部")
                if mode == "headless_front" and "角色" in compact:
                    prefix = compact.split("角色", 1)[0]
                    if not all(token in prefix for token in HEADLESS_FRONT_ANCHORS):
                        error(pp, "无头同图须在角色描述前先锁定左列领口与背景边界")
            elif role == "front":
                required = () if mode == "headless_front" else ("正常完整头部", "自然颈部")
            elif role == "back":
                required = ("背对镜头", "正常完整头部", "自然颈部")
            elif role == "face_detail":
                required = ("面部特写", "正常完整头部", "自然颈部")
            else:
                required = ()
                warnings.append({"code": "W_CHARACTER_CUSTOM_VIEW", "path": pp, "message": "替代视图只检查正负文本和角色标签；其结构须人工复核"})
            if any(token not in compact for token in required):
                error(pp, "所选人物模式/视图的固定结构文本缺失")
            front_headless = mode == "headless_front" and role in (None, "front")
            if front_headless:
                if any(token not in compact for token in HEADLESS_FRONT_ANCHORS):
                    error(pp, "无头正面领口边界固定文本不完整")
                if any(token not in neg for token in HEADLESS_NEGATIVE):
                    error(np, "须完整保留原稿无头版专用追加段")
                negative_terms = re.split(r"[，,；;。]", neg)
                if "无头" in neg or "裁切头部" in neg or "缺头" in negative_terms:
                    error(np, "无头版负面不能反向禁止无头、缺头或裁切头部")
                if "三列均保留正常完整头部" in compact or "左列保留正常完整头部" in compact:
                    error(pp, "无头版出现与左列领口结构直接冲突的完整头部要求")
            elif mode in ("headless_front", "full_head"):
                full_required = FULL_HEAD_NEGATIVE[:3] if exempt_hands else FULL_HEAD_NEGATIVE
                if any(token not in neg for token in full_required):
                    error(np, "完整头部视图须保留完整头部模式追加项")
                if any(token in neg for token in HEADLESS_NEGATIVE):
                    error(np, "完整头部视图不能携带无头左列专用负面")
                if mode == "full_head" and ("领口上方整个区域连续保持米白背景" in compact or "衣领上沿即为主体最高边界" in compact):
                    error(pp, "有头版不能携带无头领口边界结构")
            if not exempt_hands and role in (None, "front", "back") and "完整露出" not in compact:
                error(pp, "完整全身视图须明确双手外露")
            if any(token in neg for token in ("血肉", "血迹", "骨骼")):
                error(np, "负面含原稿禁止的血腥联想词")

        if p.get("split_views") is True:
            if "negative_prompt" not in p or p.get("negative_prompt") is not None:
                error(path + ".negative_prompt", "拆图的父负面字段须为null，限制按视图分配")
            views = p.get("views")
            if isinstance(views, list):
                for i, v in enumerate(views):
                    if isinstance(v, dict):
                        vp = f"{path}.views[{i}]"
                        inspect(v.get("positive_prompt"), v.get("negative_prompt"), vp + ".positive_prompt", vp + ".negative_prompt", v.get("role"))
        else:
            inspect(p.get("positive_prompt"), p.get("negative_prompt"), path + ".positive_prompt", path + ".negative_prompt")

    def appearance_development(p, group, path, asset, state):
        if group not in ("characters", "props"):
            return
        dev = p.get("appearance_development")
        dp = path + ".appearance_development"
        if "appearance_development" not in p:
            warnings.append({"code": "W_APPEARANCE_LEGACY", "path": dp, "message": "未提供1.5.0原文外观判断/补全与差异登记，须迁移或人工说明"})
            return
        if not isinstance(dev, dict):
            error(dp, "外观判断须为对象")
            return
        if dev.get("version") != "1.5.0":
            error(dp + ".version", "须为1.5.0")
        coverage = dev.get("source_coverage")
        if coverage not in ("sufficient", "partial", "absent"):
            error(dp + ".source_coverage", "须为sufficient/partial/absent")
        for field in ("known_fields", "missing_fields", "design_fields"):
            string_list(dev.get(field), dp + "." + field)
        decision = dev.get("decision")
        if decision not in ("source_only", "user_supplied", "ai_design", "awaiting_user", "strict_unresolved"):
            error(dp + ".decision", "外观决策类型错误")
        if not text(dev.get("decision_basis")):
            error(dp + ".decision_basis", "须记录来源充分性或询问/授权原话和范围")
        unresolved = decision in ("awaiting_user", "strict_unresolved")
        if unresolved and (p.get("prompt_status") != "draft" or not p.get("pending_fields") or not dev.get("missing_fields")):
            error(dp + ".decision", "等待回答或保留关键未知须draft且pending_fields/missing_fields非空")
        if decision == "source_only" and coverage != "sufficient":
            error(dp + ".decision", "原文不足时不能以source_only绕过缺项处理")
        fields = dev.get("design_fields")
        # Merge base design and state differences by field; empty differences retain base.
        merged_records = {}
        owners = [asset] if state is asset else [asset, state]
        for owner_index, owner in enumerate(owners):
            records = owner.get("proposals", [])
            if not isinstance(records, list):
                error(dp + ".proposals", "设计记录须为数组")
                continue
            for i, record in enumerate(records):
                rp = dp + f".proposals[{owner_index}][{i}]"
                if not isinstance(record, dict):
                    error(rp, "设计记录须为对象")
                    continue
                if record.get("origin") != "ai_design":
                    continue
                if isinstance(data, dict) and data.get("mode") != "design":
                    error(rp, "存在AI外观方案时顶层mode须为design")
                for field in ("field", "value", "basis", "authorization_basis"):
                    if not text(record.get(field)):
                        error(rp + "." + field, "AI设计记录须填写字段、内容、依据与授权")
                if record.get("status") not in ("proposed", "accepted"):
                    error(rp + ".status", "须为proposed/accepted")
                if text(record.get("field")):
                    merged_records[record["field"]] = record
        if decision == "ai_design":
            if not isinstance(data, dict) or data.get("mode") != "design":
                error(dp + ".decision", "AI设计分支顶层mode须为design")
            if not isinstance(fields, list) or not fields:
                error(dp + ".design_fields", "AI设计须记录当前完整方案使用的补全字段")
            if isinstance(fields, list):
                for field in fields:
                    if text(field) and field not in merged_records:
                        error(dp + ".design_fields", "补全字段缺对应母资产或版本AI设计记录")
        elif isinstance(fields, list) and fields:
            error(dp + ".design_fields", "非AI设计分支design_fields须为空")
        sig = dev.get("visual_signature")
        if not isinstance(sig, dict):
            error(dp + ".visual_signature", "须为外观摘要对象")
            sig = {}
        required = ("face", "body") if group == "characters" else ("silhouette", "structure", "material")
        views = p.get("views") if isinstance(p.get("views"), list) else []
        for key in required:
            value = sig.get(key)
            if not isinstance(value, str) or (not unresolved and not text(value)):
                error(dp + ".visual_signature." + key, "已解决方案须填具体摘要，未解决允许空字符串")
                continue
            if not text(value):
                continue
            if p.get("split_views") is True:
                roles = ("face_detail",) if key == "face" else ("front", "back")
                if key == "face" and p.get("mode") == "full_head":
                    roles = ("front", "face_detail")
                for role in roles:
                    targets = [v for v in views if isinstance(v, dict) and v.get("role") == role]
                    if targets and any(not isinstance(v.get("positive_prompt"), str) or value not in v["positive_prompt"] for v in targets):
                        error(dp + ".visual_signature." + key, "摘要须实际进入对应可见视图的正向提示词")
            elif not isinstance(p.get("positive_prompt"), str) or value not in p["positive_prompt"]:
                error(dp + ".visual_signature." + key, "摘要须实际进入同图正向提示词")
            elif group == "characters" and key == "face" and p.get("mode") == "headless_front":
                prompt = p["positive_prompt"]
                face_start = prompt.find("右列为同一人物")
                if face_start < 0 or value not in prompt[face_start:] or value in prompt[:face_start]:
                    error(dp + ".visual_signature.face", "无头同图face摘要只写入右列段，不扩散到全局或左列")
        base_p = asset.get("presentation")
        base_dev = base_p.get("appearance_development", {}) if isinstance(base_p, dict) else {}
        inherited_exceptions = base_dev.get("similarity_exceptions", []) if isinstance(base_dev, dict) else []
        exceptions = dev.get("similarity_exceptions", inherited_exceptions if state is not asset else [])
        valid_exceptions = set()
        if group == "characters":
            if not isinstance(exceptions, list):
                error(dp + ".similarity_exceptions", "须为数组")
                exceptions = []
            for i, item in enumerate(exceptions):
                ep = dp + f".similarity_exceptions[{i}]"
                if not isinstance(item, dict):
                    error(ep, "例外须为对象")
                    continue
                target = item.get("asset_id")
                scope = item.get("scope")
                if not isinstance(target, str) or target not in character_ids or target == asset.get("asset_id"):
                    error(ep + ".asset_id", "例外须指向另一已登记母角色")
                    continue
                if not isinstance(scope, list) or not scope or any(s not in ("face", "body") for s in scope):
                    error(ep + ".scope", "须明确face/body范围")
                    continue
                if not text(item.get("user_basis")):
                    error(ep + ".user_basis", "须记录用户针对相同外貌的明确要求")
                    continue
                valid_exceptions.update((target, s) for s in scope)
            aid = asset.get("asset_id")
            if not text(aid):
                error(dp, "人物母编号须为非空字符串，错误编号跳过差异比较")
            elif not unresolved:
                character_signatures.append((aid, sig, valid_exceptions, dp))
        elif "similarity_exceptions" in dev and dev["similarity_exceptions"] != []:
            error(dp + ".similarity_exceptions", "道具不使用人物同貌例外，省略或空数组")

    def check(p, group, path, expected_version, asset, state):
        nonlocal checked
        checked += 1
        if not isinstance(p, dict):
            error(path, "presentation必须为对象")
            return
        if p.get("kind") != KINDS[group]:
            error(path + ".kind", "kind必须匹配资产类型")
        if "version_id" not in p or p.get("version_id") != expected_version:
            error(path + ".version_id", "基础为null，版本须匹配所属版本编号")
        if not text(p.get("layout")):
            error(path + ".layout", "必须填写实际选定布局")
        split = p.get("split_views")
        if not isinstance(split, bool):
            error(path + ".split_views", "必须为布尔值")
        extra = text(p.get("extra_view_reason"))
        if split is True:
            if group == "scenes":
                error(path + ".split_views", "场景单方案必须单幅连续画面")
            if not extra:
                error(path + ".extra_view_reason", "拆图必须说明理由")
            if "board_ratio" not in p or p.get("board_ratio") is not None:
                error(path + ".board_ratio", "拆图时整图比例必须为null")
            if "positive_prompt" not in p or p.get("positive_prompt") is not None:
                error(path + ".positive_prompt", "拆图时使用每个视图提示词，本字段必须为null")
        else:
            ratio(p.get("board_ratio"), path + ".board_ratio")
            if not text(p.get("positive_prompt")):
                error(path + ".positive_prompt", "同图须填写完整正向提示词")
        status = p.get("prompt_status")
        if status not in ("draft", "ready"):
            error(path + ".prompt_status", "必须为draft或ready")
        pending = p.get("pending_fields")
        if string_list(pending, path + ".pending_fields") and status == "ready" and pending:
            error(path + ".pending_fields", "存在阻碍定稿的未知项时须为draft")
        views = p.get("views")
        if not isinstance(views, list) or not views:
            error(path + ".views", "必须为非空视图数组")
            views = []
        roles = []
        for i, v in enumerate(views):
            vp = f"{path}.views[{i}]"
            if not isinstance(v, dict):
                error(vp, "视图必须为对象")
                continue
            role = v.get("role")
            roles.append(role)
            for field in ("role", "definition", "angle"):
                if not text(v.get(field)):
                    error(vp + "." + field, "必须为非空字符串")
            ratio(v.get("image_ratio"), vp + ".image_ratio")
            if split is True and not text(v.get("positive_prompt")):
                error(vp + ".positive_prompt", "拆图的每个视图须有完整提示词")
        valid_roles = [r for r in roles if isinstance(r, str)]
        if len(valid_roles) != len(set(valid_roles)):
            error(path + ".views", "视图role必须唯一")
        expected = ROLES[group]
        if group == "scenes" and roles != expected:
            error(path + ".views", "场景只能包含overview单项")
        elif group == "props" and (roles[:2] != expected or (len(roles) > 2 and not extra)):
            error(path + ".views", "道具先front/back两项，额外视图必须说明理由")
        elif group == "characters" and roles != expected and not extra:
            error(path + ".views", "人物默认front/back/face_detail，替代方案须说明理由")
        if group == "characters":
            if p.get("mode") not in ("headless_front", "full_head"):
                error(path + ".mode", "必须为headless_front或full_head")
            character_contract(p, path, asset)
        if group == "props":
            if p.get("shape_class") not in ("compact", "elongated", "flat", "flexible", "irregular", "unknown"):
                error(path + ".shape_class", "道具形态类型错误")
            if p.get("orientation") not in ("vertical", "horizontal", "natural"):
                error(path + ".orientation", "摆放方向类型错误")
            for field in ("classification_basis", "ratio_reason"):
                if not text(p.get(field)):
                    error(path + "." + field, "必须为非空说明")
            string_list(p.get("detail_targets"), path + ".detail_targets")
            if "detail" in roles and not p.get("detail_targets"):
                error(path + ".detail_targets", "有细节视图时必须指定部位")
        if group == "scenes":
            for field in ("viewpoint_basis", "coverage"):
                if not text(p.get(field)):
                    error(path + "." + field, "必须填写机位依据与覆盖范围")
        appearance_development(p, group, path, asset, state)
        bindings = p.get("reference_bindings", [])
        if not isinstance(bindings, list):
            error(path + ".reference_bindings", "必须为数组")
            return
        local_ids = set()
        for i, ref in enumerate(bindings):
            rp = f"{path}.reference_bindings[{i}]"
            if not isinstance(ref, dict):
                error(rp, "参考绑定必须为对象")
                continue
            rid = ref.get("reference_id")
            if not text(rid):
                error(rp + ".reference_id", "必须为非空字符串")
            else:
                if rid in local_ids:
                    error(rp + ".reference_id", "同一方案参考编号重复")
                local_ids.add(rid)
                if rid in references and references[rid] != ref:
                    error(rp + ".reference_id", "参考编号已绑定不同内容")
                references[rid] = ref
            ref_status = ref.get("status")
            if ref_status not in ("provided", "available", "planned"):
                error(rp + ".status", "必须为provided/available/planned")
            if ref_status == "planned":
                if "path" not in ref or (ref.get("path") is not None and not text(ref.get("path"))):
                    error(rp + ".path", "计划图路径必须为非空字符串或null")
            elif not text(ref.get("path")):
                error(rp + ".path", "真实参考须登记非空路径")
            if not isinstance(ref.get("purpose"), str) or ref.get("purpose") not in PURPOSES:
                error(rp + ".purpose", "每项须为一种允许的参考用途")
            for field in ("controls", "exclusions"):
                string_list(ref.get(field), rp + "." + field, nonempty=True)

    if not isinstance(data, dict):
        error("$", "顶层必须为对象")
        data = {}
    for group in KINDS:
        items = data.get(group)
        if not isinstance(items, list):
            error(group, "资产组必须为数组")
            continue
        for i, asset in enumerate(items):
            ap = f"{group}[{i}]"
            if not isinstance(asset, dict):
                error(ap, "资产须为对象")
                continue
            if "presentation" in asset:
                check(asset["presentation"], group, ap + ".presentation", None, asset, asset)
            else:
                missing += 1
                warnings.append({"code": "W_PRESENTATION_MISSING", "path": ap, "message": "未提供母资产展示方案；人工判断是否合理省略"})
            vf = "variants" if group == "scenes" else "versions"
            versions = asset.get(vf, [])
            if not isinstance(versions, list):
                error(ap + "." + vf, "版本必须为数组")
                continue
            for j, version in enumerate(versions):
                vp = f"{ap}.{vf}[{j}]"
                if not isinstance(version, dict):
                    error(vp, "版本须为对象")
                    continue
                if "presentation" in version:
                    vid = version.get("version_id")
                    aid = asset.get("asset_id")
                    if not text(vid) or not text(aid) or not re.fullmatch(re.escape(aid) + r"-V\d{2,}", vid):
                        error(vp + ".version_id", "版本编号必须属于当前资产")
                    check(version["presentation"], group, vp + ".presentation", vid, asset, version)
                else:
                    missing += 1
                    warnings.append({"code": "W_PRESENTATION_MISSING", "path": vp, "message": "无独立版本展示方案；人工判断继承、无需制作或缺失"})
    # Exact normalized text duplication only; this is not visual face recognition.
    for i, (aid, sig, exceptions, path) in enumerate(character_signatures):
        for bid, other, other_exceptions, other_path in character_signatures[:i]:
            if aid == bid:
                continue  # States of the same identity may retain identical anchors.
            for key in ("face", "body"):
                value, other_value = sig.get(key), other.get(key)
                if not text(value) or not text(other_value):
                    continue
                normalized = re.sub(r"[\W_]+", "", value).casefold()
                other_normalized = re.sub(r"[\W_]+", "", other_value).casefold()
                if normalized and normalized == other_normalized and (bid, key) not in exceptions and (aid, key) not in other_exceptions:
                    error(path + ".visual_signature." + key, f"与{bid}的{key}摘要完全相同，须区分或记录用户指定的同貌例外；非图像相似度判定")
    if not checked:
        warnings.append({"code": "W_PRESENTATION_NOT_CHECKED", "path": "$", "message": "无可检查展示方案，不能声称展示校验通过"})
    return {"status": "failed" if errors else ("partial" if warnings else "passed"), "errors": errors, "warnings": warnings, "counts": {"presentations": checked, "missing": missing}, "limits": LIMITS}


def main():
    parser = argparse.ArgumentParser(description="Read-only asset presentation field validation")
    parser.add_argument("assets")
    args = parser.parse_args()
    try:
        result = validate(json.loads(Path(args.assets).read_text(encoding="utf-8-sig")))
    except (OSError, UnicodeError, ValueError, TypeError) as exc:
        result = {"status": "failed", "errors": [{"code": "E_INPUT", "path": "$", "message": str(exc)}], "warnings": [], "counts": {}, "limits": LIMITS}
    print(json.dumps(result, ensure_ascii=True, indent=2))
    raise SystemExit(1 if result["status"] == "failed" else 0)


if __name__ == "__main__":
    main()
