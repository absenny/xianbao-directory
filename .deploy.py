'use strict';
import os, sys, time, zipfile
from paramiko import SSHClient, AutoAddPolicy

HOST, PORT, USER = '115.159.221.120', 22, 'root'
PWD = os.environ.get('SSH_PWD')
if not PWD:
    sys.exit('ERROR: SSH_PWD env var not set')
LOCAL_OUT = r'C:\Users\Administrator\WorkBuddy\2026-07-21-22-00-44\single-site\output'
ZIP_PATH = r'C:\Users\Administrator\WorkBuddy\2026-07-21-22-00-44\single-site\.deploy.zip'

# 1) 本地打包 output 目录（若已存在则跳过，便于续传）
print('[1/4] zipping output ...', flush=True)
if os.path.exists(ZIP_PATH):
    print('      zip already exists, skip', flush=True)
else:
    t0 = time.time()
    n = 0
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(LOCAL_OUT):
            for fn in files:
                fp = os.path.join(root, fn)
                arc = os.path.relpath(fp, LOCAL_OUT)
                z.write(fp, arc)
                n += 1
    print(f'      zip done: {n} files, {os.path.getsize(ZIP_PATH)//1024//1024} MB, {round(time.time()-t0)}s', flush=True)

# 2) SSH 连接
print('[2/4] connecting ssh ...', flush=True)
ssh = SSHClient()
ssh.set_missing_host_key_policy(AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PWD, timeout=30)
print('      connected', flush=True)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode('utf-8', 'replace'), stderr.read().decode('utf-8', 'replace')

# 3) 目标目录（由 nginx vhost 确认的真实 web root；保留 .user.ini）
target = '/www/wwwroot/s.xianbao.fan'
run(f"mkdir -p {target}")
print('      target dir:', target, flush=True)

# 4) 上传 + 解压 + 清理残留信用卡 + 校验
print('[3/4] uploading zip ...', flush=True)
sftp = ssh.open_sftp()
sftp.put(ZIP_PATH, target + '/_deploy.zip')
sftp.close()
print('      upload done', flush=True)

print('[4/4] extracting + cleanup + verify ...', flush=True)
# 强制用 python3 zipfile 解压，保证中文文件名以 UTF-8 落盘（unzip 会误判编码导致 404）
out, err = run(
    f"cd {target} && "
    f"python3 -c \"import zipfile;zipfile.ZipFile('_deploy.zip').extractall('.')\" && "
    f"rm -f _deploy.zip"
)
if out.strip() or err.strip():
    print('      extract out:', out.strip(), '| err:', err.strip(), flush=True)
# 仅统计含"信用卡"的文件数用于校验（绝不删除，避免误删正常页面）
out, err = run(f"cd {target} && echo CARD_FILES=$(grep -rl 信用卡 . 2>/dev/null | wc -l)")
if out.strip():
    print('      ', out.strip(), flush=True)
out, err = run(
    f"cd {target} && echo HTML=$(find . -name '*.html' | wc -l) "
    f"&& echo SITEMAP=$(ls sitemap*.xml 2>/dev/null | wc -l) "
    f"&& ls -1 index.html style.css robots.txt 2>/dev/null"
)
print('      verify:', out.strip(), flush=True)
if err.strip():
    print('      verify err:', err.strip(), flush=True)
ssh.close()
print('DEPLOY OK', flush=True)
