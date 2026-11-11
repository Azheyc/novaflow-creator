# 本轮公开来源与吸收边界

核查日期：2026-10-23。以下是维护本Skill的来源说明，不作为剧本事实或运行时依赖。公开Skill仅研究正文，未安装、未执行其工具、未上传用户材料。新规则按本Skill既有证据体系重新组织，未复制第三方代码。

## 用户指定本地依据

`I:/ai/ai skill/优化skill/老唐角色资产无头skill.md`：本轮已读取完整内容。吸收领口平齐、双手外露、左无头/中背面完整头部/右正脸、纯净背景、受控材质与模式互斥。1.4.3按用户最新失败反馈加强：左列边界与不对称结构前置，头发/头颈/面部细节限定中右列，人物默认独立交付模式专用负面，无头和有头追加段按原稿原文保留、互斥使用；其余长串风格排除不机械照搬，正向仍保持正向描述。原参考文件未修改，执行时以随包人物规范自包含运行。

## GitHub一手正文

### zenstory-ai/drama-skills

- 仓库：https://github.com/zenstory-ai/drama-skills
- 本次核实的提交：`fdb7b7c58017e3eae64eca382c2a85ede368dab0`，提交时间2026-10-20T19:21:03Z。
- 直接入口：https://github.com/zenstory-ai/drama-skills/blob/fdb7b7c58017e3eae64eca382c2a85ede368dab0/skills/short-drama-assets/SKILL.md
- 图片提示词入口：https://github.com/zenstory-ai/drama-skills/blob/fdb7b7c58017e3eae64eca382c2a85ede368dab0/skills/short-drama-image-prompts/SKILL.md
- 参考规则：short-drama-assets下references/character-and-look.md、location-and-view.md、prop-and-state.md、continuity-lock.md；short-drama-image-prompts下references/common-recipe.md、edit-and-revision.md、look-and-state-variant.md。
- 核实方式：主代理与研究代理读取GitHub正文；研究代理核实提交及许可证。入口、common-recipe、edit-and-revision及许可证核实固定提交，其他参考读取main正文，未逐文件固定历史版本。
- 许可：MIT，Copyright (c) 2026 drama-skills contributors。仅借鉴方法并重新编写本地规则，未捆绑其源码；日后实质复制其文本/代码须保留版权与许可声明。
- 吸收：身份/视觉状态/视图/场次使用分层、人物妆造与身份分开、地点锚点与观察方位分开、持续身体—物件关系、参考图职责边界、局部修改明确变化与保留项。
- 未采用：其项目专属目录与编号、整套生产流水线、默认英文输出、强制各阶段转交；保留本Skill的人物三栏/道具双视图/场景单幅全景。

### nolanx-ai/nolanx.ai

- 仓库：https://github.com/nolanx-ai/nolanx.ai
- 直接文件：https://github.com/nolanx-ai/nolanx.ai/blob/main/skills/environment-scene-extraction-bible/SKILL.md
- 许可文件：https://github.com/nolanx-ai/nolanx.ai/blob/main/LICENSE
- 核实方式：读取Skill正文与许可证；未取得固定提交。
- 许可：MIT，Copyright (c) 2026 NolanX。
- 吸收：明确地点名称、前中远景层次、同地点稳定地标复用、场景变化明确差异、时间天气与照明状态一致。所有锚点与光照事实继续要求证据，未明确则待确认。
- 未采用：长串排除项；使用单幅连续环境的正向构图描述。

### chatfire-AI/huobao-drama

- 仓库：https://github.com/chatfire-AI/huobao-drama
- 直接文件：https://github.com/chatfire-AI/huobao-drama/blob/master/backend/workspace/skills/extractor/SKILL.md
- 许可文件：https://github.com/chatfire-AI/huobao-drama/blob/master/LICENSE
- 核实方式：直接读取master下Skill及许可证正文；部分第三方索引仍指向旧skills/extractor路径，本轮以实际读到的backend/workspace路径为准；未取得固定提交。
- 许可：CC BY-NC-SA 4.0。仅比较其方法，未复制文本/代码或并入其Skill，避免给本包引入其非商业与相同方式共享约束。
- 有参考价值：先读当前范围与已有资产，再判断复用并关联；样貌与妆造区分。这些与本Skill已有流程相容，以本Skill独立措辞补强。
- 明确未采用：每集道具最多3件、仅按名称去重、同地点不同时段建新场景、道具不输出图片提示词。上述做法与本用户的制作需求及当前证据体系冲突。

## 技能目录检索结果

额外检索到了“智能提取角色技能 | 阅文漫剧助手”“智能提取场景技能 | 阅文漫剧助手”“智能提取道具技能 | 阅文漫剧助手”“S级资产提取V2.3.3”等目录条目。它们是发现线索，本轮未取得可核验的对应GitHub完整源码与许可，未安装、未作为本次规则来源；不能把目录简介等同于已审读源码。

## 验证限制

公开规则存在不等于本地模型必然遵守。结构校验验证数据形状与引用，展示校验验证类型/视区/模式等字段，人工规范审查验证提示词要求；未生成资产图，本轮不宣称视觉效果或语义完整性已经实测。


# 2026-11-05 本次新增研究记录
只参考方法并独立改写；未复制第三方实现、未安装技能、未上传用户剧本。读取的是动态main网页，不声称固定提交或全仓审计。旧章节的历史核查是原包记录，不等于本次重新验证。

| 实际读取页面 | 本次采用 | 未采用/限制 |
| --- | --- | --- |
| https://agentskills.io/specification | 简短入口、标准name、metadata与按需references | 不把平台兼容性当成已安装保证 |
| https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md | 具体用例、断言与质量评估分离 | 不运行其外部工具，不伪报模型对比成绩 |
| https://github.com/zenstory-ai/drama-skills/blob/main/docs/open-source-short-drama-pipeline.md | 稳定可见锚点、身份/状态分开、计划图与真实参考分开 | 不移植其生产接口、目录或授权流程 |
