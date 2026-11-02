set -u
printf 'CLEANFRAME_HOME_INSPECT_BEGIN\n'
/usr/bin/dotnet /home/owner/share/tmp/sdk_tools/CleanFrameHomeControl.dll restore /home/owner/share/tmp/sdk_tools/CleanFrameHomeOriginal.json /home/owner/share/tmp/sdk_tools/CleanFrameHomeProfile.json
rc=$?
printf 'CLEANFRAME_HOME_EXIT=%s\n' "$rc"
printf 'CLEANFRAME_HOME_INSPECT_END\n'
exit "$rc"
