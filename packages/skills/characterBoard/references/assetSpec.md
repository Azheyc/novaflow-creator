# 资产提取 JSON 规范 1.1 + 展示扩展 1.4

保留顶层 `schema_version: "1.1"`，兼容现有结构校验器；技能包修订为1.5.0；人物无头/有头固定文本契约仍为1.4.3，新增外观判断扩展为1.5.0。原结构校验器保持不变，新增 `scripts/validatePresentation.py` 独立检查展示字段结构；构图含义、事实支持与图像效果仍需人工复核。

顶层字段：

```json
{
  "schema_version": "1.1",
  "mode": "strict",
  "source_documents": [{
    "source_id": "SRC-001",
    "path": "story.txt",
    "title": "故事",
    "coverage": {
      "start_line": 1,
      "end_line": 12,
      "scanned_ranges": [[1, 12]],
      "complete": true
    }
  }],
  "characters": [],
  "props": [],
  "scenes": [],
  "shots": [],
  "evidence": [],
  "merge_log": [],
  "issues": [],
  "scope_complete": true
}
```

`scope_complete` 只表示用户指定的扫描范围已实际读取且没有行号缺口，不表示语义提取完整。`coverage` 必须有整数 `start_line`、`end_line`、非空 `scanned_ranges` 和布尔 `complete`。范围必须有效、按行升序且不重叠；若声明范围存在缺口，`complete` 必须为 `false`，`scope_complete` 不能为 `true`。来源只接受命令行显式提供的文本，`source_documents` 与输入来源必须一一对应、source_id 唯一。

每条 `evidence`：`evidence_id`、`source_id`、`location`、`quote`。`quote` 必须是规范化来源文本中的非空连续原文；不知道行号时保留章节/场次定位，不伪造行号。来源和 JSON 均按 UTF-8 读取，`CRLF/CR` 归一为 `LF`。

角色：

```json
{
  "asset_id":"CHAR-001","name":"","aliases":[],"importance":"P1",
  "facts":[{"field":"identity","value":"","evidence_ids":["EV-001"]}],
  "unknowns":[],"proposals":[],"versions":[{
    "version_id":"CHAR-001-V01","label":"基础状态",
    "facts":[],"evidence_ids":[]
  }],
  "evidence_ids":["EV-001"],"shot_ids":[],"prop_ids":[],"scene_ids":[]
}
```

道具：

```json
{
  "asset_id":"PROP-001","name":"","category":"","importance":"P1",
  "importance_reason":"",
  "facts":[{"field":"appearance","value":"","evidence_ids":["EV-002"]}],
  "unknowns":[],"proposals":[],"versions":[{
    "version_id":"PROP-001-V01","label":"初始状态",
    "facts":[],"evidence_ids":[]
  }],
  "evidence_ids":["EV-002"],"shot_ids":[],"scene_ids":[],"holders":[]
}
```

场景：

```json
{
  "asset_id":"SCENE-001","name":"","scene_type":"interior","importance":"P1",
  "facts":[{"field":"layout","value":"","evidence_ids":["EV-001"]}],
  "unknowns":[],"proposals":[],"variants":[{
    "version_id":"SCENE-001-V01","label":"默认状态",
    "facts":[],"evidence_ids":[]
  }],
  "evidence_ids":["EV-001"],"shot_ids":[],"prop_ids":[],"character_ids":[],"adjacent_scene_ids":[]
}
```

场次：

```json
{
  "shot_id":"SHOT-001","source_id":"SRC-001","source_location":"第1场",
  "title":"","location_asset_id":"SCENE-001","location_version_id":"SCENE-001-V01",
  "time":"day","weather":"",
  "characters":[{"asset_id":"CHAR-001","version_id":"CHAR-001-V01","relation":"present","position":""}],
  "props":[{"asset_id":"PROP-001","version_id":"PROP-001-V01","relation":"transferred","holder":"CHAR-001","position":""}],
  "evidence_ids":["EV-001"],"notes":[]
}
```

允许值：`mode` 为 `strict` 或 `design`；`importance` 为 `P1`、`P2`、`P3`；`scene_type` 为 `interior`、`exterior`、`semi_exterior`、`unknown`；场次关系为 `present`、`mentioned`、`on_screen`、`mentioned_only`、`held`、`transferred`、`dropped`、`destroyed` 等。未确定值使用 `unknown` 或空数组，不使用“待补”作为事实。

规则：

