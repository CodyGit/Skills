# Skills

个人开发的 Claude / WorkBuddy skills 集合。每个 skill 是一个独立的顶层目录。

## 目录约定

```
<skill-name>/
├── SKILL.md        # 必需。frontmatter 含 name、description，正文为使用说明
├── scripts/        # 可选。可执行脚本
├── references/     # 可选。按需加载的参考文档
└── INSTALL.md      # 可选。安装说明
```

- 目录名与 `SKILL.md` 中的 `name` 保持一致，使用 kebab-case。
- 新建代码文件需带 date / author / description 注释头；Markdown 文件不加。

## Skills 列表

| Skill | 说明 |
|---|---|
| [workbuddy-daily-checkin](./workbuddy-daily-checkin) | WorkBuddy 每日积分自动签到，通过本机 wbipc 通道调用官方接口，可配合定时任务全自动领取 |

## 安装

将目标 skill 目录复制到对应工具的 skills 目录下：

- Claude Code：`~/.claude/skills/`
- WorkBuddy：`~/.workbuddy/skills/`

各 skill 的具体依赖与用法见其目录内的 `SKILL.md`。

## 一句话安装

推送到 `main` / `master` 后，GitHub Actions 会把每个 skill 的 zip 和 `<skill>-INSTALL.md` 上传到 tag 为 `latest` 的 Release，同名附件每次覆盖。把安装说明的下载地址发给 Agent 即可：

```
参考 https://github.com/<owner>/<repo>/releases/download/latest/<skill>-INSTALL.md 安装
```

安装说明里只写文件名，Agent 会把地址中的 `<skill>-INSTALL.md` 换成 `<skill>.zip` 得到 zip 的下载地址。不同 Agent 的安装步骤写在各 skill 自己的 `INSTALL.md` 中。

## 打包

`ci/package.py` 遍历顶层目录，把含 `SKILL.md` 的目录打成 `dist/<skill>.zip`（排除 `INSTALL.md`），并将 `INSTALL.md` 复制为 `dist/<skill>-INSTALL.md`。只依赖 Python 标准库：

```bash
python ci/package.py
```
