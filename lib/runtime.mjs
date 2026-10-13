import { browserHandlers } from './browser-inspection.mjs';
import { artifactHandlers } from './browser-artifacts.mjs';
import { processHandlers } from './process-capture.mjs';
import { traceHandlers } from './browser-traces.mjs';
import { executionHandlers } from './browser-execution.mjs';
import { scenarioHandlers } from './browser-scenario.mjs';
import { nativeHandlers } from './process-native.mjs';
import { debuggerHandlers } from './process-debugger.mjs';
export { debuggerPrerequisite } from './process-debugger.mjs';

export const handlers={...browserHandlers,...artifactHandlers,...processHandlers,...traceHandlers,...executionHandlers,...scenarioHandlers,...nativeHandlers,...debuggerHandlers};
const proven=new Set(['capture_process_scenario','compare_process_captures','inspect_web_network_capture','list_browser_targets','inspect_web_page','observe_web_execution','inspect_web_event_listeners','analyze_web_bundle','capture_web_screenshot','compare_web_screenshots','export_web_scripts','trace_web_module_imports','trace_web_source_location','capture_browser_scenario','compare_web_captures','list_javascript_runtime_targets','observe_javascript_runtime','observe_native_ui','capture_native_ui_scenario','observe_web_session','discover_webmcp_tools','list_electron_targets','inspect_electron_page','capture_electron_scenario','observe_native_calls']);
export const capabilities=Object.fromEntries(Object.keys(handlers).map(operation=>[operation,{implemented:true,provider:operation.includes('native_ui')?'Windows UI Automation':operation==='observe_native_calls'?'BYO LLDB SB API':operation.includes('electron')?'Electron/CDP':operation.includes('process')?'PTY and local capture':operation.includes('runtime')?'V8 inspector':operation.startsWith('trace_web')||operation.startsWith('compare')||operation.startsWith('export')||operation==='inspect_web_network_capture'?'local artifact':'browser/CDP',validation:proven.has(operation)?'bounded synthetic fixture validated':'implemented; provider behavior not fixture-validated',coverage:'caller-selected scope; output limitations govern each result'}]));
