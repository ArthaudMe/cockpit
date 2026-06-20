const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onDatasourceData: (callback) => {
    ipcRenderer.on("datasource-data", (_event, data) => callback(data));
  },
  onNotifications: (callback) => {
    ipcRenderer.on("notifications-update", (_event, data) => callback(data));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
