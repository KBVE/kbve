import React from 'react';
import { View, Text } from 'tamagui';
import { useColorScheme } from 'react-native';
import { TamaRegister } from '@kbve/expo-bbq';

const Projects = () => {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? 'cyan' : 'black'; 

  return (
    <View>
      <TamaRegister siteKey="5ba581fa-b6fc-4bb0-8222-02fcd6a59e35"  />

      <Text color={textColor}>
        This is the Project Page! TODO: Load Different Projects! Minor Change to Trigger Pipeline Round 5. Force Deployment! Side note, need to add a couple buttons here.
      </Text>
    </View>
  );
};

export default Projects;