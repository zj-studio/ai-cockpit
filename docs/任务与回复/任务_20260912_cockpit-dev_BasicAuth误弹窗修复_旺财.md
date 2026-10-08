# 任务卡 · cockpit-v070_dev Basic Auth 误弹窗修复

**派卡**：砚舟（Codex）  
**执行人**：旺财（WorkBuddy）  
**主送**：老板  
**抄送**：初墨  
**日期**：2026-09-12  
**优先级**：P1  
**范围**：仅修 `/cockpit-v070_dev/hall.js`，不碰生产 v0.6.3

---

## 一、现象

打开：

```text
http://150.158.115.88/cockpit-v070_dev/#/graph
```

浏览器弹出：

```text
登录以访问此站点
http://150.158.115.88 要求进行身份验证
```

用户输入驾驶舱账号密码仍不通过。

这不是账号问题，也不应该要求登录。

---

## 二、已定位根因

当前 dev 页面加载：

```text
/cockpit-v070_dev/hall.js?v=0.7.0
```

其中：

```javascript
var PREFIX = (location.pathname.match(/^\/(?:cockpit-v063|cockpit-v070)\//) || ["/cockpit-v063/"])[0];
var API = PREFIX + "api";
```

正则不包含 `cockpit-v070_dev`。

因此访问 `/cockpit-v070_dev/#/graph` 时匹配失败，代码回退为：

```text
/cockpit-v063/
```

随后产生：

```text
GET /cockpit-v063/api/employees
GET /cockpit-v063/data.json
```

这两个生产接口受 Basic Auth 保护，返回：

```text
401 Unauthorized
WWW-Authenticate: Basic realm="Cockpit"
```

浏览器因此弹出登录框。

---

## 三、验证证据

dev 自有接口正常且不需口令：

```text
GET /cockpit-v070_dev/data.json        -> 200
GET /cockpit-v070_dev/api/employees   -> 200
```

生产接口受保护：

```text
GET /cockpit-v063/data.json           -> 401
GET /cockpit-v063/api/employees      -> 401
```

结论：修复路径判断后，dev 页面会使用自己的 200 接口，不再触发 Basic Auth。

---

## 四、修复内容

修改 dev 预览中的 `hall.js`：

```diff
- var PREFIX = (location.pathname.match(/^\/(?:cockpit-v063|cockpit-v070)\//) || ["/cockpit-v063/"])[0];
+ var PREFIX = (location.pathname.match(/^\/(?:cockpit-v063|cockpit-v070(?:_dev)?)\//) || ["/cockpit-v063/"])[0];
```

修改后 `/cockpit-v070_dev/` 会正确得到：

```text
PREFIX = "/cockpit-v070_dev/"
API = "/cockpit-v070_dev/api"
```

`hall.js` 的 `data.json` 和 API 请求不再落到生产 v063。

---

## 五、施工要求

1. 修改前备份宿主和 nginx 容器内的 `hall.js`。
2. 只修改 `/opt/cockpit-v070_dev/hall.js` 对应文件。
3. 同步到 nginx 容器：

```text
/usr/share/nginx/html/cockpit-v070_dev/hall.js
```

4. `node --check hall.js`。
5. 确认宿主和容器内文件 SHA256 一致。
6. 不修改生产 `/cockpit-v063/`，不修改 nginx 认证配置。

---

## 六、浏览器验收

使用无缓存新窗口打开：

```text
http://150.158.115.88/cockpit-v070_dev/#/graph
http://150.158.115.88/cockpit-v070_dev/#/employees
```

必须确认：

1. 不再出现 Basic Auth 登录弹窗。
2. 不再请求 `/cockpit-v063/data.json`。
3. 不再请求 `/cockpit-v063/api/employees`。
4. 改为请求：

```text
/cockpit-v070_dev/data.json
/cockpit-v070_dev/api/employees
```

5. 两个请求均为 200。
6. `/graph` 知识图谱仍正常渲染。
7. 员工大厅仍正常显示员工和模型标签。
8. Console Page Error 为 0。
9. 原有的 34 条 401 应消失。

---

## 七、完成回报

回“工作已完成”，附：

1. 修改前 `hall.js` 大小与 SHA256。
2. 修改后宿主 `hall.js` 大小与 SHA256。
3. 修改后容器 `hall.js` 大小与 SHA256。
4. `node --check` 结果。
5. `/graph` 和 `/employees` 的截图。
6. 网络请求清单，证明两个 v063 请求已消失。
7. Console 分类统计。
8. 回滚路径与命令。
9. 明确声明生产 v0.6.3 未变。

---

## 八、红线

- 不碰生产 v0.6.3。
- 不修改 nginx Basic Auth。
- 不为 dev 页面配置生产账号。
- 不把任何口令写入代码、截图或回执。
