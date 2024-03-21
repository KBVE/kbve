import React from 'react';
import { ImageBackground, Image, StyleSheet, StatusBar, Dimensions, Platform, Linking } from 'react-native';
import { Block, Button, Text, theme } from 'galio-framework';
import { Images, argonTheme } from '../constants/';
import { HeaderHeight } from "../constants/utils";
import { StackNavigationProp } from '@react-navigation/stack';


// Define the types for your navigation params
type RootStackParamList = {
  Pro: undefined; // Add other screens as needed
};

// Define the props for the Pro screen
interface ProProps {
  navigation: StackNavigationProp<RootStackParamList, 'Pro'>;
}

const { height, width } = Dimensions.get('screen');



export default class Pro extends React.Component<ProProps> {
  render() {
    const { navigation } = this.props;

    return (
      <Block flex style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Block flex>
          <ImageBackground
            source={Images.Pro}
            style={{ flex: 1, height: height, width, zIndex: 1 }}
          />
          <Block space="between" style={styles.padded}>
            <Block>
              <Block>
                <Image source={Images.ArgonLogo}
                  style={{ marginBottom: argonTheme.SIZES.BASE * 1.5 }}/>
              </Block>
              <Block >
                <Block>
                  <Text color="white" size={60}>Argon</Text>
                </Block>
                <Block>
                  <Text color="white" size={60}>Design</Text>
                </Block>
                <Block row>
                  <Text color="white" size={60}>System</Text>
                  <Block middle style={styles.pro}>
                    <Text size={16} color="white">PRO</Text>
                  </Block>
                </Block>
              </Block>
              <Text size={16} color='rgba(255,255,255,0.6)' style={{ marginTop: 35 }}>
                Take advantage of all the features and screens made upon Galio Design System, coded on React Native for both.
              </Text>
              <Block row style={{ marginTop: argonTheme.SIZES.BASE * 1.5, marginBottom: argonTheme.SIZES.BASE * 4 }}>
                <Image
                  source={Images.iOSLogo}
                  style={{ height: 38, width: 82, marginRight: argonTheme.SIZES.BASE * 1.5 }} />
                <Image
                  source={Images.androidLogo}
                  style={{ height: 38, width: 140 }} />
              </Block>
              <Button
                shadowless
                style={styles.button}
                color={argonTheme.COLORS.INFO}
                onPress={() => Linking.openURL('https://www.creative-tim.com/product/argon-pro-react-native').catch((err) => console.error('An error occurred', err))}>
                <Text bold color={argonTheme.COLORS.WHITE}>BUY NOW</Text>
              </Button>
            </Block>
          </Block>
        </Block>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: argonTheme.COLORS.BLACK,
    marginTop: Platform.OS === 'android' ? -HeaderHeight : 0,
  },
  padded: {
    paddingHorizontal: argonTheme.SIZES.BASE * 2,
    zIndex: 3,
    position: 'absolute',
    bottom: Platform.OS === 'android' ? argonTheme.SIZES.BASE * 2 : argonTheme.SIZES.BASE * 3,
  },
  button: {
    width: width - argonTheme.SIZES.BASE * 4,
    height: argonTheme.SIZES.BASE * 3,
    shadowRadius: 0,
    shadowOpacity: 0,
  },
  pro: {
    backgroundColor: argonTheme.COLORS.INFO,
    paddingHorizontal: 8,
    marginLeft: 3,
    borderRadius: 4,
    height: 22,
    marginTop: 15
  },
  gradient: {
    zIndex: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 66,
  },
});
