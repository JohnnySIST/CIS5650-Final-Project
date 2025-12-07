import React, { useState } from "react";
import Button from "@mui/material/Button";

function ToggleSwitch({
  labelOn = "On",
  labelOff = "Off",
  defaultChecked = true,
  onToggle,
}: {
  labelOn?: string;
  labelOff?: string;
  defaultChecked?: boolean;
  onToggle?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  const handleClick = () => {
    setChecked((prev) => {
      const next = !prev;
      if (onToggle) onToggle(next);
      return next;
    });
  };

  return (
    <Button
      variant="contained"
      color={checked ? "primary" : "inherit"}
      sx={{
        position: "absolute",
        right: 32,
        top: 70,
        zIndex: 1000,
        width: 120,
        height: 40,
      }}
      onClick={handleClick}
    >
      {checked ? labelOn : labelOff}
    </Button>
  );
}

export default ToggleSwitch;
