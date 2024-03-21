import React from 'react';
import { StyleSheet, Image, TouchableWithoutFeedback, ViewStyle, ImageStyle } from 'react-native';
import PropTypes from 'prop-types';
import { Block, Text } from 'galio-framework';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants/Theme';

interface Item {
  image: string;
  title: string;
  cta: string;
}

interface CardProps {
  item: Item;
  horizontal?: boolean;
  full?: boolean;
  ctaColor?: string;
  style?: ViewStyle | ViewStyle[];
  imageStyle?: ImageStyle | ImageStyle[];
}

const Card: React.FC<CardProps> = ({ item, horizontal, full, style, ctaColor, imageStyle }) => {
  const navigation = useNavigation<any>();

  const imageStyles = [full ? styles.fullImage : styles.horizontalImage, imageStyle];
  const cardContainer = [styles.card, styles.shadow, style];
  const imgContainer = [
    styles.imageContainer,
    horizontal ? styles.horizontalStyles : styles.verticalStyles,
    styles.shadow,
  ];

  return (
    <Block row={horizontal} card flex style={cardContainer}>
      <TouchableWithoutFeedback onPress={() => navigation.navigate('Pro')}>
        <Block flex style={imgContainer}>
          <Image source={{ uri: item.image }} style={imageStyles} />
        </Block>
      </TouchableWithoutFeedback>
      <TouchableWithoutFeedback onPress={() => navigation.navigate('Pro')}>
        <Block flex space="between" style={styles.cardDescription}>
          <Text size={14} style={styles.cardTitle}>{item.title}</Text>
          <Text size={12} muted={!ctaColor} color={ctaColor || COLORS.ACTIVE} bold>{item.cta}</Text>
        </Block>
      </TouchableWithoutFeedback>
    </Block>
  );
};

Card.propTypes = {
  item: PropTypes.shape({
    image: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    cta: PropTypes.string.isRequired,
  }).isRequired,
  horizontal: PropTypes.bool,
  full: PropTypes.bool,
  ctaColor: PropTypes.string,
  style: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.arrayOf(PropTypes.object),
  ]),
  imageStyle: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.arrayOf(PropTypes.object),
  ]),
};


const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.WHITE, // Updated
    marginVertical: SIZES.BASE, // Updated
    borderWidth: 0,
    minHeight: 114,
    marginBottom: 16
  },
  cardTitle: {
    flex: 1,
    flexWrap: 'wrap',
    paddingBottom: 6
  },
  cardDescription: {
    padding: SIZES.BASE / 2 // Updated
  },
  imageContainer: {
    borderRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  horizontalImage: {
    height: 122,
    width: 'auto',
  },
  horizontalStyles: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  verticalStyles: {
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0
  },
  fullImage: {
    height: 215
  },
  shadow: {
    shadowColor: COLORS.BLACK, // Updated
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
    elevation: 2,
  },
});

export default Card;
