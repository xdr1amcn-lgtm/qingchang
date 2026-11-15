# 第三方资源来源与许可记录

本文件记录仓库中第三方资源的来源核对进展。轻场自身源码使用 GPL-3.0-only；第三方资源适用各自的许可。以下核对截至 2026-11-15，未完成的事项不能视为已获许可。

## 已核对来源

| 资源 | 核对结果 | 许可和说明 |
| --- | --- | --- |
| NVIDIA Profile Inspector 3.0.2.1 | 仓库中的 exe、exe.config 和 Reference.xml 与[官方发行包](https://github.com/Orbmu2k/nvidiaProfileInspector/releases/tag/v3.0.2.1)内对应文件的 SHA-256 均一致 | [MIT 许可证](vendor/nvidia-profile-inspector/LICENSE.txt)随文件保存。原副本取自本机其他软件安装目录，现已与上游官方文件核对。 |
| PresentMon 2.6.0 | 与[官方发行文件](https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe) SHA-256 一致，`b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af` | [MIT 许可证](vendor/presentmon/LICENSE.txt)随文件保存。 |
| Silero VAD | 与 [sherpa-onnx 发布文件](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) SHA-256 一致，`9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` | [Silero MIT 许可证](assets/live-vad-model.LICENSE.txt)随文件保存；仍需确认该转换版本的附加声明。 |
| CAM++ ONNX 模型 | 与 [sherpa-onnx 发布文件](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx) SHA-256 一致，`f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11` | [原模型页面](https://www.modelscope.cn/models/damo/speech_campplus_sv_zh-cn_16k-common/s)标注 Apache-2.0；ONNX 转换版本是否有附加声明仍待核对。 |
| LibreHardwareMonitor 及随附 DLL | 仓库中的 23 个 DLL 与 [0.9.6 官方发行包](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6)内同名文件 SHA-256 均一致；其中 22 个依赖还与各自版本的 NuGet 包逐文件核对一致 | [MPL-2.0 许可证](vendor/hardware-monitor/LICENSE-LibreHardwareMonitor.txt)已附，各依赖见下表。 |
| PawnIO 2.2.0 安装器 | 与[官方发行文件](https://github.com/namazso/PawnIO.Setup/releases/tag/2.2.0) SHA-256 一致 | [GPL-2.0 文本](vendor/hardware-monitor/LICENSE-PawnIO.txt)已附；还需核对驱动的源码提供方式和可能适用的例外条款。 |

HidSharp 上游[源码](https://github.com/IntergatedCircuits/HidSharp/blob/main-2.6/HidSharp/HidStream.cs)标注 Apache-2.0；其[许可证文本](vendor/hardware-monitor/LICENSE-Apache-2.0.txt)已补入。PawnIO [2.2.0 上游说明](vendor/hardware-monitor/PawnIO-UPSTREAM-README.md)包含额外例外条款；旧的 `PawnIO-README.md` 只是安装器仓库简介，并不包含该条款。是否适用于本打包方式仍需核对。

### 硬件监测库依赖

以下版本与 NuGet 包中相同名称的 DLL 逐字节一致；许可证信息取自各版本 NuGet 包的元数据。各依赖仍适用各自许可。

| 组件 | 版本 | 许可 |
| --- | --- | --- |
| BlackSharp.Core / DiskInfoToolkit / RAMSPDToolkit-NDD | 1.0.7 / 1.1.2 / 1.4.2 | MPL-2.0，源码分别见 [BlackSharp](https://github.com/Blacktempel/BlackSharp/tree/c70b735c6cec123ee8a046ac4a0bc6c606f52cf0)、[DiskInfoToolkit](https://github.com/Blacktempel/DiskInfoToolkit/tree/25319eae5781e75bcf141e844ceab2afe94d40ea)、[RAMSPDToolkit](https://github.com/Blacktempel/RAMSPDToolkit/tree/3b47b960e0830fef344624ad5e389675d5f0a1ce) |
| HidSharp | 2.6.4 | Apache-2.0 |
| Microsoft.Bcl.AsyncInterfaces / Microsoft.Bcl.HashCode | 10.0.3 / 6.0.0 | [MIT](vendor/hardware-monitor/LICENSE-dotnet-MIT.txt) |
| System.Buffers / System.Numerics.Vectors | 4.6.1 / 4.6.1 | MIT |
| System.Memory / System.Runtime.CompilerServices.Unsafe / System.Threading.Tasks.Extensions | 4.6.3 / 6.1.2 / 4.6.3 | MIT |
| System.Security.AccessControl / System.Security.Principal.Windows | 6.0.0 / 5.0.0 | MIT |
| System.CodeDom、System.Collections.Immutable、System.Formats.Nrbf、System.IO.Pipelines、System.Reflection.Metadata、System.Resources.Extensions、System.Text.Encodings.Web、System.Text.Json、System.Threading.AccessControl | 均为 10.0.3 | MIT |

### 字体和语音运行库

七个字体文件的内嵌许可证标记均为 SIL OFL 1.1，仓库的 `media/` 目录中保留了相应许可证。文件元数据版本如下，未据此断言所有字体均与上游原始二进制逐字节一致：

| 字体文件 | 内嵌版本 | 许可证 |
| --- | --- | --- |
| LiuJianMaoCao.ttf / LongCang.ttf / MaShanZheng.ttf | 1.003 / 2.001 / 2.003 | [Liu Jian Mao Cao](media/liujianmaocao-OFL.txt)、[Long Cang](media/longcang-OFL.txt)、[Ma Shan Zheng](media/mashanzheng-OFL.txt) |
| NotoSansSC.ttf / NotoSerifSC.ttf | 2.004-H2 / 2.003-H1 | [Noto Sans SC](media/NotoSansSC-OFL.txt)、[Noto Serif SC](media/notoserifsc-OFL.txt)；后者补充了字体内嵌的 Adobe 版权声明 |
| SmileySans.woff2 / ZhiMangXing.ttf | 2.0.1 / 2.001 | [Smiley Sans](media/SmileySans-LICENSE.txt)、[Zhi Mang Xing](media/zhimangxing-OFL.txt) |

运行依赖 `sherpa-onnx-node` 与 `sherpa-onnx-win-x64` 均为 1.13.8，包元数据标注 Apache-2.0，随附 [sherpa-onnx 许可证](licenses/sherpa-onnx-APACHE-2.0.txt)。Windows 原生包中包含 ONNX Runtime DLL，随附其 [MIT 许可证](licenses/onnxruntime-MIT.txt)。以上是已识别的主要项目，不能代替对原生二进制所有嵌入依赖及其声明的完整核对。

## 仍待处理

- `assets/直播伴侣背景-确定版.png` 的办公室背景来源于三角洲官方游戏场景，开发者于 2026-11-15 确认；`media/safe-scene.png` 包含同一背景。公开再分发授权尚未核实，需取得授权或替换/移除。
- 2026-11-15 查询了 [Steam 上的《Delta Force》用户协议](https://store.steampowered.com/eula/2507950_eula_0?eulaLang=schinese)：其中关于游戏视频的有限许可不能直接证明允许在开源软件中分发游戏场景图片。该协议适用于其所述国际服务，不能直接当作国服协议。未找到明确允许本项目以 GitHub 仓库和安装包形式再分发该场景的官方授权；开发者选择保留图片并先查询授权，当前不得将此记为已经获授权。
- 开发者确认主播和哈基蜂人物是自己生成的；该确认不适用于上述官方游戏背景。还需核对其他图标、素材的权利归属及使用的生成服务条款。
- 字体许可证与文件内嵌的版本、版权信息已核对；还未完成上游字体原始文件哈希比对。
- 继续核对语音原生包内部依赖、CAM++ 和 Silero 的转换版本附加声明，以及 Windows 安装包所需的完整第三方声明。
- 首次提交已经包含上述背景。仅从当前文件夹删除并不足以移除 Git 历史；在公开前还需处理仓库历史，或使用干净的公开仓库。

本清单不是完整法律审查，不能单独作为所有文件已获公开再分发许可的证明。
