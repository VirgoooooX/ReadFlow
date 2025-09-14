import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as SimpleIcons from 'simple-icons';

interface BrandIconProps {
  brand: string;
  size?: number;
  color?: string;
}

const BrandIcon: React.FC<BrandIconProps> = ({ brand, size = 24, color = '#000000' }) => {
  // 品牌名称映射
  const brandMapping: { [key: string]: string } = {
    'openai': 'openai',
    'anthropic': 'anthropic',
    'google': 'google',
    'local': 'docker', // 使用Docker图标代表本地部署
    'custom': 'json' // 使用JSON图标代表自定义API
  };

  const iconName = brandMapping[brand];
  
  if (!iconName) {
    return <View style={{ width: size, height: size }} />;
  }

  try {
    // 获取Simple Icons中的图标数据
    const iconData = (SimpleIcons as any)[`si${iconName.charAt(0).toUpperCase() + iconName.slice(1)}`];
    
    if (!iconData) {
      return <View style={{ width: size, height: size }} />;
    }

    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path d={iconData.path} />
      </Svg>
    );
  } catch (error) {
    console.warn(`Brand icon not found: ${brand}`);
    return <View style={{ width: size, height: size }} />;
  }
};

export default BrandIcon;