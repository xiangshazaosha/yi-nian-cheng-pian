# 剪映文件执行器：依赖安装

仅运行时缺失、损坏或维护依赖时读取；日常草稿生成不重新安装。先遵守[项目软件目录规则](../../tools/README.md)，检查已安装版本和依赖，禁止静默全局安装、第二套剪映或GUI控制器。

## 项目内最小依赖

安装位置 `tools/jianying-draft/runtime/`，复用已有 Python、imageio、numpy、Pillow；仅新增以下包，不安装上游可选 GUI 依赖：

```powershell
python -m pip install --no-deps --no-cache-dir --target tools/jianying-draft/runtime pyJianYingDraft==0.3.1 pymediainfo==7.0.1
```

`jianying_backend.py` 直接载入上游文件模块，跳过顶层的 Windows UI 控制器便利导入，不改上游源码，不导入 `uiautomation`。未使用的元信息只存磁盘，不注入会话。首次安装须先检查既有图像依赖，不盲目全量安装。

新电脑不能假定这些图像依赖已经存在。若缺 imageio／numpy／Pillow，先核对当前 Python 可用的包版本／wheel，再仅对缺项按 `python -m pip install --no-deps --no-cache-dir --target tools/jianying-draft/runtime <已核对的包及版本>` 补齐，记录实际版本，不装 GUI extras 或全局依赖。`--no-deps` 不会自动补缺失传递依赖，须按实际导入错误检查必要依赖；已安装包优先复用。MediaInfo 原生库也以当前平台的实际加载和真实媒体读取验证，不以 Python import 成功冒称可生成草稿。

## 安装后验证

验证文件序列化所需模块可导入且不加载GUI控制器，再按[日常生成与验收](./jianying-editing.md)验证真实草稿。安装成功不等于当前剪映版本能打开；历史兼容范围只作[选型参考（未随公开版分发）](../public-release-scope.md)，不能作为新版本承诺。
