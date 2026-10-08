# HANDOFF — 砚舟 · D4-20260925-019 研讨室群聊版挂载上线

更新：2026-09-25 23:47

## 已完成（本窗口）
- 前端群聊版改造 + 部署到生产 /opt/cockpit/（md5 一致，备份 backup_20260925_2343_seminar/ 可回滚）
  - 修复 9527 原始 discussion.js 的 CSS 数组漏引号语法错误
  - 研讨室改双 Tab「自由研讨 / 微信群聊」，默认进群聊
  - 生产前缀 API 不通只显示「数据接入中」，不渲染 mock（红线①）
- 后端接口核对：cockpit-hall 运行中，三个接口齐全，/api/discussion/run 代理真实 Dify 圆桌 Chatflow
- 向初墨投「进度 + nginx 反代授权申请 + 真跑费用申报」（收件箱）

## 阻塞（需要初墨授权）
- nginx 缺 /cockpit/api/ -> 172.20.0.1:8792/api/ 反代；yanzhou_audit 无写 nginx 配置权限
- 真跑 1 次 Dify 圆桌（费用 ¥0.2–2 待批）后才能出完整验收回执

## 下一步（拿到授权后）
1. 加反代块 + nginx -t + reload
2. 建房间真跑 1 次，验收多角色气泡/轮次/小墨纪要/历史留存
3. 1440/390 截图 + 控制台 0 错 + 完整回执投收件箱

## 关键路径/凭据
- 服务器：ssh -i G:\Codex\99_系统\凭据\yanzhou_audit_key yanzhou_audit@150.158.115.88
- 生产目录：/opt/cockpit/（宿主可写），conf.d 反代需 root 授权
- 本地 d4-spa：G:\Codex\01_项目\cockpit-knowledge-graph\d4-spa

---

# 补充 · D4-20260929 宣传剧本技术评审（砚舟，2026-09-29 15:31）

## 已完成
- 评审初墨《驾驶舱宣传视频剧本》，回执已投共享区收件箱：A_任务卡\00_待登记收件箱\砚舟_驾驶舱宣传视频剧本评审_20260929\，工作区副本 G:\Codex\06_输出\评审回执_驾驶舱宣传剧本_砚舟_20260929.md。

## 关键事实（供后续维护）
- 生产 v0.8 = /opt/cockpit/，app.js md5 4AAF4AEACA3B09FC9E53F329CC41678F，与本地快照 99_系统\tmp\v08_screens\cockpit 一致。
- 知识图谱实装为 graph-force.js（2D 力导向，363 节点），galaxy3d.js 存在但未被 index.html 引用（3D 未启用）。
- 员工对话 doSend 走真实 POST api/chat SSE；研讨室走 /api/rooms + /api/discussion/history；后端接口需登录态（未登录返回 unauthorized）。
- 知识库健康看板 /cockpit/kb-health/health_dashboard.json 为线上真实值（357/10064/0/0/100%，每5分钟刷新）。
- 敏感外露点（老板拍板：不处理，仅备忘）：顶部导航外链 http://150.158.115.88/research/ 露公网 IP；总览健康面板显示「Token 余量」（bocha 配额换算 69.7%）。

## 进展补充（16:10）
- 老板已完成 v0.8 实机录屏；剪辑注意事项已投共享区同目录（剪辑注意事项_驾驶舱宣传视频_砚舟_20260929.md）。

## 未完成 / 下一步
- 无阻塞。若后续宣传成片有新需求（如补研讨室已打开截图），需在已登录会话实拍。


---
# 环境变更 · 系统级 PowerShell 7.6.6（2026-10-01 18:40 砚舟执行）
- winget install Microsoft.PowerShell 7.6.6.0（MSIX 版，实体在 WindowsApps，别名 %LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe）。
- 系统 5.1 保留共存（老板问能否卸载：不能，Windows 组件，系统更新/DISM/WMI/计划任务依赖，微软官方为 5.1+7 并存）。
- Codex 自带 pwsh 7.6.5 不受影响，工作区 exec_command 仍走自带版。


# 环境变更补充（2026-10-01 18:57 砚舟）
- Windows Terminal 1.24 已装（winget，MSIX）；首启已生成 settings.json。
- 默认 profile 已改为 PowerShell 7（GUID {574e775e-4f2a-5b96-ac1e-a2962a402336}），改前备份 settings.json.bak_yanzhou_20261001。
- 结果：老板日常开终端即 PowerShell 7.6.6；系统组件继续 5.1，共存不冲突。

