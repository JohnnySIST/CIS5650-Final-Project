import React from "react";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";

export interface TraceWidthSliderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label?: string;
  style?: React.CSSProperties;
}

const TraceWidthSlider: React.FC<TraceWidthSliderProps> = ({
  value,
  min = 1,
  max = 50,
  onChange,
  label = "Trace Width:",
  style,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, ...style }}>
      <Typography variant="body1" sx={{ minWidth: 80 }}>
        {label}
      </Typography>
      <Slider
        id="trace-width-slider"
        min={min}
        max={max}
        value={value}
        size="small"
        sx={{ width: 120, mx: 2 }}
        onChange={(_, v) => onChange(Number(v))}
        aria-label={label}
      />
      <TextField
        id="trace-width-input"
        type="number"
        size="small"
        slotProps={{
          htmlInput: {
            min,
            max,
            style: {
              textAlign: "center",
              fontWeight: 700,
              fontFamily: "Montserrat, Inter, Roboto, Arial, sans-serif",
              fontSize: "1rem",
              color: "#fff",
              padding: "4px 0",
            },
          },
        }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        sx={{
          width: 80,
          height: 32,
          background: "none",
          display: "flex",
          alignItems: "center",
          ml: -3,
        }}
        variant="standard"
      />
    </div>
  );
};

export default TraceWidthSlider;
