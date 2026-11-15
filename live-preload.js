const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveDesk', {
  returnToWorkspace: () => ipcRenderer.invoke('live:return-workspace'),
  getState: () => ipcRenderer.invoke('live:state'),
  getDesktopSources: () => ipcRenderer.invoke('live:desktop-sources'),
  setDesktopSource: (sourceId) => ipcRenderer.invoke('live:set-desktop-source', sourceId),
  classifySpeaker: (samples, sourceKey) => ipcRenderer.invoke('live:classify-speaker', samples, sourceKey),
  getSpeakerStatus: (sourceKey) => ipcRenderer.invoke('live:speaker-status', sourceKey),
  calibrateSpeaker: (windows, sourceKey) => ipcRenderer.invoke('live:calibrate-speaker', windows, sourceKey),
  verifySpeaker: (windows, sourceKey) => ipcRenderer.invoke('live:verify-speaker', windows, sourceKey),
  setState: (patch) => ipcRenderer.send('live:set-state', patch),
  openOutput: () => ipcRenderer.invoke('live:open-output'),
  closeOutput: () => ipcRenderer.invoke('live:close-output'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('live:state', listener);
    return () => ipcRenderer.removeListener('live:state', listener);
  }
});
