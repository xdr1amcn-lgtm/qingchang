# 第三方资源来源与许可记录

本文件记录仓库中第三方资源的来源核对进展。轻场自身源码使用 GPL-3.0-only；第三方资源适用各自的许可。以下核对截至 2026-11-15，未完成的事项不能视为已获许可。

## 已核对来源

| 资源 | 核对结果 | 许可和说明 |
| --- | --- | --- |
| NVIDIA Profile Inspector 3.0.2.1 | 仓库中的 exe、exe.config 和 Reference.xml 与[官方发行包](https://github.com/Orbmu2k/nvidiaProfileInspector/releases/tag/v3.0.2.1)内对应文件的 SHA-256 均一致 | [MIT 许可证](vendor/nvidia-profile-inspector/LICENSE.txt)随文件保存。原副本取自本机其他软件安装目录，现已与上游官方文件核对。 |
| PresentMon 2.6.0 | 与[官方发行文件](https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe) SHA-256 一致，`b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af` | [MIT 许可证](vendor/presentmon/LICENSE.txt)随文件保存。 |
| Silero VAD | 与 [sherpa-onnx 发布文件](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) SHA-256 一致，`9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` | [Silero MIT 许可证](assets/live-vad-model.LICENSE.txt)随文件保存；仍需确认该转换版本的附加声明。 |
| CAM++ ONNX 模型 | 与 [sherpa-onnx 发布文件](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx) SHA-256 一致，`f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11` | [原模型页面](https://www.modelscope.cn/models/damo/speech_campplus_sv_zh-cn_16k-common/s)标注 Apache-2.0；ONNX 转换版本是否有附加声明仍待核对。 |
| LibreHardwareMonitor 及随附 DLL | 仓库中的 23 个 DLL 与 [0.9.6 官方发行包](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6)内同名文件 SHA-256 均一致 | [LibreHardwareMonitor MPL-2.0 许可证](vendor/hardware-monitor/LICENSE-LibreHardwareMonitor.txt)已附。其他 DLL 各自的许可与分发义务仍需逐项核对。 |
| PawnIO 2.2.0 安装器 | 与[官方发行文件](https://github.com/namazso/PawnIO.Setup/releases/tag/2.2.0) SHA-256 一致 | [GPL-2.0 文本](vendor/hardware-monitor/LICENSE-PawnIO.txt)已附；还需核对驱动的源码提供方式和可能适用的例外条款。 |

HidSharp 上游[源码](https://github.com/IntergatedCircuits/HidSharp/blob/main-2.6/HidSharp/HidStream.cs)标注 Apache-2.0；其[许可证文本](vendor/hardware-monitor/LICENSE-Apache-2.0.txt)已补入。PawnIO 上游[许可说明](https://github.com/namazso/PawnIO)包含额外例外条款；随附的 `PawnIO-README.md` 包含上游说明，是否适用于本打包方式仍需核对。

## 仍待处理

- `assets/直播伴侣背景-确定版.png` 的办公室背景来源于三角洲官方游戏场景，开发者于 2026-11-15 确认；`media/safe-scene.png` 包含同一背景。公开再分发授权尚未核实，需取得授权或替换/移除。
- 2026-11-15 查询了 [Steam 上的《Delta Force》用户协议](https://store.steampowered.com/eula/2507950_eula_0?eulaLang=schinese)：其中关于游戏视频的有限许可不能直接证明允许在开源软件中分发游戏场景图片。该协议适用于其所述国际服务，不能直接当作国服协议。未找到明确允许本项目以 GitHub 仓库和安装包形式再分发该场景的官方授权；开发者选择保留图片并先查询授权，当前不得将此记为已经获授权。
- 开发者确认主播和哈基蜂人物是自己生成的；该确认不适用于上述官方游戏背景。还需核对其他图标、素材的权利归属及使用的生成服务条款。
- 已收录字体许可证；实际字体文件的版本、来源和署名要求仍需逐一核对。
- 检查各个随附 DLL 的独立许可证，以及 npm 依赖和 Windows 安装包所需的第三方声明。
- 首次提交已经包含上述背景。仅从当前文件夹删除并不足以移除 Git 历史；在公开前还需处理仓库历史，或使用干净的公开仓库。

本清单不是完整法律审查，不能单独作为所有文件已获公开再分发许可的证明。
