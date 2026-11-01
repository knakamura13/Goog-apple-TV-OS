from pathlib import Path
import sys, base64, hashlib, ipaddress, json, re, socket, subprocess, time, uuid, urllib.request
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
    try:profile=json.loads(profile_file.read_text())
    except ValueError:raise SystemExit('Profile is not valid JSON; nothing staged.')
    if not isinstance(profile,dict):raise SystemExit('Profile must be a JSON object; nothing staged.')
    for field in ['model','app_id']:
        if not isinstance(profile.get(field),str) or not profile[field].strip():raise SystemExit('Profile '+field+' is empty; nothing staged.')
    if not re.fullmatch(r'[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{1,52}',profile['app_id'].strip()):raise SystemExit('Profile app_id is not a valid SDK application id; nothing staged.')
    if profile.get('version') is not None and not isinstance(profile.get('version'),str):raise SystemExit('Profile version must be a JSON string or null; nothing staged.')
    if mode in ['apply','restore'] and not (profile.get('version') or '').strip():raise SystemExit('Profile version is empty; run query and copy PROFILE_VERSION before apply or restore.')
    files=[(private/'out'/('CleanFrameHomeControl.'+suffix),staging+'/CleanFrameHomeControl.'+suffix) for suffix in ['dll','runtimeconfig.json','deps.json']]
    files.append((profile_file,staging+'/CleanFrameHomeProfile.json'))
    if mode in ['apply','restore']:files.append((private/'original.json',staging+'/CleanFrameHomeOriginal.json'))
    for source,_ in files:
        if not source.is_file():raise SystemExit('Missing reviewed local file, nothing staged: '+str(source))
    # The staged DLL runs whatever was compiled. Stamp the reviewed source next to the build
    # (see README) so a stale helper cannot reach the TV in a writing mode.
    helper_source=root/'scripts/native-home'/'Control.cs'; stamp=private/'out'/'CONTROL_SHA256'
    if not helper_source.is_file():raise SystemExit('Missing scripts/native-home/Control.cs, so the build cannot be reviewed; nothing staged.')
    if not stamp.is_file():
        message='No CONTROL_SHA256 stamp beside the compiled helper, so the build cannot be matched to scripts/native-home/Control.cs.'
        if mode in ['apply','restore']:raise SystemExit(message+' Rebuild and stamp it (see scripts/native-home/README.md); nothing staged.')
        print('WARNING: '+message+' Rebuild before apply or restore.',file=sys.stderr)
    else:
        try:recorded=stamp.read_text().split()[0].strip().lower()
        except (IndexError,OSError):recorded=''
        actual=hashlib.sha256(helper_source.read_bytes()).hexdigest()
        if recorded!=actual:
            message='The compiled helper does not match scripts/native-home/Control.cs (stamp '+recorded[:12]+', source '+actual[:12]+').'
            if mode in ['apply','restore']:raise SystemExit(message+' Rebuild before apply or restore; nothing staged.')
            print('WARNING: '+message+' Rebuild before apply or restore.',file=sys.stderr)
device_file=root/'.local/device.json'
if not device_file.is_file():raise SystemExit('Missing .local/device.json with the TV host; nothing staged.')
try:
    host=json.loads(device_file.read_text())['host'];ipaddress.ip_address(host)
except (KeyError,TypeError,ValueError):raise SystemExit('.local/device.json has no usable host; nothing staged.')
observed=None
try:
    with urllib.request.urlopen('http://'+host+':8001/api/v2/',timeout=4) as response: observed=json.load(response).get('device',{}).get('modelName')
except Exception as error:
    # inspect and query write no settings, so they continue and report; apply and restore stop.
    if mode in ['apply','restore']:raise SystemExit('Cannot read the device model from http://'+host+':8001/api/v2/ ('+str(error)+'); nothing staged.')
    print('WARNING: device API unreachable ('+str(error)+'); '+mode+' continues and writes no settings.',file=sys.stderr)
# apply and restore must land on the profiled TV. Query stays read-only and warns instead, so a TV
# whose public API model differs from /etc/prd_info.ini Model can still be surveyed and reported.
if profile is not None and observed is not None and observed!=profile['model'].strip():
    message='Device public API reports '+repr(observed)+', profile expects '+repr(profile['model'].strip())+'.'
    if mode!='query':raise SystemExit('Model guard failed; nothing staged. '+message)
    print('WARNING: read-only query continues. '+message+' If /etc/prd_info.ini reports another model, stop and report; never edit the profile just to satisfy a guard.',file=sys.stderr)
sdb_path=root/'.local/tizen-sdk/tools/sdb'
if not sdb_path.is_file():raise SystemExit('Missing .local/tizen-sdk/tools/sdb (the private SDK); nothing staged.')
sdb=str(sdb_path);serial=host+':26101'
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
  try:connection,peer=listener.accept()
  except socket.timeout:
   # An accepted-but-queued connection can still run the helper after this point, so the timeout
   # means "result unknown", never "nothing happened".
   raise SystemExit('No callback from the TV within 18 s. The helper may still have run, so the device state is unknown: run a read-only query before retrying, and do not loop this command. sdbd or the package manager may also still be busy.')
  if peer[0]!=host:raise RuntimeError('Unexpected callback peer; no data accepted.')
  chunks=[]
  stalled=False
  with connection:
   connection.settimeout(8)
   try:
    while True:
     chunk=connection.recv(65536)
     if not chunk:break
     chunks.append(chunk)
     if sum(map(len,chunks))>100000:raise RuntimeError('Unexpectedly large diagnostic output.')
   except socket.timeout:stalled=True
  output=b''.join(chunks).decode(errors='replace')
  try:stdout,stderr=proc.communicate(timeout=8)
  except subprocess.TimeoutExpired:proc.terminate();stdout,stderr=proc.communicate(timeout=3)
  saved=private/(mode+'-output.txt');saved.write_text(output)
  (private/(mode+'-transport.json')).write_text(json.dumps({'returncode':proc.returncode,'stdout':stdout,'stderr':stderr,'remote_probe':remote,'time':time.time()},indent=2))
  print(output)
  if stalled:raise SystemExit('The TV stopped sending output before the run finished, so the result is unknown; any partial output is saved. Run a read-only query before retrying. Full output: '+str(saved))
  missing=[marker for marker in ['CLEANFRAME_HOME_INSPECT_BEGIN','CLEANFRAME_HOME_INSPECT_END'] if marker not in output]
  if missing:
   raise SystemExit('Probe incomplete: missing '+', '.join(missing)+'. The helper may not have started, so the device state is unknown. Full output: '+str(saved)+'. Inspect it before retrying; do not loop the command.')
  status=[line.split('=',1)[1].strip() for line in output.splitlines() if line.startswith('CLEANFRAME_HOME_EXIT=')]
  if len(status)!=1:raise SystemExit('Probe incomplete: no single helper exit status, so the device state is unknown. Full output: '+str(saved)+'.')
  if status[0]!='0':
   lines=[line for line in output.splitlines() if line.strip()]
   summary=[line for line in lines if line.startswith('CLEANFRAME_HOME_ERROR=')]
   if not summary:
    summary=[line for line in lines if 'Exception:' in line][:1] or lines[-3:]
   raise SystemExit('Helper exited '+status[0]+'; no further step was run. '+'\n'.join(summary)+'\nFull output: '+str(saved))
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
