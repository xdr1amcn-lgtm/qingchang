# 第三方资源与公开前核对

此文件用于整理仓库候选中的来源线索，不构成完整许可审计。第三方资源继续适用其原许可证，项目自身的许可证不会自动覆盖它们。

| 资源 | 当前材料 | 公开前要核对 |
| --- | --- | --- |
| LibreHardwareMonitor 与 PawnIO | `vendor/hardware-monitor/` 中有来源、哈希、NOTICE 和许可文件 | 检查二进制及随附 .NET 组件各自的许可、再分发义务与源码获取要求 |
| PresentMon | `vendor/presentmon/SOURCE.json`、`LICENSE.txt` | 核对文件哈希、许可证文本及分发义务 |
| NVIDIA Profile Inspector | `vendor/nvidia-profile-inspector/ORIGIN.md`、`LICENSE.txt` | 当前副本记录取自本机 1U 安装目录；核对二进制与官方来源和许可的对应关系，必要时替换为可核验的上游版本并重新测试 |
| CAM++ 声纹模型 | `assets/live-speaker-campplus.SOURCE.txt` | 核实具体模型权重、ONNX 转换分发版本的许可证和再分发条件；上游项目代码许可不自动证明模型权重许可 |
| Silero VAD 模型 | `assets/live-vad-model.LICENSE.txt` | 核对包含的模型文件与来源、哈希及许可说明一致 |
| 内置字体 | `media/` 中保留 OFL 或字体许可证文件 | 逐一核对实际字体文件、许可证及署名要求 |
| Electron、sherpa-onnx、electron-builder 等 npm 依赖 | 依赖清单与锁文件 | 核查依赖许可证以及打包产物需要携带的第三方许可说明 |
| 品牌图标、角色、背景及游戏相关图像 | `assets/`、`media/` | 确认素材权利归属、所用参考及公开再分发授权 |

其中部分资源为本地发布包内原样携带的二进制或模型。它们被保留在候选目录中，是为了后续核验与重建，不表示已确认可公开再分发。