1. 每个 asset_id 唯一且前缀正确；版本 ID 必须以对应 asset_id 开头。场景版本使用 `variants`，人物和道具使用 `versions`。
2. `facts` 必须是数组；每条事实必须有非空字符串 `field`、`value` 和非空 `evidence_ids`，且每个证据编号存在。版本事实同样检查。校验器检查结构和存在性，不宣称语义支持。
3. evidence_id 必须存在；来源 source_id 必须存在；类型错误和缺字段均返回统一错误码，不允许 traceback。
4. shot 中引用的资产、版本、持有者必须存在且类型正确；location_version_id 必须属于 location_asset_id。
5. `prop_ids`、`character_ids`、`scene_ids`、`adjacent_scene_ids`、`holders` 与资产类型一致；角色/道具/场景 `shot_ids` 必须与场次正向引用闭环。
6. `source_documents` 与命令行输入来源一一对应且 source_id 唯一；重复输入 source 或重复声明都失败。
7. `scope_complete=false` 或任一来源 coverage.complete=false 时，最终报告必须声明部分覆盖。虚假的完整声明直接失败。
8. 未知项放 `unknowns`；冲突放 `issues`；合并放 `merge_log`，不可静默覆盖。
9. 关联字段执行结构一致性检查；叙事中的交接先保存为场次关系，持有者语义是否符合剧情仍需人工复核，并应在 `issues` 中说明。

## 展示扩展 presentation

在需独立制作外观的人物、道具、场景母资产中添加 `presentation`；实质视觉版本有不同方案时，在对应 versions 或场景 variants 中添加同名对象，仅覆盖该版本。基础方案的 `version_id` 用 null，版本方案必须填写所属版本编号。视角本身不创建版本。仅被提及的角色、未实际呈现的地点和背景组合可省略该扩展。

先按类型确定 kind 与视区数量：人物 character_board 默认三项；道具 prop_board 默认两项；场景 scene_view 默认一项。每项 views 对应实际选定的展示视区，场景始终以单幅连续环境构图描述。旧展示扩展中道具的必需 detail 改为按需补充，场景新增独立展示类型。原结构字段与 schema_version 保持兼容。

`presentation` 不属于剧本事实，不写入 `facts`。展示判断依据写在对象内；已确认设计仍按原规则记录设计来源，未知实体外观留在 `unknowns`。比例为宽:高字符串，无法判断的数值用 null，不伪造长宽厚测量。

通用字段：

- `kind`：character_board、prop_board 或 scene_view，必须与资产类型一致。
- `version_id`：基础为 null；其他必须属于本资产。
- `prompt_status`：draft 或 ready。ready只表示输入足够用于当前提示词，不意味着已生图。
- `layout`：本次已选定的具体排布，不存互斥候选。
- `board_ratio`：整张图片比例；场景同样使用此字段以保持统一结构；特殊拆图时为 null。
- `split_views`：是否拆成独立图片；三类默认均为 false。场景的多个区块分别建立单幅展示方案，单个方案依旧为 false。
- `views`：按类型设置数量。人物默认 front/back/face_detail 三项；道具默认 front/back 两项，front 为正侧面轻俯视全貌，detail 仅按需追加并记录理由；场景仅 overview 一项，为四分之三全景。每项写 role、definition、angle、image_ratio；同图模式 image_ratio 表示单独导出该视区时的推荐比例，不保证与图内占区精确一致。
- `positive_prompt`：完整中文正向提示词。一板模式填写；拆图模式为 null，改为每个 views 条目提供完整 positive_prompt。
- `pending_fields`：阻碍定稿的未知项数组；关键缺失时状态为 draft。

人物增加 `mode`（headless_front 或 full_head），须依据用户本次已确认选择填写，不设置默认；未确认时先等待，不创建猜定模式的presentation，选择依据及适用范围记录在01文档展示设置中。询问与选择不改变JSON schema，也不创建资产状态版本。本轮新人物方案增加 `prompt_contract_version: "1.4.3"`：同图的 `positive_prompt` 与 `negative_prompt` 均为完整非空字符串，正向使用所选完整模板、名称仅在角色标签出现一次并与母资产name一致；负面按所选模式合成公共段和原稿专用追加段。拆图时父对象两种prompt均为null，每个views条目同时提供独立正向与对应视图负面；无头正面和完整背面/面部的负面范围分开。原文缺损等使固定手部词须调整时写 `prompt_exception_reason`，仅豁免通用完整双手词，不能豁免模式/领口边界。旧人物方案无契约版本时保留原字段校验并返回partial迁移警告；未知契约版本返回failed，不将缺失负面视为当前规范已通过。道具增加 `shape_class`（compact/elongated/flat/flexible/irregular/unknown）、`classification_basis`、`orientation`（vertical/horizontal/natural）、`ratio_reason`、`detail_targets`（默认空数组）；按需补视图、拆图或改变默认布局时增加 `extra_view_reason` 说明原因。场景增加 `viewpoint_basis`（机位的空间依据）、`coverage`（本图可见范围与真实遮挡限制），默认 layout 为单幅连续场景全景、board_ratio 为16:9。

