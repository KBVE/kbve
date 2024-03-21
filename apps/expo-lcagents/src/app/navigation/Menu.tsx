import { Block, Text } from "galio-framework";
import { Image, ScrollView, StyleSheet, ImageSourcePropType } from "react-native";
import { useNavigation } from '@react-navigation/native';

import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { StackNavigationProp } from '@react-navigation/stack';

import { DrawerItem as DrawerCustomItem } from "../components";
import Images from "../constants/Images";
import React from "react";

import argonTheme, { COLORS, SIZES } from '../constants/Theme';

interface CustomDrawerContentProps extends DrawerContentComponentProps {
  profile?: ImageSourcePropType; // Define a more specific type if possible
  focused?: boolean;
  drawerPosition?: any;
}


type MyStackParamList = {
  Home: undefined;
  Profile: undefined;
  Account: undefined;
  Elements: undefined;
  Articles: undefined;
  // add other screens here
};

const CustomDrawerContent: React.FC<CustomDrawerContentProps> = ({
  drawerPosition,
  navigation,
  profile,
  focused,
  state,
  ...rest
}) => {
  
  const screens = ["Home", "Profile", "Account", "Elements", "Articles"];
  return (
    <Block
      style={styles.container}
      forceInset={{ top: "always", horizontal: "never" }}
    >
      <Block flex={0.06} style={styles.header}>
        <Image style={styles.logo} source={Images.Logo} />
      </Block>
      <Block flex style={{ paddingLeft: 8, paddingRight: 14 }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {screens.map((item, index) => {
            return (
              <DrawerCustomItem
                title={item}
                key={index}
                navigation={navigation}
                focused={state.index === index ? true : false}
              />
            );
          })}
          <Block
            flex
            style={{ marginTop: 24, marginVertical: 8, paddingHorizontal: 8 }}
          >
            <Block
              style={{
                borderColor: "rgba(0,0,0,0.2)",
                width: "100%",
                borderWidth: StyleSheet.hairlineWidth,
              }}
            />
            <Text color="#8898AA" style={{ marginTop: 16, marginLeft: 8 }}>
              DOCUMENTATION
            </Text>
          </Block>
          <DrawerCustomItem title="Getting Started" navigation={navigation} />
        </ScrollView>
      </Block>
    </Block>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: SIZES.BASE,
    paddingTop: SIZES.BASE * 3,
    justifyContent: "center",
  },
  logo: { // Example style, adjust as needed
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
});

export default CustomDrawerContent;
