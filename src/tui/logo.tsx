import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

export const logoLines = [
  '   ____                   ______          __     __ __ ',
  '  / __ \\____  ___  ____ / ____/___  ____/ /__  / //_/',
  ' / / / / __ \\/ _ \\/ __ `/ /   / __ \\/ __  / _ \\/ ,<   ',
  '/ /_/ / /_/ /  __/ /_/ / /___/ /_/ / /_/ /  __/ /| |  ',
  '\\____/ .___/\\___/\\__,_/\\____/\\____/\\__,_/\\___/_/ |_|  ',
  '    /_/                    T E R M I N A L   A G E N T',
];

const frames = ['◐', '◓', '◑', '◒'];

export function Splash({ repository }: { repository: string }): React.ReactNode {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => current + 1), 90);
    return () => clearInterval(timer);
  }, []);
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box flexDirection="column">
        {logoLines.map((line, index) => (
          <Text
            key={line}
            bold
            color={index < 2 ? 'cyan' : index < 5 ? 'blue' : 'magenta'}
          >
            {line}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{frames[frame % frames.length]} </Text>
        <Text>Warming tools, context, providers, and MCP</Text>
      </Box>
      <Text dimColor>{repository}</Text>
    </Box>
  );
}
