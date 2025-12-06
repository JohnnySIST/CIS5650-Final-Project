import React, { useEffect, useState } from "react";
import WosCanvas from "./WosCanvas";
import FpsBadge from "./FpsBadge";
import ToggleSwitch from "./ToggleSwitch";

export default function App() {
  const [fps, setFps] = useState(0);

  function fpsCallback(fps: number) {
    setFps(fps);
  }

  return (
    <>
      <WosCanvas fpsCallback={fpsCallback} />
      <FpsBadge fps={fps} />
      <ToggleSwitch labelOn="Sim On" labelOff="Sim Off" />
    </>
  );
}
