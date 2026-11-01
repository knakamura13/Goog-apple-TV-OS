set -u
# Read-only survey for a new TV. The helper's query mode is the authoritative reader; the
# vconftool lines below are a read-only fallback for an uncertain state. Never use
# `vconftool set` on these keys: it corrupted the Home key's privilege fields on S90D 2130.
printf 'CLEANFRAME_HOME_INSPECT_BEGIN\n'
id
uname -m
sed -n '/^Version=/p;/^Model=/p' /etc/prd_info.ini
cat /etc/tizen-release
printf '\nBOOT\n'
cat /proc/sys/kernel/random/boot_id
printf '\nDOTNET\n'
ls -l /usr/bin/dotnet 2>/dev/null || true
ls -d /usr/share/dotnet/shared/Microsoft.NETCore.App/* 2>/dev/null || true
printf '\nHOME_PREFERENCES_READ_ONLY\n'
for k in db/appfw/home_appid db/appfw/startup_appid db/appfw/booting_appid_backup db/first_screen/type db/menu/smart_hub/ontvsetting/auto_start; do vconftool get "$k"; done
printf '\nNATIVE_LIBRARIES\n'
ls -l /usr/lib/libapp-context-manager-common.so /usr/lib/libcapi-appfw-app-operation-tv.so.0 /usr/lib/libvconf.so.0 /usr/lib/libaul.so.0 /usr/lib/libbundle.so.0 2>/dev/null || true
printf 'CLEANFRAME_HOME_EXIT=0\n'
printf 'CLEANFRAME_HOME_INSPECT_END\n'
