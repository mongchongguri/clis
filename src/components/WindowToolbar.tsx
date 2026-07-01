import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

export function WindowToolbar() {
  const appWindow = getCurrentWindow();

  const toggleMaximize = async (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    await appWindow.toggleMaximize();
  };

  return (
    <header
      className="app-toolbar"
      data-tauri-drag-region
      onDoubleClick={toggleMaximize}
    >
      <div className="window-drag-surface" data-tauri-drag-region />
      <div className="window-right">
        <div className="window-controls">
          <button
            className="window-control minimize"
            onClick={() => appWindow.minimize()}
            title="Minimize"
            aria-label="Minimize"
          />
          <button
            className="window-control maximize"
            onClick={() => appWindow.toggleMaximize()}
            title="Maximize"
            aria-label="Maximize"
          />
          <button
            className="window-control close"
            onClick={() => appWindow.close()}
            title="Close"
            aria-label="Close"
          />
        </div>
      </div>
    </header>
  );
}
