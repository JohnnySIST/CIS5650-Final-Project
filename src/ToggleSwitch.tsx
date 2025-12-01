import React, { useState } from 'react';
import Box from '@mui/material/Box';

interface ToggleSwitchProps {
  labelOn?: string;
  labelOff?: string;
  defaultChecked?: boolean;
  onToggle?: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ labelOn = 'On', labelOff = 'Off', defaultChecked = true, onToggle }) => {
  const [checked, setChecked] = useState(defaultChecked);

  const handleClick = () => {
    setChecked((prev) => {
      const next = !prev;
      if (onToggle) onToggle(next);
      return next;
    });
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 24,
        top: 80,
        zIndex: 1000,
        width: 170,
        height: 32,
        borderRadius: '16px',
        boxShadow: 2,
        display: 'flex',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      <Box
        sx={{
          flex: 1,
          background: !checked ? 'linear-gradient(90deg, #1976d2 60%, #2196f3 100%)' : '#eee',
          color: !checked ? '#fff' : '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontFamily: 'Montserrat, Inter, Roboto, Arial, sans-serif',
          fontSize: '1rem',
          transition: 'background 0.2s',
        }}
      >
        {labelOff}
      </Box>
      <Box
        sx={{
          flex: 1,
          background: checked ? 'linear-gradient(90deg, #1976d2 60%, #2196f3 100%)' : '#eee',
          color: checked ? '#fff' : '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontFamily: 'Montserrat, Inter, Roboto, Arial, sans-serif',
          fontSize: '1rem',
          transition: 'background 0.2s',
        }}
      >
        {labelOn}
      </Box>
    </Box>
  );
};

export default ToggleSwitch;
