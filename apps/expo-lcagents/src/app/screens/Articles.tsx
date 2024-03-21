//galio
import { Block, Text, theme } from "galio-framework";
import {
  Dimensions,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  
} from "react-native";
//argon
import { Images, argonTheme, articles } from "../constants/";

import { Card } from "../components/";
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';


import React from "react";

type ArticlesParamList = {
  Pro: { product: any }; // Replace any with a more specific type as needed
  Home: undefined;
};

type ArticlesScreenNavigationProp = StackNavigationProp<ArticlesParamList, 'Pro'>;

interface ArticlesProps {
  navigation: ArticlesScreenNavigationProp;
}

type Category = {
  title: string;
  description: string;
  image: string;
  price: string;
};

const { width } = Dimensions.get("screen");

const thumbMeasure = (width - 48 - 32) / 3;
const cardWidth = width - argonTheme.SIZES.BASE * 2;
const categories: Category[] = [
  {
    title: "Music Album",
    description:
      "Rock music is a genre of popular music. It developed during and after the 1960s in the United Kingdom.",
    image:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?fit=crop&w=840&q=80",
    price: "$125",
  },
  {
    title: "Events",
    description:
      "Rock music is a genre of popular music. It developed during and after the 1960s in the United Kingdom.",
    image:
      "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?fit=crop&w=840&q=80",
    price: "$35",
  },
];

class Articles extends React.Component<ArticlesProps> {
  renderProduct = (item: Category, index: number) => {
    const { navigation } = this.props;

    return (
      <TouchableWithoutFeedback
        style={{ zIndex: 3 }}
        key={`product-${item.title}`}
        onPress={() => navigation.navigate("Pro", { product: item })}
      >
        <Block center style={styles.productItem}>
          <Image
            resizeMode="cover"
            style={styles.productImage}
            source={{ uri: item.image }}
          />
          <Block center style={{ paddingHorizontal: argonTheme.SIZES.BASE }}>
            <Text
              center
              size={16}
              color={argonTheme.COLORS.MUTED}
              style={styles.productPrice}
            >
              {item.price}
            </Text>
            <Text center size={34}>
              {item.title}
            </Text>
            <Text
              center
              size={16}
              color={argonTheme.COLORS.MUTED}
              style={styles.productDescription}
            >
              {item.description}
            </Text>
          </Block>
        </Block>
      </TouchableWithoutFeedback>
    );
  };

  renderCards = () => {
    return (
      <Block flex style={styles.group}>
        <Text bold size={16} style={styles.title}>
          Cards
        </Text>
        <Block flex>
          <Block style={{ paddingHorizontal: argonTheme.SIZES.BASE }}>
            <Card item={articles[0]} horizontal />
            <Block flex row>
              <Card
                item={articles[1]}
                style={{ marginRight: argonTheme.SIZES.BASE }}
              />
              <Card item={articles[2]} />
            </Block>
            <Card item={articles[4]} full />
            <Block flex card shadow style={styles.category}>
              <ImageBackground
                source={{ uri: Images.Products["View article"] }}
                style={[
                  styles.imageBlock,
                  { width: width - argonTheme.SIZES.BASE * 2, height: 252 },
                ]}
                imageStyle={{
                  width: width - argonTheme.SIZES.BASE * 2,
                  height: 252,
                }}
              >
                <Block style={styles.categoryTitle}>
                  <Text size={18} bold color={argonTheme.COLORS.WHITE}>
                    View article
                  </Text>
                </Block>
              </ImageBackground>
            </Block>
          </Block>
          <Block flex style={{ marginTop: argonTheme.SIZES.BASE / 2 }}>
            <ScrollView
              horizontal={true}
              pagingEnabled={true}
              decelerationRate={0}
              scrollEventThrottle={16}
              snapToAlignment="center"
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + argonTheme.SIZES.BASE * 0.375}
              contentContainerStyle={{
                paddingHorizontal: argonTheme.SIZES.BASE / 2,
              }}
            >
              {categories &&
                categories.map((item, index) =>
                  this.renderProduct(item, index)
                )}
            </ScrollView>
          </Block>
        </Block>
      </Block>
    );
  };

  renderAlbum = () => {
    const { navigation } = this.props;

    return (
      <Block
        flex
        style={[styles.group, { paddingBottom: argonTheme.SIZES.BASE * 5 }]}
      >
        <Text bold size={16} style={styles.title}>
          Album
        </Text>
        <Block style={{ marginHorizontal: argonTheme.SIZES.BASE * 2 }}>
          <Block flex right>
            <Text
              size={12}
              color={argonTheme.COLORS.PRIMARY}
              onPress={() => navigation.navigate("Home")}
            >
              View All
            </Text>
          </Block>
          <Block
            row
            space="between"
            style={{ marginTop: argonTheme.SIZES.BASE, flexWrap: "wrap" }}
          >
            {Images.Viewed.map((img, index) => (
              <Block key={`viewed-${img}`} style={styles.shadow}>
                <Image
                  resizeMode="cover"
                  source={{ uri: img }}
                  style={styles.albumThumb}
                />
              </Block>
            ))}
          </Block>
        </Block>
      </Block>
    );
  };

  render() {
    return (
      <Block flex center>
        <ScrollView showsVerticalScrollIndicator={false}>
          {this.renderCards()}
          {this.renderAlbum()}
        </ScrollView>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  title: {
    paddingBottom: argonTheme.SIZES.BASE,
    paddingHorizontal: argonTheme.SIZES.BASE * 2,
    marginTop: 22,
    color: argonTheme.COLORS.HEADER,
  },
  group: {
    paddingTop: argonTheme.SIZES.BASE,
  },
  albumThumb: {
    borderRadius: 4,
    marginVertical: 4,
    alignSelf: "center",
    width: thumbMeasure,
    height: thumbMeasure,
  },
  category: {
    backgroundColor: argonTheme.COLORS.WHITE,
    marginVertical: argonTheme.SIZES.BASE / 2,
    borderWidth: 0,
  },
  categoryTitle: {
    height: "100%",
    paddingHorizontal: argonTheme.SIZES.BASE,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageBlock: {
    overflow: "hidden",
    borderRadius: 4,
  },
  productItem: {
    width: cardWidth - argonTheme.SIZES.BASE * 2,
    marginHorizontal: argonTheme.SIZES.BASE,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 10,
    shadowOpacity: 0.2,
  },
  productImage: {
    width: cardWidth - argonTheme.SIZES.BASE,
    height: cardWidth - argonTheme.SIZES.BASE,
    borderRadius: 3,
  },
  productPrice: {
    paddingTop: argonTheme.SIZES.BASE,
    paddingBottom: argonTheme.SIZES.BASE / 2,
  },
  productDescription: {
    paddingTop: argonTheme.SIZES.BASE,
    // paddingBottom: theme.SIZES.BASE * 2,
  },
  
  shadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3, // This is for Android
  },
});

export default Articles;
