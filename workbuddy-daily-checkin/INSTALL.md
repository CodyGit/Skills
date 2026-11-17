# workbuddy-daily-checkin 安装说明（WorkBuddy）

这是 WorkBuddy 每日积分自动签到 skill 的安装说明。请帮我完成安装和配置，全程不需要我操作：

1. 下载并安装 skill：
   - zip 与本文件在同一目录下。取得本文件所用的下载地址后，把地址里的文件名 workbuddy-daily-checkin-INSTALL.md 换成 workbuddy-daily-checkin.zip，其余部分（包括 ? 之后的参数）保持不变，即为 zip 的下载地址。示例：
     - 本文件地址：`https://github.com/<owner>/<repo>/releases/download/latest/workbuddy-daily-checkin-INSTALL.md`
     - zip 地址：`https://github.com/<owner>/<repo>/releases/download/latest/workbuddy-daily-checkin.zip`
   - 在系统临时目录下新建一个空目录，把 zip 下载并解压到里面。
   - 将解压出的 workbuddy-daily-checkin 文件夹复制到 ~/.workbuddy/skills/ 下（Windows 是 C:\Users\<用户名>\.workbuddy\skills\）。目录已存在则整个覆盖，视为更新。
   - 确认 ~/.workbuddy/skills/workbuddy-daily-checkin/SKILL.md 存在。
2. 手动跑一次签到验证：
   node ~/.workbuddy/skills/workbuddy-daily-checkin/scripts/checkin.js
   如果提示找不到 node，就用 ~/.workbuddy/binaries/node/versions/ 下的内置 Node。
3. 验证通过后，先检查是否已有名为"WorkBuddy 每日积分自动签到"的定时任务。已有则更新它，没有再用 automation_update 创建：
   - name: WorkBuddy 每日积分自动签到
   - scheduleType: recurring
   - rrule: FREQ=DAILY;BYHOUR=9;BYMINUTE=0
   - status: ACTIVE
   - prompt 里写：执行 WorkBuddy 每日积分自动签到，运行命令
     node "<上一步实际的 skill 绝对路径>/scripts/checkin.js"，读取输出简要汇报；
     若失败提醒我确认 WorkBuddy 已启动并登录。
4. 告诉我：签到验证结果、下次执行时间，以及中间有没有报错。
