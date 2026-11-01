using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
class Control {
 const string Operation="http://tizen.org/appcontrol/operation/main";
 static readonly string[] Keys={"db/appfw/home_appid","db/appfw/startup_appid","db/appfw/booting_appid_backup","db/first_screen/type"};
 // These two are re-derived by the firmware; apply never writes them, so restore reports them.
 static readonly string[] Derived={"db/appfw/startup_appid","db/appfw/booting_appid_backup"};
 const string AutoKey="db/menu/smart_hub/ontvsetting/auto_start";
 [DllImport("libbundle.so.0")] static extern IntPtr bundle_create();
 [DllImport("libbundle.so.0")] static extern void bundle_free(IntPtr b);
 [DllImport("libaul.so.0")] static extern int aul_svc_set_operation(IntPtr b,string op);
 [DllImport("libaul.so.0")] static extern int aul_get_default_app(IntPtr b,out IntPtr app);
 [DllImport("libapp-context-manager-common.so")] static extern byte util_is_appbooting_supported_webapp_byappid(string app);
 [DllImport("libcapi-appfw-app-operation-tv.so.0")] static extern int app_operation_set_current_app(string op,string app);
 [DllImport("libvconf.so.0")] static extern int vconf_set_str(string key,string value);
 [DllImport("libvconf.so.0")] static extern IntPtr vconf_get_str(string key);
 [DllImport("libvconf.so.0")] static extern int vconf_set_int(string key,int value);
 [DllImport("libvconf.so.0")] static extern int vconf_get_int(string key,out int value);
 [DllImport("libc")] static extern uint getuid();
 [DllImport("libc")] static extern void free(IntPtr ptr);
 public class Snapshot {public string Home{get;set;} public Dictionary<string,string> Strings{get;set;} public int Autostart{get;set;} public uint Uid{get;set;} public int BootSupport{get;set;} public string Model{get;set;} public string AppId{get;set;}}
 public class Profile {
  [JsonPropertyName("model")] public string Model{get;set;}
  [JsonPropertyName("version")] public string Version{get;set;}
  [JsonPropertyName("app_id")] public string AppId{get;set;}}
 static string ReadString(string key){IntPtr p=vconf_get_str(key);if(p==IntPtr.Zero)throw new Exception("Cannot read "+key);try{return Marshal.PtrToStringAnsi(p);}finally{free(p);}}
 static string Home(){IntPtr b=bundle_create();if(b==IntPtr.Zero)throw new Exception("No bundle");try{if(aul_svc_set_operation(b,Operation)!=0)throw new Exception("Cannot set query operation");IntPtr p;if(aul_get_default_app(b,out p)!=0||p==IntPtr.Zero)throw new Exception("Cannot read Home operation");try{return Marshal.PtrToStringAnsi(p);}finally{free(p);}}finally{bundle_free(b);}}
 // Boot eligibility is advisory: a missing or changed symbol must not stop the read-only query.
 static int BootProbe(string app){try{return util_is_appbooting_supported_webapp_byappid(app)!=0?1:0;}catch(Exception e) when (e is EntryPointNotFoundException||e is DllNotFoundException||e is MarshalDirectiveException){return -1;}}
 static Snapshot Query(Profile p){var s=new Snapshot{Home=Home(),Strings=new Dictionary<string,string>(),Uid=getuid(),BootSupport=BootProbe(p.AppId),Model=p.Model,AppId=p.AppId};foreach(var k in Keys)s.Strings[k]=ReadString(k);int v;if(vconf_get_int(AutoKey,out v)!=0)throw new Exception("Cannot read autostart");s.Autostart=v;return s;}
 static void SetString(string key,string value){if(vconf_set_str(key,value)!=0||ReadString(key)!=value)throw new Exception("String write/readback failed: "+key);}
 static void SetAuto(int value){int v;if(vconf_set_int(AutoKey,value)!=0||vconf_get_int(AutoKey,out v)!=0||v!=value)throw new Exception("Autostart write/readback failed");}
 static void SetHome(string value){if(app_operation_set_current_app(Operation,value)!=0||Home()!=value)throw new Exception("Home operation write/readback failed");}
 static void Restore(Snapshot s){SetHome(s.Home);foreach(var k in Keys)SetString(k,s.Strings[k]);SetAuto(s.Autostart);}
 static string PackageDir(string appId){return "/opt/usr/apps/"+appId.Split('.')[0];}
 static Profile ReadProfile(string path){
  var p=JsonSerializer.Deserialize<Profile>(File.ReadAllText(path));if(p==null)throw new Exception("Profile is empty");
  if(p.Model!=null)p.Model=p.Model.Trim();if(p.AppId!=null)p.AppId=p.AppId.Trim();if(p.Version!=null)p.Version=p.Version.Trim().TrimEnd(';').Trim();
  if(!Regex.IsMatch(p.AppId??"",@"^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{1,52}$"))throw new Exception("Profile app_id is not a valid SDK application id");
  if(string.IsNullOrWhiteSpace(p.Model))throw new Exception("Profile model is empty");return p;}
 static Dictionary<string,string> PrdInfo(){var values=new Dictionary<string,string>(StringComparer.Ordinal);try{foreach(var line in File.ReadAllLines("/etc/prd_info.ini")){int split=line.IndexOf('=');if(split<1)continue;var name=line.Substring(0,split).Trim();if(name!="Model"&&name!="Version")continue;values[name]=line.Substring(split+1).Trim().TrimEnd(';').Trim();}}catch(Exception e) when (e is IOException||e is UnauthorizedAccessException){}return values;}
 // Query prints the exact lines to copy into the private profile; apply and restore require them to match.
 static void ReportFirmware(Profile p,bool exact){
  var prd=PrdInfo();string model=null,version=null;prd.TryGetValue("Model",out model);prd.TryGetValue("Version",out version);
  Console.WriteLine("PROFILE_MODEL="+(model??"<absent>"));Console.WriteLine("PROFILE_VERSION="+(version??"<absent>"));
  if(!exact)return;
  if(string.IsNullOrWhiteSpace(p.Version))throw new Exception("Profile version is empty; run query and copy PROFILE_VERSION");
  if(!string.Equals(model,p.Model,StringComparison.Ordinal))throw new Exception("Model in /etc/prd_info.ini is "+(model??"<absent>")+"; the profile expects "+p.Model+". Run query and copy PROFILE_MODEL, or stop if the public API and /etc/prd_info.ini disagree");
  if(!string.Equals(version,p.Version,StringComparison.Ordinal))throw new Exception("Unexpected firmware: "+(version??"<absent>"));}
 static void CheckSnapshot(Snapshot s,Profile p){
  if(s==null||string.IsNullOrWhiteSpace(s.Home)||s.Strings==null||s.Strings.Count!=Keys.Length||(s.Autostart!=0&&s.Autostart!=1))throw new Exception("Invalid original snapshot");
  foreach(var k in Keys)if(!s.Strings.ContainsKey(k)||string.IsNullOrWhiteSpace(s.Strings[k]))throw new Exception("Missing original setting: "+k);
  // A capture taken after apply would make restore a no-op that looks successful.
  if(s.Home==p.AppId)throw new Exception("Original snapshot names the launcher; capture the pre-change state instead");
  // Older baselines have no provenance fields; when present they must belong to this profile.
  if(!string.IsNullOrEmpty(s.Model)&&s.Model!=p.Model)throw new Exception("Original snapshot belongs to model "+s.Model);
  if(!string.IsNullOrEmpty(s.AppId)&&s.AppId!=p.AppId)throw new Exception("Original snapshot belongs to application "+s.AppId);}
 // Restore may only overwrite values this baseline explains: its own captured value, or the
 // launcher value this profile's apply produces. Anything else is another change, or another TV's
 // baseline, and must be reviewed rather than written over.
 static void CheckRecoverable(Snapshot live,Snapshot original,Profile p){
  var unexplained=new List<string>();
  void Check(string name,string have,string captured,string derived){if(have!=captured&&have!=derived)unexplained.Add(name+"="+have);}
  Check("operation/main",live.Home,original.Home,p.AppId);
  foreach(var k in Keys)if(k!="db/first_screen/type")Check(k,live.Strings[k],original.Strings[k],Array.IndexOf(Derived,k)>=0?p.AppId:null);
  Check(AutoKey,live.Autostart.ToString(),original.Autostart.ToString(),"1");
  if(live.Strings["db/first_screen/type"]!=original.Strings["db/first_screen/type"])Console.Error.WriteLine("Note: db/first_screen/type changed since the snapshot; restore puts the captured value back.");
  if(unexplained.Count>0)throw new Exception("Live state matches neither the snapshot nor this profile's applied state: "+string.Join(", ",unexplained)+"; restore would overwrite a value the baseline does not explain. Stop for review instead of restoring");}
 // Every value restore writes must match exactly, except the two the firmware re-derives; report
 // those instead of failing, because only the firmware can settle them.
 static void VerifyRestore(Snapshot expected,Snapshot actual){
  var written=new List<string>();var pending=new List<string>();
  if(actual.Home!=expected.Home)written.Add("operation/main="+actual.Home);
  if(actual.Strings["db/appfw/home_appid"]!=expected.Strings["db/appfw/home_appid"])written.Add("db/appfw/home_appid="+actual.Strings["db/appfw/home_appid"]);
  if(actual.Strings["db/first_screen/type"]!=expected.Strings["db/first_screen/type"])written.Add("db/first_screen/type="+actual.Strings["db/first_screen/type"]);
  if(actual.Autostart!=expected.Autostart)written.Add(AutoKey+"="+actual.Autostart);
  foreach(var k in Derived)if(actual.Strings[k]!=expected.Strings[k])pending.Add(k+"="+actual.Strings[k]);
  if(written.Count>0)throw new Exception("Restore did not reach the captured values: "+string.Join(", ",written)+(pending.Count>0?" | firmware-derived values still differ: "+string.Join(", ",pending):""));
  if(pending.Count>0)Console.WriteLine("CLEANFRAME_HOME_RESTORE_PENDING="+string.Join(", ",pending));}
 static int Main(string[] args){
  try{
   if(IntPtr.Size!=4||getuid()!=901)throw new Exception("Expected 32-bit SDK user, no root");
   if(args.Length<2)throw new Exception("Use query PROFILE, apply SNAPSHOT PROFILE, or restore SNAPSHOT PROFILE");
   var mode=args[0];
   var profilePath=(mode=="query"&&args.Length==2)?args[1]:((mode=="apply"||mode=="restore")&&args.Length==3)?args[2]:null;
   if(profilePath==null)throw new Exception("Use query PROFILE, apply SNAPSHOT PROFILE, or restore SNAPSHOT PROFILE");
   var profile=ReadProfile(profilePath);
   if(mode=="query"){ReportFirmware(profile,false);var current=Query(profile);var dir=PackageDir(profile.AppId);Console.WriteLine("TARGET_PACKAGE_DIR="+dir);Console.WriteLine("TARGET_PACKAGE_PRESENT="+(Directory.Exists(dir)?"true":"false"));Console.WriteLine("BOOT_SUPPORTED="+(current.BootSupport==1?"true":current.BootSupport==0?"false":"unknown"));Console.WriteLine("CLEANFRAME_HOME_JSON="+JsonSerializer.Serialize(current));return 0;}
   ReportFirmware(profile,true);
   var original=JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(args[1]));CheckSnapshot(original,profile);var before=Query(profile);
   if(mode=="restore"){CheckRecoverable(before,original,profile);Restore(original);var restored=Query(profile);VerifyRestore(original,restored);Console.WriteLine("CLEANFRAME_HOME_RESTORED="+JsonSerializer.Serialize(restored));return 0;}
   if(before.Home!=original.Home&&before.Home!=profile.AppId)throw new Exception("Home changed since snapshot; stop for review");
   if(before.Home==profile.AppId&&before.Strings["db/appfw/home_appid"]==profile.AppId&&before.Autostart==1)throw new Exception("Already applied; restore before applying again");
   if(before.Home!=original.Home||before.Autostart!=original.Autostart)throw new Exception("Configuration changed since snapshot");
   foreach(var k in Keys)if(before.Strings[k]!=original.Strings[k])throw new Exception("Setting changed since snapshot: "+k);
   if(!Directory.Exists(PackageDir(profile.AppId))||before.BootSupport!=1)throw new Exception("Installed launcher is not eligible for boot");
   try{SetHome(profile.AppId);SetString("db/appfw/home_appid",profile.AppId);SetAuto(1);Console.WriteLine("CLEANFRAME_HOME_APPLIED="+JsonSerializer.Serialize(Query(profile)));}
   catch(Exception error){try{Restore(original);}catch(Exception rollback){throw new Exception("Apply failed and automatic restore failed: "+rollback.Message+" | apply error: "+error.Message);}Console.Error.WriteLine("Original Home/startup values restored after a failed apply");throw;}
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}
 }
}
