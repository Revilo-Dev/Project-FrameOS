import { TARGET } from '../frameos-controller/controller.mjs';
export { TARGET };
export const MAIN = 'operation:http://tizen.org/appcontrol/operation/main';
export const HOME = 'db/appfw/home_appid';
export const FIELDS = Object.freeze({
  [MAIN]: 'string', [HOME]: 'string',
  'db/appfw/startup_appid': 'string', 'db/appfw/booting_appid_backup': 'string',
  'db/first_screen/type': 'string', 'db/menu/smart_hub/ontvsetting/auto_start': 'int',
});
export const LIBRARIES = Object.freeze({
  'libbundle.so.0': ['bundle_create', 'bundle_free'],
  'libaul.so.0': ['aul_svc_set_operation', 'aul_get_default_app'],
  'libvconf.so.0': ['vconf_get_str', 'vconf_get_int', 'vconf_set_str', 'vconf_set_int'],
  'libapp-context-manager-common.so': ['util_is_appbooting_supported_webapp_byappid'],
  'libcapi-appfw-app-operation-tv.so.0': ['app_operation_set_current_app'],
});
export const REFERENCES = Object.freeze({
  arn0: { revision: '28b0f4d4a2e59ded29b5bf93a8eab99c802c7483', query: 'native/Query.cs', control: 'native/Control.cs', runtimeTarget: 'netcoreapp3.1', referenceFirmware: 'T-PTMDEUC-1720.7' },
  cleanFrame: { revision: 'fa537d1892b71d2de2bf94c24cbff3812e9f70d5', control: 'scripts/native-home/Control.cs', runtimeTarget: 'net6.0', referenceFirmware: 'T-PTMDUABC-0090-2130.0' },
});