道具示例仅示范展示字段，不是完整资产，不提供外观事实：

```json
{
  "presentation": {
    "kind": "prop_board",
    "version_id": null,
    "shape_class": "compact",
    "classification_basis": "按用户已确认的紧凑机身轮廓判断；未测量尺寸",
    "orientation": "natural",
    "ratio_reason": "正侧面轻俯视与背面两幅完整机身横向排布",
    "layout": "左正侧面轻俯视、右背面，两视区等宽并留白",
    "board_ratio": "16:9",
    "split_views": false,
    "views": [
      {"role": "front", "definition": "镜头侧为正面", "angle": "前三分之四，侧绕约35°、轻俯约15°", "image_ratio": "4:3"},
      {"role": "back", "definition": "同一机身的相对背侧", "angle": "后三分之四，轻俯约15°", "image_ratio": "4:3"}
    ],
    "detail_targets": [],
    "positive_prompt": "[以资产事实及本次展示方案组装完整中文提示词]",
    "prompt_status": "draft",
    "pending_fields": ["背面结构待确认"]
  }
}
```

场景示例仅示范单幅展示字段，不提供空间事实：

```json
{
  "presentation": {
    "kind": "scene_view",
    "version_id": null,
    "layout": "单幅连续场景全景，整个画幅为同一空间",
    "board_ratio": "16:9",
    "split_views": false,
    "viewpoint_basis": "[依据已知空间关系选择斜侧观察位置]",
    "coverage": "[说明主要可见区域与遮挡边界]",
    "views": [
      {"role": "overview", "definition": "同一场景同一状态的主要可见空间", "angle": "四分之三全景，从合理斜侧方观察，按需轻微俯视", "image_ratio": "16:9"}
    ],
    "positive_prompt": "[根据场景事实及本次机位组装单幅全景提示词]",
    "prompt_status": "draft",
    "pending_fields": ["具体机位与空间覆盖依据待填"]
  }
}
```

以上占位示例不可原样当作ready交付。人物依 `characterBoard.md`，道具依 `propBoard.md`，场景依 `sceneView.md` 组装真实条目。人工检查字段、版本归属、各类型视区数量与事实边界；场景为一项overview，道具默认两项front/back，人物默认三项front/back/face_detail。

## 外观判断扩展 appearance_development（1.5.0）

新人物与独立道具presentation须添加此对象，不改schema_version。仅清单、未独立制作项仍可省略presentation；旧presentation没有此对象时展示校验返回partial迁移警告，不伪称旧稿已有差异检查。

- `version`：字符串1.5.0。
- `source_coverage`：sufficient、partial、absent，表示已读原文中的外观描述覆盖，不表示设计后覆盖；统计已有原文不得伪装充分。
- `known_fields`、`missing_fields`：非空字符串元素组成的数组，可为空；逐项列原文已知及关键缺项。sufficient也可有非关键缺项。
- `decision`：source_only（原文足够）、user_supplied（用户补充已解决）、ai_design（明确授权AI补缺）、awaiting_user（等待缺项回答）、strict_unresolved（用户选择保留未知）。后两种必须draft且pending_fields与missing_fields非空；partial/absent不能用source_only。未解决的关键缺项不得以字段数组为空掩盖。
- `decision_basis`：非空说明，记录用户原话、适用范围或source_only的充分性依据；沉默/超时不是授权。脚本不证明授权真实，人工回查交互。
- `design_fields`：当前完整提示词使用的AI补全字段全集（含继承的母资产字段）；ai_design须非空，其他决策为空。母资产proposals与版本差异按field合并，版本同字段覆盖，版本空数组不抹掉母设计。凡存在AI方案顶层mode须为design，并检查AI记录结构；已登记但不用于本方案的AI条目不等于已采用。具体AI设计写proposals，不写facts；proposals逐项含field、value、origin=ai_design、basis、authorization_basis、status（proposed/accepted）。用户设定另记来源。脚本不证明proposals与摘要语义一致。
- `visual_signature`：人物含face与body字符串；道具含silhouette、structure、material字符串。可生成完整方案时均填写具体短句并实际进入对应正向；awaiting_user/strict_unresolved允许未知项为空，但不能ready。人物拆图face在face_detail（有头正面也携带），body在front/back；道具两全貌均携带相应主体短句，人工适配不可见表面。使用相同短句便于检查携带，不靠散落在别处的形容词凑合。
- `similarity_exceptions`：人物数组，默认空。每项为`{"asset_id":"CHAR-002","scope":["face"],"user_basis":"用户针对该对象与范围的明确要求"}`，scope允许face/body，一项或两项。用于用户明确同脸/同身体要求；对方母编号须存在且非本身。同一母角色的状态版本之间不用例外；版本与其他母角色比较时，版本省略similarity_exceptions则继承母方案例外，显式空数组表示本版本撤销例外（未撤销则不要写空）。亲缘或双胞胎称呼本身不是完全相同的授权。道具不使用此人物专用字段，同款制式在卡片说明即可。

