import React from "react";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";

interface FpsBadgeProps {
  fps: number;
}

const FpsBadge: React.FC<FpsBadgeProps> = ({ fps }) => (
  <Box
    sx={{
      position: "fixed",
      top: 24,
      left: 24,
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 120,
    }}
  >
    <Chip
      label={`FPS ${fps}`}
      color="primary"
      variant="filled"
      sx={{
        fontFamily: "Montserrat, Inter, Roboto, Arial, sans-serif",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(90deg, #1976d2 60%, #2196f3 100%)",
        boxShadow: 2,
        borderRadius: "16px",
      }}
    />
  </Box>
);

export default FpsBadge;
