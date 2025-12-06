import React, { useCallback, useEffect, useState } from "react";
import WosCanvas from "./WosCanvas";
import FpsBadge from "./FpsBadge";
import ToggleSwitch from "./ToggleSwitch";

export default function App() {
  const [fps, setFps] = useState(0);
  const [simEnabled, setSimEnabled] = useState(true);

  const fpsCallback = useCallback((fps: number) => {
    setFps(fps);
  }, []);

  return (
    <>
      <WosCanvas fpsCallback={fpsCallback} simulationEnabled={simEnabled} />
      <FpsBadge fps={fps} />
      <ToggleSwitch labelOn="Sim On" labelOff="Sim Off" onToggle={setSimEnabled} />
    </>
  );
}
