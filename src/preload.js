// Puente seguro entre las ventanas y el proceso principal: sólo canales conocidos.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'state:get',
  'stats:week',
  'config:update',
  'session:start',
  'session:stop',
  'pause',
  'resume',
  'sprint:cancel',
  'break:end',
  'coach:open',
  'coach:context',
  'coach:answer',
  'coach:allow',
  'coach:back',
  'coach:close',
  'coach:sprint',
  'coach:break',
  'coach:checkin',
  'coach:ai',
  'ai:setKey',
  'camera:show',
  'camera:hide',
  'camera:config',
  'camera:baselines',
  'toast:context',
  'toast:back',
  'toast:dismiss',
  'toast:allow',
  'toast:sprint',
  'toast:coach',
  'toast:tell',
  'toast:analyze',
  'toast:checkin',
  'toast:reward',
  'toast:step',
  'toast:busy',
  'toast:resize',
  'voice:transcribe',
  'voice:status',
  'voice:prepare',
  'mic:ensure',
  'perm:status',
  'perm:request',
]);
const EVENTS = new Set(['state', 'panel:tab', 'coach:context', 'vision:preview', 'vision:config', 'vision:active', 'vision:engine', 'toast:update', 'voice:progress']);

contextBridge.exposeInMainWorld('foco', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) throw new Error(`Canal no permitido: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, cb) {
    if (!EVENTS.has(channel)) throw new Error(`Evento no permitido: ${channel}`);
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  sendAttention(data) {
    ipcRenderer.send('attention', data);
  },
});
