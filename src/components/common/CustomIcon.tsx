import React from 'react';
import * as LucideIcons from 'lucide-react-native';

interface CustomIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const CustomIcon: React.FC<CustomIconProps> = ({
  name,
  size = 20,
  color = '#FFFFFF',
  strokeWidth = 2,
}) => {
  // @ts-ignore
  const IconComponent = LucideIcons[name] || LucideIcons.CircleHelp || LucideIcons.DollarSign;
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
};
