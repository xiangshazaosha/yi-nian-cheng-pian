# 审片项目与正式交付规则

本文件是审片目录、产物命名、正式输出登记与多风格覆盖的权威入口。建项目、渲染或交付前读取；预检只需要登记时才读，不随所有任务常驻。

这里是审片输出的**项目根目录**，不能再把半成片、抽帧或联系表直接堆在本层。正式成片不存放在任何单项目目录，统一输出到仓库级 `deliverables/final-videos/`。

## 固定结构

`remotion-clone/review/workflow-flash/` 根层只放项目目录、`README.md` 和 `current-project.json`，不得堆放输出文件。每条片只建一个以**片名**命名的目录；继续剪同一条片时复用原目录，不按日期、轮次或一次渲染重复建项目。项目内固定使用 `renders/`、`frames/`、`contact-sheets/`，不另建正式成片 `final/`。

```text
review/workflow-flash/
└─ 片名/
   ├─ project.json       # Composition、源码和素材路径索引
   ├─ renders/           # 分段、半成片、短审片和中间渲染
   ├─ frames/            # 视觉检查抽帧
   └─ contact-sheets/    # 联系表
```

`current-project.json` 是当前项目指针。项目内的 `project.json` 只保存仓库相对路径，移动整个仓库后引用仍然有效。

## 新建或继续项目

在仓库根目录执行：

```powershell
# 首次执行会新建；同片名再次执行只会复用并设为当前项目
npm run review:project -- -Title "片名" -CompositionId "CompositionId" `
  -SourcePath "remotion-clone/src/源码目录" `
  -PublicPath "remotion-clone/public/素材目录"
```

## 渲染正式成片或审片文件

```powershell
# 正式成片：输出到 deliverables/final-videos/<片名>-<风格名>/<片名>-<风格名>-成片.mp4
npm run render:review -- -Title "片名" -CompositionId "CompositionId" -Final -StyleName "风格名"

# 半成片/片段，帧范围沿用 Remotion 的 --frames 语法
npm run render:review -- -Title "片名" -CompositionId "CompositionId" -Frames "0-299"
```

## 正式交付与覆盖验收

- `renders/` 专放分段、半成片、短审片和中间渲染；同名审片输出可自动追加 `-v002`、`-v003`。抽帧归 `frames/`，联系表归 `contact-sheets/`，始终复用同一个片名项目。
- `deliverables/final-videos/` 根层只放 `<片名>-<风格名>/` 目录和说明；不同风格分包，每包平铺，不建任何子目录。成片阶段只要求 `<片名>-<风格名>-成片.mp4`。
- `project.json` 用仓库相对路径登记 Composition、源码、公共素材和正式交付路径；多风格正式成片必须登记 `finalVideoVariants`。
- 正式输出前枚举同片名所有风格目录并核对 `finalVideoVariants`。不同风格绝不覆盖；只有同风格修订通过替换验收后，才可传 `-Overwrite` 覆盖该风格稳定文件。
- 旧式无风格文件名先确认真实风格再迁移；正式包禁止残留 `v2/v003` 轮次副本、分段、短审片、验证流及其他中间文件，不把正式成片放回审片项目。
- 发布资料或封面仅在用户明确请求后按[发布资料规则](../../../docs/delivery-copy-and-tags.md)制作，并直接放在该风格正式包内。未请求时不加载其制作细则，缺少发布资料不影响成片阶段完成；不得编造资料或擅自把审片图当正式封面。
