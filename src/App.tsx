import React, { useState } from "react";
import WosCanvas from "./WosCanvas";
import FpsBadge from "./ui/FpsBadge";
import ToggleSwitch from "./ui/ToggleSwitch";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#2196f3",
    },
  },
  typography: {
    fontFamily: "Montserrat, Inter, Roboto, Arial, sans-serif",
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    fontSize: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontFamily: "Montserrat, Inter, Roboto, Arial, sans-serif",
          fontSize: "1rem",
          borderRadius: "16px",
          boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
          width: 120,
          height: 40,
          textTransform: "none",
          lineHeight: 1.2,
        },
        containedPrimary: {
          backgroundColor: "#1976d2",
          color: "#fff",
          "&:hover": {
            backgroundColor: "#2196f3",
          },
        },
        containedInherit: {
          backgroundColor: "#5a6d85",
          color: "#fff",
          "&:hover": {
            backgroundColor: "#7a8da5",
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: "#bbbbbbff",
        },
      },
    },
  },
});

export default function App() {
  const [fps, setFps] = useState(0);
  const [simEnabled, setSimEnabled] = useState(true);

  function fpsCallback(fps: number) {
    setFps(fps);
  }

  return (
    <ThemeProvider theme={theme}>
      <WosCanvas fpsCallback={fpsCallback} simulationEnabled={simEnabled} />
      <FpsBadge fps={fps} />
      <ToggleSwitch
        labelOn="Sim On"
        labelOff="Sim Off"
        onToggle={setSimEnabled}
      />
    </ThemeProvider>
  );
}
