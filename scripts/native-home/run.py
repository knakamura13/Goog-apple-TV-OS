from pathlib import Path
import sys, base64, ipaddress, json, re, socket, subprocess, time, uuid, urllib.request
root=Path(__file__).resolve().parents[2]; private=root/'.local/native-home'
mode=sys.argv[1] if len(sys.argv)>1 else 'query'
if mode not in ['query','apply','restore','inspect']:raise SystemExit('Unknown action')
private.mkdir(parents=True,exist_ok=True)
staging='/home/owner/share/tmp/sdk_tools'
# inspect is a shell-only survey: it needs neither the profile nor the compiled helper, so a new
# TV can be read before anything is built or pinned.
files=[]; profile=None
if mode!='inspect':
    profile_file=private/'profile.json'
    if not profile_file.is_file():raise SystemExit('Write .local/native-home/profile.json from profile.example.json; nothing staged.')
    profile=json.loads(profile_file.read_text())
    if not isinstance(profile,dict):raise SystemExit('Profile must be a JSON object; nothing staged.')
    for field in ['model','app_id']:
        if not isinstance(profile.get(field),str) or not profile[field].strip():raise SystemExit('Profile '+field+' is empty; nothing staged.')
    if not re.fullmatch(r'[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{1,52}',profile['app_id'].strip()):raise SystemExit('Profile app_id is not a valid SDK application id; nothing staged.')
    if mode in ['apply','restore'] and not (isinstance(profile.get('version'),str) and profile['version'].strip()):raise SystemExit('Profile version is empty; run query and copy PROFILE_VERSION before apply or restore.')
    files=[(private/'out'/('CleanFrameHomeControl.'+suffix),staging+'/CleanFrameHomeControl.'+suffix) for suffix in ['dll','runtimeconfig.json','deps.json']]
    files.append((profile_file,staging+'/CleanFrameHomeProfile.json'))
    if mode in ['apply','restore']:files.append((private/'original.json',staging+'/CleanFrameHomeOriginal.json'))
    for source,_ in files:
        if not source.is_file():raise SystemExit('Missing reviewed local file, nothing staged: '+str(source))
device_file=root/'.local/device.json'
if not device_file.is_file():raise SystemExit('Missing .local/device.json with the TV host; nothing staged.')
try:
    host=json.loads(device_file.read_text())['host'];ipaddress.ip_address(host)
except (KeyError,TypeError,ValueError):raise SystemExit('.local/device.json has no usable host; nothing staged.')
with urllib.request.urlopen('http://'+host+':8001/api/v2/',timeout=4) as response: info=json.load(response)
observed=info.get('device',{}).get('modelName')
# apply and restore must land on the profiled TV. Query stays read-only and warns instead, so a TV
# whose public API model differs from /etc/prd_info.ini Model can still be surveyed and reported.
if profile is not None and observed!=profile['model'].strip():
    message='Device public API reports '+repr(observed)+', profile expects '+repr(profile['model'].strip())+'.'
    if mode!='query':raise SystemExit('Model guard failed; nothing staged. '+message)
    print('WARNING: read-only query continues. '+message+' If /etc/prd_info.ini reports another model, stop and report; never edit the profile just to satisfy a guard.',file=sys.stderr)
sdb=str(root/'.local/tizen-sdk/tools/sdb');serial=host+':26101'
def run(args,timeout=20):
 p=subprocess.run([sdb,*args],capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('SDB transport failed: '+p.stdout[-300:]+p.stderr[-300:])
 return p
run(['connect',serial],timeout=30)
# Re-stage reviewed helper files on each run so rollback survives SDK temporary-file cleanup.
for source,remote in files:run(['-s',serial,'push',str(source),remote],timeout=60)
token=uuid.uuid4().hex[:12];remote='/home/owner/share/tmp/sdk_tools/cfhi-'+token+'.sh'
run(['-s',serial,'push',str(root/'scripts/native-home'/(mode+'.sh')),remote])
with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as route:
 route.connect((host,9));local=route.getsockname()[0]
with socket.socket() as listener:
 listener.bind((local,0));listener.listen(1);listener.settimeout(18);port=listener.getsockname()[1]
 command='exec 3<>/dev/tcp/'+local+'/'+str(port)+';cat '+remote+'|bash >&3 2>&3;exec 3>&-'
 script='/bin/mkdir /tmp/s-'+token+' 2>/dev/null&&{ '+command+';}'
 encoded=base64.b64encode(script.encode()).decode()
 name='new2.tpk`printf${IFS}%s${IFS}'+encoded+'|base64${IFS}-d|bash`.tpk'
 argument='0 appinstall tpk '+name
 if len(argument.encode())>400:raise SystemExit('Command exceeds reviewed transport length; not executed.')
 proc=subprocess.Popen([sdb,'-s',serial,'shell',argument],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  connection,peer=listener.accept()
  if peer[0]!=host:raise RuntimeError('Unexpected callback peer; no data accepted.')
  chunks=[]
  with connection:
   connection.settimeout(8)
   while True:
    chunk=connection.recv(65536)
    if not chunk:break
    chunks.append(chunk)
    if sum(map(len,chunks))>100000:raise RuntimeError('Unexpectedly large diagnostic output.')
  output=b''.join(chunks).decode(errors='replace')
  try:stdout,stderr=proc.communicate(timeout=8)
  except subprocess.TimeoutExpired:proc.terminate();stdout,stderr=proc.communicate(timeout=3)
  saved=private/(mode+'-output.txt');saved.write_text(output)
  (private/(mode+'-transport.json')).write_text(json.dumps({'returncode':proc.returncode,'stdout':stdout,'stderr':stderr,'remote_probe':remote,'time':time.time()},indent=2))
  print(output)
  missing=[marker for marker in ['CLEANFRAME_HOME_INSPECT_BEGIN','CLEANFRAME_HOME_INSPECT_END'] if marker not in output]
  if missing:
   raise SystemExit('Probe incomplete: missing '+', '.join(missing)+'. The helper may not have started, so the device state is unknown. Full output: '+str(saved)+'. Inspect it before retrying; do not loop the command.')
  status=[line.split('=',1)[1].strip() for line in output.splitlines() if line.startswith('CLEANFRAME_HOME_EXIT=')]
  if len(status)!=1:raise SystemExit('Probe incomplete: no single helper exit status, so the device state is unknown. Full output: '+str(saved)+'.')
  if status[0]!='0':
   tail=[line for line in output.splitlines() if line.strip()][-6:]
   raise SystemExit('Helper exited '+status[0]+'; no further step was run. Last output:\n'+'\n'.join(tail)+'\nFull output: '+str(saved))
  if mode=='query':
   found=[line.split('=',1)[1].strip() for line in output.splitlines() if line.startswith('CLEANFRAME_HOME_JSON=')]
   if len(found)!=1:raise SystemExit('Query output has no single snapshot, so nothing was saved. Full output: '+str(saved))
   try:json.loads(found[0])
   except ValueError:raise SystemExit('Query snapshot is not valid JSON, so nothing was saved. Full output: '+str(saved))
   (private/'query.json').write_text(found[0]+'\n')
   print('Saved .local/native-home/query.json. Review it, then copy it to original.json once, before any apply.')
  print('Wait a few minutes before the next SDB command; sdbd can stay busy after an appinstall.')
 finally:
  if proc.poll() is None:proc.terminate();proc.communicate(timeout=3)