机器按固定字段检查决策/状态、design_fields和proposals结构、摘要原文携带，以及不同母角色face/body在去空白/标点后的完全重复；明确重复且无针对该维度的有效例外则failed。它不计算真实脸相似度，也不能识别“长脸”与“修长脸型”其实相似；人工必须对照全体表复核。AI方案ready只表示文本输入完整，proposed并不等于用户已采用。

## 参考图职责与机器展示检查

presentation 可添加 reference_bindings 数组；没有参考图时可省略或空数组。每项包含：

- reference_id：本次提取范围内稳定且唯一的非空字符串，不用上传顺序重新分配。
- path：真实参考路径；status为planned时可用null。此字段登记来源，不代表脚本读取或已上传文件。
- status：provided、available或planned。planned不表示已有图片。
- purpose：identity、look_state、geometry、composition、scale、material、style之一；单项只承担一种职责。
- controls、exclusions：非空字符串数组，分别说明允许影响与不得自动继承的具体范围。

同图可以因不同用途建立不同条目，各用唯一reference_id；同一条目复用于多个方案时，各字段必须保持相同。planned参考若决定身份/外观，须保持draft并列pending_fields；机器不验证该参考是否关键，人工检查。

新增展示校验器检查已有presentation，包括类型、角色顺序、比例格式、版本归属、ready/draft、同图/拆图提示词与参考字段。默认视图顺序：人物front/back/face_detail；道具front/back；场景overview。人物替代体态或视图方案、道具额外视图及拆图须extra_view_reason；场景一个方案始终仅overview且不拆图。已有presentation缺字段或错类型返回failed；任何资产/版本缺独立presentation返回partial警告，由人工区分可合理省略、继承母方案或确实缺失；没有presentation时不会误报passed。人物1.4.3契约另检查完整正负段、部分固定中文结构锚点、单次角色标签与母资产name、无头/有头负面互斥，拆图按role分配限制。字段存在不等于语义正确，固定文本检查不能识别所有自然语言冲突或角色别名语义；校验器不读参考文件，不验证文本事实、布局画面或模型支持的比例。

## validation.json 的交付形式

保留原结构校验器的完整实际输出在 `structural` 下，新增展示字段校验器完整实际输出存入 `presentation_structural`，人工审查单列：

```json
{
  "structural": {"status": "passed", "errors": [], "warnings": [], "counts": {}, "limits": "填写校验器实际返回的原文"},
  "presentation_structural": {"status": "not_run", "reason": "示例占位，执行后替换为展示校验器实际输出"},
  "presentation_review": {
    "status": "passed",
    "method": "manual_spec_review",
    "notes": [],
    "image_generation_tested": false
  }
}
```

结构结果必须使用实际输出；未执行时明确为 not_run 与原因。展示复核有缺失或未定稿则标记 partial 并列出问题，不能照抄示例的passed。


## 2.0兼容补充
包版本与数据版本分开。similarity_exceptions.user_basis 沿用字段名，可记录明确同貌的原文来源/证据编号或用户原话；亲缘称呼仍不是同貌证据。身体对齐文本检查只针对同图正背面，不对独立拆图虚构共同像素基线。无衣领、非人形或特殊缺损使模板不适用时，保留真实形态，标记draft并说明替代方案；不添加假衣领迎合校验。
